// Conversational Intake: KI-getriebener Chat-Flow zum Sammeln von
// Rechtsgebiet + Stammdaten + Sachverhalt + Datenschutz-Einwilligung.
//
// State-Modell: pro Turn senden wir die komplette Conversation + collected fields.
// Server-side stateless — wir kodieren den State in einem Cookie, kein Vendor-Lock-in.

import { callClaude, DEFAULT_MODEL, isAiConfigured } from './ai';
import { redactPii } from './pii_redact';

export type IntakeCollected = {
  vorname?: string;
  nachname?: string;
  email?: string;
  rechtsgebiet?: string;
  akten_typ_id?: string | null; // intern, vom Server gesetzt nach Match
  sachverhalt?: string;
  privacy_consent?: boolean;
};

export type IntakeTurn = {
  role: 'user' | 'assistant';
  content: string;
};

export type IntakeState = {
  slug: string;
  lang: 'de' | 'en';
  conversation: IntakeTurn[];
  collected: IntakeCollected;
  complete: boolean;
};

const MAX_TURNS = 16;

const SYSTEM_DE = (kanzleiName: string, rechtsgebiete: string[], allowOther: boolean) => `Du bist ein freundlicher Onboarding-Assistent für die Kanzlei ${kanzleiName}. Du sammelst in einem kurzen Gespräch (max. 6-8 Turns) folgende Informationen:

- rechtsgebiet (eines aus: ${rechtsgebiete.map((r) => `"${r}"`).join(', ')}${allowOther ? ', oder "Andere Angelegenheit"' : ''})
- vorname (Vorname des Mandanten)
- nachname (Nachname)
- email (gültige E-Mail-Adresse)
- sachverhalt (kurze Schilderung des Anliegens, mind. 30 Zeichen)
- privacy_consent (true wenn der Mandant Datenschutz/Widerrufsbelehrung akzeptiert)

Stelle JEWEILS NUR EINE Frage, in einem natürlichen Ton. Wenn der Mandant das Rechtsgebiet wählt, stelle 1-2 sinnvolle rechtsgebiet-spezifische Folgefragen zum Sachverhalt (z.B. bei Mietsache: "Geht es um Kündigung, Mietminderung, Nebenkosten?").

Antworte AUSSCHLIESSLICH im folgenden JSON-Format (kein Text außerhalb):
{
  "message": "<dein Text an den Mandant>",
  "collected": {<bereits gesammelte Felder, korrigiert/erweitert>},
  "next_field": "<welches Feld du als nächstes erfragst, oder 'confirm' wenn alles da ist, oder 'done' nach Bestätigung>",
  "complete": <true wenn alle Felder valide gesammelt UND der Mandant bestätigt hat>
}

PII (E-Mails, Telefon, IBAN) wird vor diesem Prompt teils mit Platzhaltern ersetzt — ignoriere die Platzhalter, der Server nutzt die Originalwerte.

Bei der Begrüßung (erste Nachricht ohne User-Input): stelle dich kurz vor und frage nach dem Rechtsgebiet (Liste anbieten).

Wenn alle Felder gesammelt sind, stelle eine letzte Bestätigungsfrage ("Soll ich Ihre Anfrage so an die Kanzlei senden?") mit next_field="confirm". Erst nach JA setze complete=true.`;

const SYSTEM_EN = (kanzleiName: string, rechtsgebiete: string[], allowOther: boolean) => `You are a friendly onboarding assistant for ${kanzleiName} (German law firm). In a short conversation (max 6-8 turns) you collect:

- rechtsgebiet (one of: ${rechtsgebiete.map((r) => `"${r}"`).join(', ')}${allowOther ? ', or "Other matter"' : ''})
- vorname (first name)
- nachname (last name)
- email (valid email address)
- sachverhalt (brief matter description, min 30 chars)
- privacy_consent (true when client accepts privacy/withdrawal terms)

Ask ONE question at a time, naturally. After legal area selection, ask 1-2 area-specific follow-ups about the matter.

Reply ONLY in this JSON format (no text outside):
{
  "message": "<your text to the client>",
  "collected": {<updated fields>},
  "next_field": "<next field name, or 'confirm', or 'done'>",
  "complete": <true only when all fields collected AND client confirmed>
}

PII (emails, phone, IBAN) may appear as placeholders — ignore them, server uses originals.

First turn (no user input): introduce yourself briefly and ask for the legal area (list options).

When all fields collected: ask a final confirmation ("Shall I send your request to the firm now?") with next_field="confirm". Only on YES set complete=true.`;

type ClaudeJsonResponse = {
  message?: string;
  collected?: Partial<IntakeCollected>;
  next_field?: string;
  complete?: boolean;
};

function tryParseJson(raw: string): ClaudeJsonResponse | null {
  // Erst direkter Parse, dann Fallback: erstes {…}-Block extrahieren.
  try { return JSON.parse(raw) as ClaudeJsonResponse; } catch { /* fallthrough */ }
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]) as ClaudeJsonResponse; } catch { return null; }
  }
  return null;
}

function mergeCollected(prev: IntakeCollected, patch: Partial<IntakeCollected>): IntakeCollected {
  const out: IntakeCollected = { ...prev };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null) continue;
    (out as Record<string, unknown>)[k] = v as unknown;
  }
  return out;
}

export async function runIntakeTurn(
  env: { ANTHROPIC_API_KEY?: string },
  args: {
    state: IntakeState;
    userInput: string | null; // null = initialer Turn (Begrüßung)
    kanzleiName: string;
    rechtsgebiete: string[];
    allowOther: boolean;
  },
): Promise<{ state: IntakeState; assistantMessage: string }> {
  if (!isAiConfigured(env)) {
    throw new Error('AI not configured');
  }

  const newConversation: IntakeTurn[] = [...args.state.conversation];
  if (args.userInput) {
    newConversation.push({ role: 'user', content: args.userInput });
  }

  // Trim auf letzte MAX_TURNS Turns
  const trimmed = newConversation.slice(-MAX_TURNS);

  // PII-Redaktion auf User-Inputs (für die Claude-Sicht)
  const messagesForClaude = trimmed.map((t) => ({
    role: t.role,
    content: t.role === 'user' ? redactPii(t.content).redacted : t.content,
  }));

  // Wenn das letzte Element ein User-Turn ist, gut.
  // Wenn die Conversation leer ist (allererster Turn), schicken wir einen Initial-User-Trigger.
  if (messagesForClaude.length === 0) {
    messagesForClaude.push({ role: 'user', content: '<<begin>>' });
  }

  const systemPrompt = args.state.lang === 'en'
    ? SYSTEM_EN(args.kanzleiName, args.rechtsgebiete, args.allowOther)
    : SYSTEM_DE(args.kanzleiName, args.rechtsgebiete, args.allowOther);

  const collectedHint = `\n\nBereits gesammelte Daten: ${JSON.stringify(args.state.collected)}`;
  const result = await callClaude(env, {
    model: DEFAULT_MODEL,
    system: systemPrompt + collectedHint,
    messages: messagesForClaude,
    maxTokens: 600,
    temperature: 0.4,
  });

  const parsed = tryParseJson(result.text);
  let assistantMessage: string;
  let nextCollected = args.state.collected;
  let complete = false;

  if (parsed && typeof parsed.message === 'string') {
    assistantMessage = parsed.message;
    if (parsed.collected) {
      // Nur Felder aus dem User-Input übernehmen, nicht aus Claude-Halluzinationen.
      // Heuristik: wir akzeptieren, weil Claude die User-Inputs strukturiert hat.
      nextCollected = mergeCollected(args.state.collected, parsed.collected);
    }
    complete = parsed.complete === true;
  } else {
    // Fallback: rohen Text als Assistent-Antwort verwenden, kein State-Update.
    assistantMessage = result.text || (args.state.lang === 'en'
      ? 'Sorry, I had trouble processing that. Could you rephrase?'
      : 'Entschuldigung, das konnte ich nicht verarbeiten. Können Sie es noch einmal anders formulieren?');
  }

  newConversation.push({ role: 'assistant', content: assistantMessage });

  // Beim Persistieren auf MAX_TURNS trimmen, damit das Cookie unter ~4KB bleibt.
  const persisted = newConversation.slice(-MAX_TURNS);

  return {
    state: {
      ...args.state,
      conversation: persisted,
      collected: nextCollected,
      complete,
    },
    assistantMessage,
  };
}

// --- State-Persistierung in Cookies (HTTP-only) ---

export const INTAKE_COOKIE = 'mandantor_intake';
const COOKIE_TTL_SECONDS = 60 * 30; // 30 Minuten

export function encodeState(state: IntakeState): string {
  const json = JSON.stringify(state);
  // Base64URL-Encode (Workers haben TextEncoder + btoa)
  const bytes = new TextEncoder().encode(json);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeState(raw: string | null | undefined): IntakeState | null {
  if (!raw) return null;
  try {
    const padded = raw.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((raw.length + 3) % 4);
    const bin = atob(padded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as Partial<IntakeState>;
    // Shape validieren: nur valide Strukturen weiterreichen.
    if (
      typeof parsed.slug !== 'string' ||
      (parsed.lang !== 'de' && parsed.lang !== 'en') ||
      !Array.isArray(parsed.conversation) ||
      typeof parsed.collected !== 'object' || parsed.collected === null
    ) return null;
    return {
      slug: parsed.slug,
      lang: parsed.lang,
      conversation: parsed.conversation.filter(
        (t) => t && typeof t === 'object'
          && (t.role === 'user' || t.role === 'assistant')
          && typeof t.content === 'string',
      ),
      collected: parsed.collected,
      complete: parsed.complete === true,
    };
  } catch {
    return null;
  }
}

export function cookieHeader(state: IntakeState | null): string {
  if (!state) {
    return `${INTAKE_COOKIE}=; Path=/o; Max-Age=0; HttpOnly; SameSite=Lax`;
  }
  return `${INTAKE_COOKIE}=${encodeState(state)}; Path=/o; Max-Age=${COOKIE_TTL_SECONDS}; HttpOnly; SameSite=Lax`;
}

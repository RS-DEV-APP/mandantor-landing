// Hochlevel-AI-Aktionen für den Mandantor-Akten-Workflow.
// Jede Aktion läuft den Input erst durch den PII-Redaktor und persistiert
// Token-Verbrauch zur Akten-Zeile (für Cost-Tracking & Audit).

import { callClaude, DEFAULT_MODEL, isAiConfigured, type ClaudeModel } from './ai';
import { redactPii } from './pii_redact';
import { appendAudit, type AuditContext } from './audit';
import { rebuildFts } from './search';

export type SentimentLabel = 'neutral' | 'frustrated' | 'urgent' | 'unclear';

const SENTIMENT_VALUES: SentimentLabel[] = ['neutral', 'frustrated', 'urgent', 'unclear'];

function parseSentiment(raw: string): SentimentLabel {
  const lower = raw.toLowerCase();
  for (const v of SENTIMENT_VALUES) {
    if (lower.includes(v)) return v;
  }
  return 'neutral';
}

const SYSTEM_PROMPT = `Du bist ein juristischer Assistent für eine deutsche Anwaltskanzlei. Du analysierst kurze Sachverhaltsschilderungen, die Mandant:innen über ein Onboarding-Formular eingereicht haben.

Antworte AUSSCHLIESSLICH im folgenden Format (keine Einleitung, kein Abschluss):

ZUSAMMENFASSUNG: <2-3 Sätze auf Deutsch, sachlich, ohne Wertungen, juristisch präzise. Nenne, falls erkennbar: Rechtsgebiet, beteiligte Parteien, Anlass, Anliegen des Mandanten.>
SENTIMENT: <einer von: neutral, frustrated, urgent, unclear>
ZUSTAND: <ein kurzer Hinweis auf Eilbedürftigkeit oder offene Punkte, nur wenn relevant; sonst leerlassen>

Verwende für SENTIMENT:
- "urgent" wenn Fristen, akute Bedrohungen oder Zwangsmaßnahmen genannt werden
- "frustrated" wenn deutlich Ärger, Wut oder Resignation transportiert wird
- "unclear" wenn der Sachverhalt zu vage oder widersprüchlich für eine Bewertung ist
- sonst "neutral"

PII (E-Mails, Telefonnummern, IBAN) wurden vor diesem Prompt durch Platzhalter wie [EMAIL_1] ersetzt — das ist beabsichtigt, ignoriere die Platzhalter in deiner Zusammenfassung.`;

export type AnalysisResult = {
  summary: string;
  sentiment: SentimentLabel;
  inputTokens: number;
  outputTokens: number;
  model: string;
};

function parseClaudeOutput(text: string): { summary: string; sentiment: SentimentLabel } {
  const summaryMatch = text.match(/ZUSAMMENFASSUNG:\s*([\s\S]*?)(?=\n\s*SENTIMENT:|$)/i);
  const sentimentMatch = text.match(/SENTIMENT:\s*([a-zA-Z]+)/i);
  const summary = (summaryMatch?.[1] ?? '').trim();
  const sentiment = parseSentiment(sentimentMatch?.[1] ?? '');
  return { summary, sentiment };
}

export async function analyzeSachverhalt(
  env: { ANTHROPIC_API_KEY?: string },
  text: string,
  model: ClaudeModel = DEFAULT_MODEL,
): Promise<AnalysisResult> {
  const { redacted } = redactPii(text.slice(0, 6000));
  const result = await callClaude(env, {
    model,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: redacted }],
    maxTokens: 400,
    temperature: 0.1,
  });
  const parsed = parseClaudeOutput(result.text);
  return {
    summary: parsed.summary || result.text.slice(0, 400),
    sentiment: parsed.sentiment,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    model: result.model,
  };
}

export async function analyzeAndPersist(
  db: D1Database,
  env: { ANTHROPIC_API_KEY?: string; SECRET_KEY: string },
  akteId: string,
  kanzleiId: string,
  text: string,
  ctx: AuditContext,
): Promise<AnalysisResult | null> {
  if (!isAiConfigured(env)) return null;
  if (!text || text.trim().length < 30) return null;

  let result: AnalysisResult;
  try {
    result = await analyzeSachverhalt(env, text);
  } catch (err) {
    console.error('ai analyze failed', err);
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `UPDATE akte SET
         ai_summary = ?1,
         ai_sentiment = ?2,
         ai_analyzed_at = ?3,
         ai_input_tokens = ?4,
         ai_output_tokens = ?5,
         ai_model = ?6
       WHERE id = ?7 AND kanzlei_id = ?8`,
    )
    .bind(
      result.summary,
      result.sentiment,
      now,
      result.inputTokens,
      result.outputTokens,
      result.model,
      akteId,
      kanzleiId,
    )
    .run();

  await appendAudit(db, env.SECRET_KEY, kanzleiId, ctx, {
    eventType: 'akte.ai_analyzed',
    subjectType: 'akte',
    subjectId: akteId,
    payload: {
      sentiment: result.sentiment,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      model: result.model,
    },
  });

  // FTS-Index inkl. ai_summary aktualisieren
  await rebuildFts(db, akteId).catch((err) => console.error('fts rebuild after ai failed', err));

  return result;
}

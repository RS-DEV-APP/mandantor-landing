// Skribble-Adapter — heute ein Skelett, das nur dann scharfschaltet wenn die Env-Vars
// SKRIBBLE_USERNAME und SKRIBBLE_API_KEY gesetzt sind. Sonst gibt jede Funktion ein
// strukturiertes "not configured" zurück, sodass der Mandant-Wizard im UI darauf reagieren kann.
//
// Skribble REST API v2: api.skribble.com — Auth ist Bearer-Token, der via Login-Endpoint
// (POST /v2/access/login mit username + api-key) ausgehandelt wird. Token TTL ~1h.
//
// Implementation-Status:
//   ✅ isConfigured() Check
//   ✅ Lib-Skelett mit allen Methodensignaturen
//   🟡 Echte Calls noch deaktiviert (return "not_configured")

export type SkribbleProvider = 'skribble';

export type SignatureLevel = 'EES' | 'FES' | 'QES';

export type SignatureRequestInit = {
  documentName: string;
  documentBase64: string;
  signerEmail: string;
  signerFirstName?: string;
  signerLastName?: string;
  level: SignatureLevel;
  callbackUrl: string;       // unser Webhook
  successUrl?: string;       // wohin Skribble den User nach Signing redirected
  cancelUrl?: string;
};

export type SkribbleStatus =
  | { ok: true; sessionId: string; status: 'pending' | 'sent' | 'signed' | 'declined' | 'expired'; signedPdfUrl?: string }
  | { ok: false; reason: 'not_configured' | 'auth_failed' | 'api_error'; detail?: string };

export function isConfigured(env: { SKRIBBLE_USERNAME?: string; SKRIBBLE_API_KEY?: string }): boolean {
  return !!(env.SKRIBBLE_USERNAME && env.SKRIBBLE_API_KEY);
}

async function getAccessToken(username: string, apiKey: string): Promise<string | null> {
  const res = await fetch('https://api.skribble.com/v2/access/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, 'api-key': apiKey }),
  });
  if (!res.ok) return null;
  const text = await res.text();
  // Skribble returns the token as plain text in the response body
  return text.replace(/"/g, '').trim();
}

export async function createSignatureRequest(
  env: { SKRIBBLE_USERNAME?: string; SKRIBBLE_API_KEY?: string },
  init: SignatureRequestInit,
): Promise<SkribbleStatus> {
  if (!isConfigured(env)) {
    return { ok: false, reason: 'not_configured' };
  }
  const token = await getAccessToken(env.SKRIBBLE_USERNAME!, env.SKRIBBLE_API_KEY!);
  if (!token) return { ok: false, reason: 'auth_failed' };

  // 1. Document anlegen
  const docRes = await fetch('https://api.skribble.com/v2/documents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: init.documentName,
      content: init.documentBase64,
      content_type: 'application/pdf',
    }),
  });
  if (!docRes.ok) return { ok: false, reason: 'api_error', detail: await docRes.text() };
  const doc = await docRes.json() as { id: string };

  // 2. Signature-Request anlegen
  const reqRes = await fetch('https://api.skribble.com/v2/signature-requests', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: init.documentName,
      document_ids: [doc.id],
      signatures: [
        {
          account_email: init.signerEmail,
          signer_identity_data: {
            first_name: init.signerFirstName ?? '',
            last_name: init.signerLastName ?? '',
            email_address: init.signerEmail,
          },
          quality: init.level,
        },
      ],
      callback_success_url: init.successUrl,
      callback_decline_url: init.cancelUrl,
      callback_error_url: init.cancelUrl,
    }),
  });
  if (!reqRes.ok) return { ok: false, reason: 'api_error', detail: await reqRes.text() };
  const sigReq = await reqRes.json() as { id: string };

  return { ok: true, sessionId: sigReq.id, status: 'sent' };
}

export async function getSignatureStatus(
  env: { SKRIBBLE_USERNAME?: string; SKRIBBLE_API_KEY?: string },
  sessionId: string,
): Promise<SkribbleStatus> {
  if (!isConfigured(env)) return { ok: false, reason: 'not_configured' };
  const token = await getAccessToken(env.SKRIBBLE_USERNAME!, env.SKRIBBLE_API_KEY!);
  if (!token) return { ok: false, reason: 'auth_failed' };

  const res = await fetch(`https://api.skribble.com/v2/signature-requests/${sessionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { ok: false, reason: 'api_error', detail: await res.text() };
  const data = await res.json() as { status_overall: string };

  // Skribble status_overall: OPEN, SIGNED, REJECTED, WITHDRAWN
  const map: Record<string, 'pending' | 'sent' | 'signed' | 'declined' | 'expired'> = {
    OPEN: 'sent',
    SIGNED: 'signed',
    REJECTED: 'declined',
    WITHDRAWN: 'expired',
  };
  return { ok: true, sessionId, status: map[data.status_overall] ?? 'pending' };
}

// Akten-Typ Signatur-Levels parsen
export type StepSignatureLevels = Partial<Record<2 | 3 | 4, SignatureLevel>>;

export function parseSignatureLevels(json: string | null): StepSignatureLevels {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    const out: StepSignatureLevels = {};
    for (const k of [2, 3, 4] as const) {
      const v = parsed[String(k)];
      if (v === 'EES' || v === 'FES' || v === 'QES') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function effectiveLevel(
  levels: StepSignatureLevels,
  stepNo: number,
): SignatureLevel {
  if (stepNo === 2 || stepNo === 3 || stepNo === 4) {
    return levels[stepNo as 2 | 3 | 4] ?? 'EES';
  }
  return 'EES';
}

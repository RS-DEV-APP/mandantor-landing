// Outbound Webhooks: Stripe-Style HMAC-Signatur, fire-and-forget via ctx.waitUntil().
// Empfänger verifizieren via header X-Mandantor-Signature: t=<ts>,v1=<hex_hmac>,
// signiert wird `${t}.${rawBody}` mit dem signing_secret als HMAC-SHA256-Key.

import { newId, newToken } from './ids';

export type WebhookEvent =
  | 'akte.created'
  | 'akte.submitted'
  | 'akte.reopened'
  | 'akte.phase_changed'
  | 'akte.message_from_mandant'
  | 'webhook.test';

export const ALL_WEBHOOK_EVENTS: WebhookEvent[] = [
  'akte.created',
  'akte.submitted',
  'akte.reopened',
  'akte.phase_changed',
  'akte.message_from_mandant',
];

export type WebhookEndpoint = {
  id: string;
  kanzlei_id: string;
  url: string;
  signing_secret: string;
  events_json: string;
  active: number;
  description: string | null;
  created_at: number;
  last_success_at: number | null;
  last_failure_at: number | null;
  last_status_code: number | null;
  last_error: string | null;
};

type WaitUntilCtx = { waitUntil: (p: Promise<unknown>) => void } | undefined | null;

const WEBHOOK_TIMEOUT_MS = 10_000;
const USER_AGENT = 'Mandantor-Webhooks/1.0';

export async function listWebhooks(
  db: D1Database,
  kanzleiId: string,
): Promise<WebhookEndpoint[]> {
  const result = await db
    .prepare('SELECT * FROM webhook_endpoint WHERE kanzlei_id = ?1 ORDER BY created_at DESC')
    .bind(kanzleiId)
    .all<WebhookEndpoint>();
  return result.results ?? [];
}

export async function findWebhook(
  db: D1Database,
  kanzleiId: string,
  id: string,
): Promise<WebhookEndpoint | null> {
  return await db
    .prepare('SELECT * FROM webhook_endpoint WHERE id = ?1 AND kanzlei_id = ?2 LIMIT 1')
    .bind(id, kanzleiId)
    .first<WebhookEndpoint>();
}

export async function createWebhook(
  db: D1Database,
  kanzleiId: string,
  url: string,
  events: string[],
  description: string | null,
): Promise<WebhookEndpoint> {
  const id = newId();
  const signingSecret = newToken();
  const eventsJson = JSON.stringify(events);
  const now = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      `INSERT INTO webhook_endpoint
        (id, kanzlei_id, url, signing_secret, events_json, active, description, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7)`,
    )
    .bind(id, kanzleiId, url, signingSecret, eventsJson, description, now)
    .run();

  return {
    id,
    kanzlei_id: kanzleiId,
    url,
    signing_secret: signingSecret,
    events_json: eventsJson,
    active: 1,
    description,
    created_at: now,
    last_success_at: null,
    last_failure_at: null,
    last_status_code: null,
    last_error: null,
  };
}

export async function deleteWebhook(
  db: D1Database,
  kanzleiId: string,
  id: string,
): Promise<void> {
  await db
    .prepare('DELETE FROM webhook_endpoint WHERE id = ?1 AND kanzlei_id = ?2')
    .bind(id, kanzleiId)
    .run();
}

export function parseEvents(endpoint: WebhookEndpoint): string[] {
  try {
    const parsed = JSON.parse(endpoint.events_json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

type FireResult = { ok: boolean; statusCode: number | null; error: string | null };

async function updateLastStatus(
  db: D1Database,
  endpointId: string,
  result: FireResult,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  if (result.ok) {
    await db
      .prepare(
        `UPDATE webhook_endpoint
         SET last_success_at = ?1, last_status_code = ?2, last_error = NULL
         WHERE id = ?3`,
      )
      .bind(now, result.statusCode, endpointId)
      .run();
  } else {
    await db
      .prepare(
        `UPDATE webhook_endpoint
         SET last_failure_at = ?1, last_status_code = ?2, last_error = ?3
         WHERE id = ?4`,
      )
      .bind(now, result.statusCode, result.error?.slice(0, 500) ?? null, endpointId)
      .run();
  }
}

export async function fireWebhook(
  db: D1Database,
  endpoint: WebhookEndpoint,
  event: WebhookEvent | string,
  payload: Record<string, unknown>,
): Promise<FireResult> {
  const ts = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    event,
    id: newId(),
    created_at: ts,
    kanzlei_id: endpoint.kanzlei_id,
    data: payload,
  });
  const sig = await hmacHex(endpoint.signing_secret, `${ts}.${body}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  let result: FireResult;
  try {
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        'X-Mandantor-Event': event,
        'X-Mandantor-Signature': `t=${ts},v1=${sig}`,
      },
      body,
      signal: controller.signal,
    });
    result = {
      ok: res.status >= 200 && res.status < 300,
      statusCode: res.status,
      error: res.status >= 200 && res.status < 300 ? null : `HTTP ${res.status}`,
    };
  } catch (err) {
    const e = err as Error;
    result = {
      ok: false,
      statusCode: null,
      error: e.name === 'AbortError' ? 'timeout' : (e.message ?? 'fetch failed'),
    };
  } finally {
    clearTimeout(timer);
  }

  try {
    await updateLastStatus(db, endpoint.id, result);
  } catch (err) {
    console.error('webhook last_status update failed', err);
  }

  return result;
}

// Lädt aktive Endpoints für die Kanzlei und feuert das Event an alle, die diesen
// Event-Type abonniert haben. Wenn ctx vorhanden, läuft das Senden im Hintergrund;
// sonst (Dev-Mode) synchron mit Try/Catch, damit der Caller nicht blockiert/crasht.
export async function dispatchEvent(
  db: D1Database,
  ctx: WaitUntilCtx,
  kanzleiId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  let endpoints: WebhookEndpoint[];
  try {
    const result = await db
      .prepare(
        'SELECT * FROM webhook_endpoint WHERE kanzlei_id = ?1 AND active = 1',
      )
      .bind(kanzleiId)
      .all<WebhookEndpoint>();
    endpoints = result.results ?? [];
  } catch (err) {
    console.error('webhook dispatch lookup failed', err);
    return;
  }

  const matching = endpoints.filter((ep) => parseEvents(ep).includes(event));
  if (matching.length === 0) return;

  for (const ep of matching) {
    const promise = fireWebhook(db, ep, event, payload).catch((err) => {
      console.error(`webhook ${ep.id} fire failed`, err);
    });
    if (ctx?.waitUntil) {
      ctx.waitUntil(promise);
    } else {
      try { await promise; } catch { /* swallowed */ }
    }
  }
}

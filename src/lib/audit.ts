// Append-only Audit-Log mit Hash-Chain pro Kanzlei.
//
// Jeder Eintrag enthält previous_hash (= this_hash des vorherigen Eintrags) und
// this_hash = HMAC-SHA256(SECRET_KEY, canonical(previous + occurred_at + actor + event + payload)).
// Damit ist nachträgliche Manipulation eines Eintrags erkennbar — die Hash-Chain bricht.
//
// Race-Condition: bei sehr seltenen parallelen Inserts (Anwaltskanzlei = niedriger Traffic)
// können zwei Einträge denselben previous_hash referenzieren. Wir akzeptieren das pragmatisch
// und melden „Branch in Chain" beim Verifizieren.

import { hashIp, hashUa } from './hash';

const GENESIS = 'GENESIS';

export type AuditEvent = {
  eventType: string;
  subjectType?: string;
  subjectId?: string;
  payload?: Record<string, unknown>;
};

export type AuditContext = {
  actorUserId: string | null;
  actorEmail: string | null;
  ip: string | null;
  ua: string | null;
};

export type AuditRow = {
  id: number;
  kanzlei_id: string;
  occurred_at: number;
  actor_user_id: string | null;
  actor_email: string | null;
  event_type: string;
  subject_type: string | null;
  subject_id: string | null;
  payload_json: string;
  previous_hash: string;
  this_hash: string;
  ip_hash: string | null;
  ua_hash: string | null;
};

function canonicalize(obj: unknown): string {
  // Stable JSON: object keys sorted alphabetically.
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalize).join(',') + ']';
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + canonicalize((obj as Record<string, unknown>)[k]))
      .join(',') +
    '}'
  );
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

async function getLastHash(db: D1Database, kanzleiId: string): Promise<string> {
  const row = await db
    .prepare('SELECT this_hash FROM audit_log WHERE kanzlei_id = ?1 ORDER BY id DESC LIMIT 1')
    .bind(kanzleiId)
    .first<{ this_hash: string }>();
  return row?.this_hash ?? GENESIS;
}

export async function appendAudit(
  db: D1Database,
  secret: string,
  kanzleiId: string,
  ctx: AuditContext,
  event: AuditEvent,
): Promise<void> {
  const occurredAt = Math.floor(Date.now() / 1000);
  const payloadJson = JSON.stringify(event.payload ?? {});
  const previousHash = await getLastHash(db, kanzleiId);

  const message = canonicalize({
    previous: previousHash,
    occurred_at: occurredAt,
    actor: ctx.actorUserId,
    event: event.eventType,
    subject_type: event.subjectType ?? null,
    subject_id: event.subjectId ?? null,
    payload: event.payload ?? {},
  });
  const thisHash = await hmacHex(secret, message);
  const ipHash = await hashIp(secret, ctx.ip);
  const uaHash = await hashUa(secret, ctx.ua);

  await db
    .prepare(
      `INSERT INTO audit_log
        (kanzlei_id, occurred_at, actor_user_id, actor_email, event_type, subject_type, subject_id,
         payload_json, previous_hash, this_hash, ip_hash, ua_hash)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
    )
    .bind(
      kanzleiId,
      occurredAt,
      ctx.actorUserId,
      ctx.actorEmail,
      event.eventType,
      event.subjectType ?? null,
      event.subjectId ?? null,
      payloadJson,
      previousHash,
      thisHash,
      ipHash,
      uaHash,
    )
    .run();
}

export async function listAuditEntries(
  db: D1Database,
  kanzleiId: string,
  limit = 200,
): Promise<AuditRow[]> {
  const result = await db
    .prepare(
      'SELECT * FROM audit_log WHERE kanzlei_id = ?1 ORDER BY id DESC LIMIT ?2',
    )
    .bind(kanzleiId, limit)
    .all<AuditRow>();
  return result.results ?? [];
}

export type ChainVerifyResult = {
  ok: boolean;
  totalEntries: number;
  brokenAtId: number | null;
  reason: string | null;
};

/** Verifiziert die Hash-Chain für eine Kanzlei. */
export async function verifyChain(
  db: D1Database,
  secret: string,
  kanzleiId: string,
): Promise<ChainVerifyResult> {
  const result = await db
    .prepare('SELECT * FROM audit_log WHERE kanzlei_id = ?1 ORDER BY id ASC')
    .bind(kanzleiId)
    .all<AuditRow>();
  const rows = result.results ?? [];

  let expectedPrev = GENESIS;
  for (const row of rows) {
    if (row.previous_hash !== expectedPrev) {
      return {
        ok: false,
        totalEntries: rows.length,
        brokenAtId: row.id,
        reason: `previous_hash mismatch (erwartet ${expectedPrev.slice(0, 16)}…, gefunden ${row.previous_hash.slice(0, 16)}…)`,
      };
    }
    const message = canonicalize({
      previous: row.previous_hash,
      occurred_at: row.occurred_at,
      actor: row.actor_user_id,
      event: row.event_type,
      subject_type: row.subject_type,
      subject_id: row.subject_id,
      payload: JSON.parse(row.payload_json || '{}'),
    });
    const expectedHash = await hmacHex(secret, message);
    if (expectedHash !== row.this_hash) {
      return {
        ok: false,
        totalEntries: rows.length,
        brokenAtId: row.id,
        reason: 'this_hash stimmt nicht mit Payload überein — möglicher Manipulationsversuch',
      };
    }
    expectedPrev = row.this_hash;
  }

  return { ok: true, totalEntries: rows.length, brokenAtId: null, reason: null };
}

// Convenience helper für Astro-Routes: extracts ip + ua aus Request, holt actor aus session.
export function buildAuditContext(
  request: Request,
  session: { user_id: string; email: string } | null | undefined,
): AuditContext {
  return {
    actorUserId: session?.user_id ?? null,
    actorEmail: session?.email ?? null,
    ip: request.headers.get('cf-connecting-ip') ?? null,
    ua: request.headers.get('user-agent') ?? null,
  };
}

import { newToken } from './ids';
import { hashToken, hashIp, hashUa } from './hash';

const MAGIC_LINK_TTL_SECONDS = 15 * 60;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export const SESSION_COOKIE = 'mandantor_session';

export async function createMagicLink(
  db: D1Database,
  secret: string,
  email: string,
  kanzleiId: string,
): Promise<string> {
  const token = newToken();
  const tokenHash = await hashToken(secret, token);
  const expiresAt = Math.floor(Date.now() / 1000) + MAGIC_LINK_TTL_SECONDS;

  await db
    .prepare(
      'INSERT INTO magic_link (token_hash, email, kanzlei_id, expires_at) VALUES (?1, ?2, ?3, ?4)',
    )
    .bind(tokenHash, email.toLowerCase(), kanzleiId, expiresAt)
    .run();

  return token;
}

export async function consumeMagicLink(
  db: D1Database,
  secret: string,
  token: string,
): Promise<{ kanzlei_id: string; email: string } | null> {
  const tokenHash = await hashToken(secret, token);
  const now = Math.floor(Date.now() / 1000);

  const row = await db
    .prepare(
      'SELECT kanzlei_id, email, expires_at, used_at FROM magic_link WHERE token_hash = ?1 LIMIT 1',
    )
    .bind(tokenHash)
    .first<{ kanzlei_id: string; email: string; expires_at: number; used_at: number | null }>();

  if (!row) return null;
  if (row.used_at) return null;
  if (row.expires_at < now) return null;

  await db
    .prepare('UPDATE magic_link SET used_at = ?1 WHERE token_hash = ?2')
    .bind(now, tokenHash)
    .run();

  return { kanzlei_id: row.kanzlei_id, email: row.email };
}

export async function createSession(
  db: D1Database,
  secret: string,
  kanzleiId: string,
  ip: string | null,
  ua: string | null,
): Promise<string> {
  const token = newToken();
  const tokenHash = await hashToken(secret, token);
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const ipHash = await hashIp(secret, ip);
  const uaHash = await hashUa(secret, ua);

  await db
    .prepare(
      'INSERT INTO session (token_hash, kanzlei_id, expires_at, ip_hash, ua_hash) VALUES (?1, ?2, ?3, ?4, ?5)',
    )
    .bind(tokenHash, kanzleiId, expiresAt, ipHash, uaHash)
    .run();

  return token;
}

export async function lookupSession(
  db: D1Database,
  secret: string,
  token: string | undefined,
): Promise<{ kanzlei_id: string } | null> {
  if (!token) return null;
  const tokenHash = await hashToken(secret, token);
  const now = Math.floor(Date.now() / 1000);

  const row = await db
    .prepare(
      'SELECT kanzlei_id, expires_at FROM session WHERE token_hash = ?1 LIMIT 1',
    )
    .bind(tokenHash)
    .first<{ kanzlei_id: string; expires_at: number }>();

  if (!row) return null;
  if (row.expires_at < now) return null;
  return { kanzlei_id: row.kanzlei_id };
}

export async function deleteSession(
  db: D1Database,
  secret: string,
  token: string | undefined,
): Promise<void> {
  if (!token) return;
  const tokenHash = await hashToken(secret, token);
  await db.prepare('DELETE FROM session WHERE token_hash = ?1').bind(tokenHash).run();
}

export const SESSION_MAX_AGE = SESSION_TTL_SECONDS;

import { newToken } from './ids';
import { hashToken } from './hash';

const PENDING_TTL_SECONDS = 10 * 60;

export const PENDING_2FA_COOKIE = 'mandantor_2fa_pending';

export async function createPending2fa(
  db: D1Database,
  secret: string,
  userId: string,
  kanzleiId: string,
): Promise<string> {
  const token = newToken();
  const tokenHash = await hashToken(secret, token);
  const expiresAt = Math.floor(Date.now() / 1000) + PENDING_TTL_SECONDS;
  await db
    .prepare(
      'INSERT INTO pending_2fa (token_hash, user_id, kanzlei_id, expires_at) VALUES (?1, ?2, ?3, ?4)',
    )
    .bind(tokenHash, userId, kanzleiId, expiresAt)
    .run();
  return token;
}

export async function lookupPending2fa(
  db: D1Database,
  secret: string,
  token: string | undefined,
): Promise<{ user_id: string; kanzlei_id: string } | null> {
  if (!token) return null;
  const tokenHash = await hashToken(secret, token);
  const now = Math.floor(Date.now() / 1000);
  const row = await db
    .prepare('SELECT user_id, kanzlei_id, expires_at FROM pending_2fa WHERE token_hash = ?1 LIMIT 1')
    .bind(tokenHash)
    .first<{ user_id: string; kanzlei_id: string; expires_at: number }>();
  if (!row || row.expires_at < now) return null;
  return { user_id: row.user_id, kanzlei_id: row.kanzlei_id };
}

export async function deletePending2fa(
  db: D1Database,
  secret: string,
  token: string,
): Promise<void> {
  const tokenHash = await hashToken(secret, token);
  await db.prepare('DELETE FROM pending_2fa WHERE token_hash = ?1').bind(tokenHash).run();
}

export const PENDING_2FA_MAX_AGE = PENDING_TTL_SECONDS;

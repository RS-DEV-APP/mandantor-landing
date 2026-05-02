import { newId, newToken } from './ids';
import { hashToken } from './hash';

export type Role = 'admin' | 'member';
export type UserStatus = 'active' | 'invited' | 'removed';

export type KanzleiUser = {
  id: string;
  kanzlei_id: string;
  email: string;
  display_name: string | null;
  role: Role;
  status: UserStatus;
  invited_by_user_id: string | null;
  invited_at: number | null;
  joined_at: number | null;
  created_at: number;
  totp_secret: string | null;
  totp_enabled_at: number | null;
  recovery_codes_json: string | null;
};

export async function setUserTotp(
  db: D1Database,
  userId: string,
  totpSecret: string | null,
  recoveryCodesHashed: string[] | null,
): Promise<void> {
  const now = totpSecret ? Math.floor(Date.now() / 1000) : null;
  await db
    .prepare(
      `UPDATE kanzlei_user
       SET totp_secret = ?1, totp_enabled_at = ?2, recovery_codes_json = ?3
       WHERE id = ?4`,
    )
    .bind(
      totpSecret,
      now,
      recoveryCodesHashed ? JSON.stringify(recoveryCodesHashed) : null,
      userId,
    )
    .run();
}

export async function consumeRecoveryCode(
  db: D1Database,
  userId: string,
  hashedCode: string,
): Promise<boolean> {
  const row = await db
    .prepare('SELECT recovery_codes_json FROM kanzlei_user WHERE id = ?1 LIMIT 1')
    .bind(userId)
    .first<{ recovery_codes_json: string | null }>();
  if (!row?.recovery_codes_json) return false;
  let arr: string[] = [];
  try { arr = JSON.parse(row.recovery_codes_json); } catch { return false; }
  if (!arr.includes(hashedCode)) return false;
  const remaining = arr.filter((h) => h !== hashedCode);
  await db
    .prepare('UPDATE kanzlei_user SET recovery_codes_json = ?1 WHERE id = ?2')
    .bind(JSON.stringify(remaining), userId)
    .run();
  return true;
}

export async function findUserByEmail(db: D1Database, email: string): Promise<KanzleiUser | null> {
  const row = await db
    .prepare(`SELECT * FROM kanzlei_user WHERE email = ?1 AND status != 'removed' LIMIT 1`)
    .bind(email.toLowerCase())
    .first<KanzleiUser>();
  return row ?? null;
}

export async function findUserById(db: D1Database, id: string): Promise<KanzleiUser | null> {
  const row = await db
    .prepare('SELECT * FROM kanzlei_user WHERE id = ?1 LIMIT 1')
    .bind(id)
    .first<KanzleiUser>();
  return row ?? null;
}

export async function listUsersOfKanzlei(db: D1Database, kanzleiId: string): Promise<KanzleiUser[]> {
  const result = await db
    .prepare(`SELECT * FROM kanzlei_user WHERE kanzlei_id = ?1 AND status != 'removed' ORDER BY created_at`)
    .bind(kanzleiId)
    .all<KanzleiUser>();
  return result.results ?? [];
}

export async function createKanzleiAdmin(
  db: D1Database,
  kanzleiId: string,
  email: string,
): Promise<KanzleiUser> {
  const id = newId();
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO kanzlei_user (id, kanzlei_id, email, role, status, joined_at)
       VALUES (?1, ?2, ?3, 'admin', 'active', ?4)`,
    )
    .bind(id, kanzleiId, email.toLowerCase(), now)
    .run();
  const created = await findUserById(db, id);
  if (!created) throw new Error('failed to read back created user');
  return created;
}

export async function setUserRole(
  db: D1Database,
  kanzleiId: string,
  userId: string,
  role: Role,
): Promise<void> {
  await db
    .prepare(`UPDATE kanzlei_user SET role = ?1 WHERE id = ?2 AND kanzlei_id = ?3`)
    .bind(role, userId, kanzleiId)
    .run();
}

export async function softDeleteUser(
  db: D1Database,
  kanzleiId: string,
  userId: string,
): Promise<void> {
  await db
    .prepare(`UPDATE kanzlei_user SET status = 'removed' WHERE id = ?1 AND kanzlei_id = ?2`)
    .bind(userId, kanzleiId)
    .run();
}

export async function updateUserDisplayName(
  db: D1Database,
  userId: string,
  displayName: string | null,
): Promise<void> {
  await db
    .prepare(`UPDATE kanzlei_user SET display_name = ?1 WHERE id = ?2`)
    .bind(displayName, userId)
    .run();
}

// ── Invitations ─────────────────────────────────────────────────────────

const INVITE_TTL_SECONDS = 14 * 24 * 60 * 60;

export type InvitationRow = {
  token_hash: string;
  kanzlei_id: string;
  email: string;
  role: Role;
  invited_by_user_id: string | null;
  expires_at: number;
  used_at: number | null;
  created_at: number;
};

export async function createInvitation(
  db: D1Database,
  secret: string,
  kanzleiId: string,
  email: string,
  role: Role,
  invitedByUserId: string,
): Promise<{ token: string }> {
  const token = newToken();
  const tokenHash = await hashToken(secret, token);
  const expiresAt = Math.floor(Date.now() / 1000) + INVITE_TTL_SECONDS;
  await db
    .prepare(
      `INSERT INTO user_invitation (token_hash, kanzlei_id, email, role, invited_by_user_id, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    )
    .bind(tokenHash, kanzleiId, email.toLowerCase(), role, invitedByUserId, expiresAt)
    .run();
  return { token };
}

export async function consumeInvitation(
  db: D1Database,
  secret: string,
  token: string,
): Promise<{ kanzlei_id: string; email: string; role: Role } | null> {
  const tokenHash = await hashToken(secret, token);
  const now = Math.floor(Date.now() / 1000);
  const row = await db
    .prepare(`SELECT * FROM user_invitation WHERE token_hash = ?1 LIMIT 1`)
    .bind(tokenHash)
    .first<InvitationRow>();
  if (!row || row.used_at || row.expires_at < now) return null;
  await db
    .prepare(`UPDATE user_invitation SET used_at = ?1 WHERE token_hash = ?2`)
    .bind(now, tokenHash)
    .run();
  return { kanzlei_id: row.kanzlei_id, email: row.email, role: row.role };
}

export async function listPendingInvitations(
  db: D1Database,
  kanzleiId: string,
): Promise<InvitationRow[]> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare(
      `SELECT * FROM user_invitation
       WHERE kanzlei_id = ?1 AND used_at IS NULL AND expires_at > ?2
       ORDER BY created_at DESC`,
    )
    .bind(kanzleiId, now)
    .all<InvitationRow>();
  return result.results ?? [];
}

export async function revokeInvitation(
  db: D1Database,
  kanzleiId: string,
  tokenHash: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(`UPDATE user_invitation SET used_at = ?1 WHERE token_hash = ?2 AND kanzlei_id = ?3`)
    .bind(now, tokenHash, kanzleiId)
    .run();
}

export async function activateInvitedUser(
  db: D1Database,
  kanzleiId: string,
  email: string,
  role: Role,
  invitedByUserId: string | null,
): Promise<KanzleiUser> {
  const now = Math.floor(Date.now() / 1000);
  // Re-use existing kanzlei_user row if still 'invited' for this email; else insert
  const existing = await db
    .prepare(`SELECT * FROM kanzlei_user WHERE email = ?1 LIMIT 1`)
    .bind(email.toLowerCase())
    .first<KanzleiUser>();
  if (existing && existing.status !== 'removed') {
    // already active in some kanzlei — leave as is
    return existing;
  }
  if (existing && existing.status === 'removed') {
    await db
      .prepare(
        `UPDATE kanzlei_user
         SET status = 'active', kanzlei_id = ?1, role = ?2, joined_at = ?3, invited_by_user_id = ?4
         WHERE id = ?5`,
      )
      .bind(kanzleiId, role, now, invitedByUserId, existing.id)
      .run();
    const updated = await findUserById(db, existing.id);
    if (!updated) throw new Error('failed to reactivate user');
    return updated;
  }
  const id = newId();
  await db
    .prepare(
      `INSERT INTO kanzlei_user
        (id, kanzlei_id, email, role, status, invited_by_user_id, joined_at)
       VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?6)`,
    )
    .bind(id, kanzleiId, email.toLowerCase(), role, invitedByUserId, now)
    .run();
  const created = await findUserById(db, id);
  if (!created) throw new Error('failed to create invited user');
  return created;
}

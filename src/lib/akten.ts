import { newId, newToken } from './ids';

export type Akte = {
  id: string;
  kanzlei_id: string;
  mandant_token: string;
  case_label: string | null;
  status: 'draft' | 'in_progress' | 'submitted' | 'archived';
  akten_typ_id: string | null;
  mandant_email: string | null;
  mandant_name: string | null;
  reminder_sent_at: number | null;
  reopened_at: number | null;
  reopen_reason: string | null;
  created_at: number;
  submitted_at: number | null;
};

export async function setMandantContact(
  db: D1Database,
  akteId: string,
  email: string | null,
  name: string | null,
): Promise<void> {
  await db
    .prepare('UPDATE akte SET mandant_email = ?1, mandant_name = ?2 WHERE id = ?3')
    .bind(email, name, akteId)
    .run();
}

export async function reopenAkte(
  db: D1Database,
  kanzleiId: string,
  akteId: string,
  reason: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `UPDATE akte
       SET status = 'in_progress', submitted_at = NULL, reopened_at = ?1, reopen_reason = ?2
       WHERE id = ?3 AND kanzlei_id = ?4 AND status = 'submitted'`,
    )
    .bind(now, reason, akteId, kanzleiId)
    .run();
}

export async function createAkte(
  db: D1Database,
  kanzleiId: string,
  caseLabel: string | null,
  aktenTypId: string | null = null,
): Promise<Akte> {
  const id = newId();
  const mandantToken = newToken();
  await db
    .prepare(
      'INSERT INTO akte (id, kanzlei_id, mandant_token, case_label, status, akten_typ_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
    )
    .bind(id, kanzleiId, mandantToken, caseLabel ?? null, 'draft', aktenTypId)
    .run();

  const row = await db
    .prepare('SELECT * FROM akte WHERE id = ?1')
    .bind(id)
    .first<Akte>();
  if (!row) throw new Error('failed to read back created akte');
  return row;
}

export async function listAkten(
  db: D1Database,
  kanzleiId: string,
  options: { includeArchived?: boolean; query?: string } = {},
): Promise<Akte[]> {
  const archivedFilter = options.includeArchived ? '' : `AND status != 'archived'`;
  const q = (options.query ?? '').trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, '\\$&')}%`;
    const result = await db
      .prepare(
        `SELECT * FROM akte
         WHERE kanzlei_id = ?1 ${archivedFilter}
           AND (case_label LIKE ?2 ESCAPE '\\'
                OR mandant_email LIKE ?2 ESCAPE '\\'
                OR mandant_name LIKE ?2 ESCAPE '\\')
         ORDER BY created_at DESC LIMIT 100`,
      )
      .bind(kanzleiId, like)
      .all<Akte>();
    return result.results ?? [];
  }
  const sql = options.includeArchived
    ? 'SELECT * FROM akte WHERE kanzlei_id = ?1 ORDER BY created_at DESC LIMIT 200'
    : `SELECT * FROM akte WHERE kanzlei_id = ?1 AND status != 'archived' ORDER BY created_at DESC LIMIT 100`;
  const result = await db.prepare(sql).bind(kanzleiId).all<Akte>();
  return result.results ?? [];
}

export async function findAkteById(
  db: D1Database,
  kanzleiId: string,
  id: string,
): Promise<Akte | null> {
  const row = await db
    .prepare('SELECT * FROM akte WHERE id = ?1 AND kanzlei_id = ?2 LIMIT 1')
    .bind(id, kanzleiId)
    .first<Akte>();
  return row ?? null;
}

export async function findAkteByMandantToken(
  db: D1Database,
  token: string,
): Promise<Akte | null> {
  const row = await db
    .prepare('SELECT * FROM akte WHERE mandant_token = ?1 LIMIT 1')
    .bind(token)
    .first<Akte>();
  return row ?? null;
}

export async function renameAkte(
  db: D1Database,
  kanzleiId: string,
  akteId: string,
  newLabel: string | null,
): Promise<void> {
  await db
    .prepare('UPDATE akte SET case_label = ?1 WHERE id = ?2 AND kanzlei_id = ?3')
    .bind(newLabel, akteId, kanzleiId)
    .run();
}

export async function archiveAkte(
  db: D1Database,
  kanzleiId: string,
  akteId: string,
): Promise<void> {
  await db
    .prepare(`UPDATE akte SET status = 'archived' WHERE id = ?1 AND kanzlei_id = ?2`)
    .bind(akteId, kanzleiId)
    .run();
}

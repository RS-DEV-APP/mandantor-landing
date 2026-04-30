import { newId, newToken } from './ids';

export type Akte = {
  id: string;
  kanzlei_id: string;
  mandant_token: string;
  case_label: string | null;
  status: 'draft' | 'in_progress' | 'submitted' | 'archived';
  created_at: number;
  submitted_at: number | null;
};

export async function createAkte(
  db: D1Database,
  kanzleiId: string,
  caseLabel: string | null,
): Promise<Akte> {
  const id = newId();
  const mandantToken = newToken();
  await db
    .prepare(
      'INSERT INTO akte (id, kanzlei_id, mandant_token, case_label, status) VALUES (?1, ?2, ?3, ?4, ?5)',
    )
    .bind(id, kanzleiId, mandantToken, caseLabel ?? null, 'draft')
    .run();

  const row = await db
    .prepare('SELECT * FROM akte WHERE id = ?1')
    .bind(id)
    .first<Akte>();
  if (!row) throw new Error('failed to read back created akte');
  return row;
}

export async function listAkten(db: D1Database, kanzleiId: string): Promise<Akte[]> {
  const result = await db
    .prepare(
      'SELECT * FROM akte WHERE kanzlei_id = ?1 ORDER BY created_at DESC LIMIT 100',
    )
    .bind(kanzleiId)
    .all<Akte>();
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

import { hashIp, hashUa } from './hash';
import { newId } from './ids';

// Index = step_no - 1. Reihenfolge entspricht NICHT dem UI-Render-Order:
// step_no 1-5 sind die ursprünglichen Schritte (kompatibel mit Bestandsdaten),
// 6 (Sachverhalt) und 7 (Widerruf) wurden in 0012 ergänzt und sind optional
// pro Akten-Typ (akten_typ.include_sachverhalt / include_widerruf).
// UI-Render-Order: 1, 6?, 7?, 2, 3, 4, 5 (Stammdaten → Sachverhalt → Widerruf → Vollmacht → DSGVO → Honorar → Upload).
export const STEP_LABELS = ['Stammdaten', 'Vollmacht', 'DSGVO', 'Honorar', 'Upload', 'Sachverhalt', 'Widerruf'] as const;
export const STEP_COUNT = STEP_LABELS.length;

export type AkteStep = {
  akte_id: string;
  step_no: number;
  data_json: string;
  signed_at: number | null;
  ip_hash: string | null;
  ua_hash: string | null;
};

export async function listSteps(db: D1Database, akteId: string): Promise<AkteStep[]> {
  const result = await db
    .prepare('SELECT * FROM akte_step WHERE akte_id = ?1 ORDER BY step_no')
    .bind(akteId)
    .all<AkteStep>();
  return result.results ?? [];
}

export async function saveStep(
  db: D1Database,
  secret: string,
  akteId: string,
  stepNo: number,
  data: Record<string, unknown>,
  ip: string | null,
  ua: string | null,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const ipHash = await hashIp(secret, ip);
  const uaHash = await hashUa(secret, ua);
  const json = JSON.stringify(data);

  await db
    .prepare(
      `INSERT INTO akte_step (akte_id, step_no, data_json, signed_at, ip_hash, ua_hash)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(akte_id, step_no) DO UPDATE SET
         data_json = excluded.data_json,
         signed_at = excluded.signed_at,
         ip_hash = excluded.ip_hash,
         ua_hash = excluded.ua_hash`,
    )
    .bind(akteId, stepNo, json, now, ipHash, uaHash)
    .run();

  // Step 1 contains contact data — cache email + name on akte for search/reminders.
  if (stepNo === 1) {
    const d = data as { email?: string; vorname?: string; nachname?: string };
    const email = (d.email ?? '').toString().trim().toLowerCase() || null;
    const name = [d.vorname, d.nachname].filter(Boolean).join(' ').trim() || null;
    await db
      .prepare(`UPDATE akte SET mandant_email = COALESCE(?1, mandant_email), mandant_name = ?2,
                                 status = CASE status WHEN 'draft' THEN 'in_progress' ELSE status END
                WHERE id = ?3`)
      .bind(email, name, akteId)
      .run();
  }
}

export type AkteFile = {
  id: string;
  akte_id: string;
  file_name: string;
  r2_key: string;
  size_bytes: number;
  mime_type: string | null;
  uploaded_at: number;
};

export async function recordFile(
  db: D1Database,
  akteId: string,
  fileName: string,
  r2Key: string,
  sizeBytes: number,
  mimeType: string | null,
): Promise<AkteFile> {
  const id = newId();
  await db
    .prepare(
      `INSERT INTO akte_file (id, akte_id, file_name, r2_key, size_bytes, mime_type)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    )
    .bind(id, akteId, fileName, r2Key, sizeBytes, mimeType ?? null)
    .run();
  const row = await db
    .prepare('SELECT * FROM akte_file WHERE id = ?1')
    .bind(id)
    .first<AkteFile>();
  if (!row) throw new Error('failed to read back created akte_file');
  return row;
}

export async function listFiles(db: D1Database, akteId: string): Promise<AkteFile[]> {
  const result = await db
    .prepare('SELECT * FROM akte_file WHERE akte_id = ?1 ORDER BY uploaded_at')
    .bind(akteId)
    .all<AkteFile>();
  return result.results ?? [];
}

export async function markSubmitted(db: D1Database, akteId: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(`UPDATE akte SET status = 'submitted', submitted_at = ?1 WHERE id = ?2`)
    .bind(now, akteId)
    .run();
}

export const ALLOWED_UPLOAD_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
export const ALLOWED_UPLOAD_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.heic', '.heif', '.docx'];
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_FILES_PER_AKTE = 10;

export function fileExtensionAllowed(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return ALLOWED_UPLOAD_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

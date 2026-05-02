// Aufbewahrungs-Automatik:
// - Eingereichte Akten werden N Jahre nach submitted_at archiviert + retention_marked_at gesetzt
// - Pre-Submit-Akten (draft/in_progress) werden nach M Monaten Inaktivität archiviert (Datenschutzminimierung)
// Defaults aus § 50 BRAO (5 Jahre Anwaltsakte) und Datenschutzminimierung (12 Monate für unfertige Onboardings).
// Hard-Delete passiert NICHT automatisch — der Anwalt sieht den Lösch-Backlog im Dashboard.

export const DEFAULT_RETENTION_YEARS = 5;
export const DEFAULT_DRAFT_RETENTION_MONTHS = 12;

export type RetentionRow = {
  id: string;
  kanzlei_id: string;
  status: string;
  case_label: string | null;
  submitted_at: number | null;
  created_at: number;
  retention_marked_at: number | null;
};

export type KanzleiRetentionConfig = {
  id: string;
  retention_years: number | null;
  draft_retention_months: number | null;
};

export async function listKanzleienForRetention(
  db: D1Database,
): Promise<KanzleiRetentionConfig[]> {
  const result = await db
    .prepare('SELECT id, retention_years, draft_retention_months FROM kanzlei')
    .all<KanzleiRetentionConfig>();
  return result.results ?? [];
}

export async function findAktenForArchival(
  db: D1Database,
  kanzleiId: string,
  draftMonths: number,
  submittedYears: number,
): Promise<RetentionRow[]> {
  const now = Math.floor(Date.now() / 1000);
  const draftCutoff = now - draftMonths * 30 * 86400;
  const submittedCutoff = now - submittedYears * 365 * 86400;

  const result = await db
    .prepare(
      `SELECT id, kanzlei_id, status, case_label, submitted_at, created_at, retention_marked_at
       FROM akte
       WHERE kanzlei_id = ?1
         AND status != 'archived'
         AND (
           (status IN ('draft', 'in_progress') AND created_at < ?2)
           OR (status = 'submitted' AND submitted_at IS NOT NULL AND submitted_at < ?3)
         )
       LIMIT 200`,
    )
    .bind(kanzleiId, draftCutoff, submittedCutoff)
    .all<RetentionRow>();
  return result.results ?? [];
}

export async function markForRetention(
  db: D1Database,
  akteId: string,
  kanzleiId: string,
  isLegalRetention: boolean,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  // Submit'd akten get retention_marked_at (= "Lösch-Backlog für Anwalt").
  // Pre-submit akten werden nur archiviert, ohne retention-mark (kein gesetzlicher Aufbewahrungsgrund).
  const sql = isLegalRetention
    ? `UPDATE akte SET status = 'archived', retention_marked_at = ?1 WHERE id = ?2 AND kanzlei_id = ?3 AND status != 'archived'`
    : `UPDATE akte SET status = 'archived' WHERE id = ?1 AND kanzlei_id = ?2 AND status != 'archived'`;
  if (isLegalRetention) {
    await db.prepare(sql).bind(now, akteId, kanzleiId).run();
  } else {
    await db.prepare(sql).bind(akteId, kanzleiId).run();
  }
}

export async function setKanzleiRetention(
  db: D1Database,
  kanzleiId: string,
  years: number | null,
  draftMonths: number | null,
): Promise<void> {
  await db
    .prepare('UPDATE kanzlei SET retention_years = ?1, draft_retention_months = ?2 WHERE id = ?3')
    .bind(years, draftMonths, kanzleiId)
    .run();
}

export async function reactivateAkte(
  db: D1Database,
  kanzleiId: string,
  akteId: string,
): Promise<void> {
  // Status zurück auf submitted wenn submitted_at gesetzt, sonst in_progress
  await db
    .prepare(
      `UPDATE akte
       SET status = CASE WHEN submitted_at IS NOT NULL THEN 'submitted' ELSE 'in_progress' END,
           retention_marked_at = NULL
       WHERE id = ?1 AND kanzlei_id = ?2`,
    )
    .bind(akteId, kanzleiId)
    .run();
}

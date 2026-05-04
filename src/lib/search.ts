// Volltextsuche via FTS5. Pro Akte aggregieren wir aktuelle Stammdaten, Sachverhalt,
// KI-Zusammenfassung und Notizen in eine indexierte Zeile. Aufgerufen von:
// - akten/create + rename + setMandantContact
// - m/step (1, 6)
// - m/submit
// - notes/create + delete
// - ai analyze (für ai_summary)
//
// Wir machen DELETE + INSERT statt UPDATE, weil FTS5 keinen UPDATE-Operator auf
// der content-Spalte hat (das funktioniert nur mit "rowid"-getriggerter Variante,
// die wir hier nicht nutzen).

import type { Akte } from './akten';

type StepRow = { step_no: number; data_json: string | null };

function safeJson<T = Record<string, unknown>>(s: string | null): T {
  if (!s) return {} as T;
  try { return JSON.parse(s) as T; } catch { return {} as T; }
}

export async function rebuildFts(db: D1Database, akteId: string): Promise<void> {
  const akte = await db
    .prepare('SELECT * FROM akte WHERE id = ?1 LIMIT 1')
    .bind(akteId)
    .first<Akte>();
  if (!akte) return;

  const stepsResult = await db
    .prepare('SELECT step_no, data_json FROM akte_step WHERE akte_id = ?1')
    .bind(akteId)
    .all<StepRow>();
  const steps = stepsResult.results ?? [];

  const notesResult = await db
    .prepare('SELECT content FROM akte_note WHERE akte_id = ?1')
    .bind(akteId)
    .all<{ content: string }>();
  const notes = notesResult.results ?? [];

  const parts: string[] = [];
  if (akte.case_label) parts.push(akte.case_label);
  if (akte.mandant_name) parts.push(akte.mandant_name);
  if (akte.mandant_email) parts.push(akte.mandant_email);
  if (akte.ai_summary) parts.push(akte.ai_summary);

  for (const s of steps) {
    const data = safeJson<Record<string, unknown>>(s.data_json);
    if (s.step_no === 1) {
      const d = data as Record<string, string>;
      const stamm = [d.vorname, d.nachname, d.anschrift, d.plz, d.ort, d.email, d.telefon]
        .filter(Boolean)
        .join(' ');
      if (stamm) parts.push(stamm);
    } else if (s.step_no === 6 && typeof data.sachverhalt === 'string') {
      parts.push(data.sachverhalt);
    }
  }

  for (const n of notes) parts.push(n.content);

  const content = parts.join('\n').trim();

  // Atomisch: alte Zeile löschen, neue einfügen (FTS5 unterstützt kein UPSERT).
  await db.prepare('DELETE FROM akte_fts WHERE akte_id = ?1').bind(akteId).run();
  if (content.length > 0) {
    await db
      .prepare('INSERT INTO akte_fts (akte_id, kanzlei_id, content) VALUES (?1, ?2, ?3)')
      .bind(akteId, akte.kanzlei_id, content)
      .run();
  }
}

export async function dropFromFts(db: D1Database, akteId: string): Promise<void> {
  await db.prepare('DELETE FROM akte_fts WHERE akte_id = ?1').bind(akteId).run();
}

type WaitUntilCtx = { waitUntil: (p: Promise<unknown>) => void } | undefined | null;

/** Rebuild im Hintergrund. User-Response wird dadurch nicht verzögert. */
export function rebuildFtsAsync(db: D1Database, ctx: WaitUntilCtx, akteId: string): void {
  const p = rebuildFts(db, akteId).catch((err) => console.error('fts rebuild failed', err));
  if (ctx?.waitUntil) ctx.waitUntil(p);
  // In Dev-Mode (kein ctx) lassen wir den Promise einfach laufen — fire-and-forget.
}

// FTS5-MATCH-Query: liefert akte_ids, die zur Suchanfrage passen, sortiert nach
// Relevanz. Sicherheit: wir escapen die Query und wickeln in "" damit Spezial-
// Operatoren des MATCH-Syntax (NEAR, AND, OR, NOT) nicht von Mandantsuchenden
// missbraucht werden können.
export async function searchAkten(
  db: D1Database,
  kanzleiId: string,
  query: string,
  limit = 50,
): Promise<string[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  // Wörter mit min. 2 Zeichen extrahieren, jedes als Prefix-Match einzeln (wort*).
  // Mehrere Tokens werden mit AND verknüpft; FTS5-Special-Chars werden entfernt.
  const tokens = trimmed
    .toLowerCase()
    .replace(/["()*:^]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .slice(0, 8);
  if (tokens.length === 0) return [];
  const matchExpr = tokens.map((t) => `"${t}"*`).join(' AND ');

  const result = await db
    .prepare(
      `SELECT akte_id FROM akte_fts
       WHERE kanzlei_id = ?1 AND akte_fts MATCH ?2
       ORDER BY rank
       LIMIT ?3`,
    )
    .bind(kanzleiId, matchExpr, limit)
    .all<{ akte_id: string }>();
  return (result.results ?? []).map((r) => r.akte_id);
}

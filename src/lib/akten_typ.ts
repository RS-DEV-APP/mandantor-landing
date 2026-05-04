import { newId } from './ids';
import type { StepSignatureLevels } from './skribble';
import { serializePhases } from './phases';

export type AktenTyp = {
  id: string;
  kanzlei_id: string;
  name: string;
  sort_order: number;
  vollmacht_template: string | null;
  honorar_hourly: string | null;
  honorar_advance: string | null;
  dsgvo_template: string | null;
  widerruf_template: string | null;
  file_hints_json: string | null;
  signature_levels_json: string | null;
  include_sachverhalt: number;
  include_widerruf: number;
  phases_json: string | null;
  created_at: number;
};

export type AktenTypInput = {
  name: string;
  vollmacht_template: string | null;
  honorar_hourly: string | null;
  honorar_advance: string | null;
  dsgvo_template: string | null;
  widerruf_template: string | null;
  file_hints: string[];
  signature_levels: StepSignatureLevels;
  include_sachverhalt: boolean;
  include_widerruf: boolean;
  phases: string[];
};

function serializeFileHints(hints: string[]): string | null {
  const cleaned = hints.map((h) => h.trim()).filter((h) => h.length > 0).slice(0, 20);
  return cleaned.length > 0 ? JSON.stringify(cleaned) : null;
}

function serializeSignatureLevels(levels: StepSignatureLevels): string | null {
  // Wir speichern nur Steps mit Non-Default. Default = 'EES' für alle.
  const out: Record<string, string> = {};
  for (const k of [2, 3, 4] as const) {
    const v = levels[k];
    if (v && v !== 'EES') out[String(k)] = v;
  }
  return Object.keys(out).length > 0 ? JSON.stringify(out) : null;
}

export function parseFileHints(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function listAktenTypen(db: D1Database, kanzleiId: string): Promise<AktenTyp[]> {
  const result = await db
    .prepare('SELECT * FROM akten_typ WHERE kanzlei_id = ?1 ORDER BY sort_order, created_at')
    .bind(kanzleiId)
    .all<AktenTyp>();
  return result.results ?? [];
}

export async function findAktenTypById(
  db: D1Database,
  kanzleiId: string,
  id: string,
): Promise<AktenTyp | null> {
  const row = await db
    .prepare('SELECT * FROM akten_typ WHERE id = ?1 AND kanzlei_id = ?2 LIMIT 1')
    .bind(id, kanzleiId)
    .first<AktenTyp>();
  return row ?? null;
}

export async function findAktenTypByIdOnly(db: D1Database, id: string): Promise<AktenTyp | null> {
  const row = await db
    .prepare('SELECT * FROM akten_typ WHERE id = ?1 LIMIT 1')
    .bind(id)
    .first<AktenTyp>();
  return row ?? null;
}

export async function createAktenTyp(
  db: D1Database,
  kanzleiId: string,
  input: AktenTypInput,
): Promise<AktenTyp> {
  const id = newId();
  const last = await db
    .prepare('SELECT MAX(sort_order) as max_sort FROM akten_typ WHERE kanzlei_id = ?1')
    .bind(kanzleiId)
    .first<{ max_sort: number | null }>();
  const sortOrder = (last?.max_sort ?? 0) + 1;

  await db
    .prepare(
      `INSERT INTO akten_typ
        (id, kanzlei_id, name, sort_order, vollmacht_template, honorar_hourly, honorar_advance, dsgvo_template, widerruf_template, file_hints_json, signature_levels_json, include_sachverhalt, include_widerruf, phases_json)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`,
    )
    .bind(
      id,
      kanzleiId,
      input.name,
      sortOrder,
      input.vollmacht_template,
      input.honorar_hourly,
      input.honorar_advance,
      input.dsgvo_template,
      input.widerruf_template,
      serializeFileHints(input.file_hints),
      serializeSignatureLevels(input.signature_levels),
      input.include_sachverhalt ? 1 : 0,
      input.include_widerruf ? 1 : 0,
      serializePhases(input.phases),
    )
    .run();

  const created = await findAktenTypById(db, kanzleiId, id);
  if (!created) throw new Error('failed to read back created akten_typ');
  return created;
}

export async function updateAktenTyp(
  db: D1Database,
  kanzleiId: string,
  id: string,
  input: AktenTypInput,
): Promise<void> {
  await db
    .prepare(
      `UPDATE akten_typ SET
         name = ?1,
         vollmacht_template = ?2,
         honorar_hourly = ?3,
         honorar_advance = ?4,
         dsgvo_template = ?5,
         widerruf_template = ?6,
         file_hints_json = ?7,
         signature_levels_json = ?8,
         include_sachverhalt = ?9,
         include_widerruf = ?10,
         phases_json = ?11
       WHERE id = ?12 AND kanzlei_id = ?13`,
    )
    .bind(
      input.name,
      input.vollmacht_template,
      input.honorar_hourly,
      input.honorar_advance,
      input.dsgvo_template,
      input.widerruf_template,
      serializeFileHints(input.file_hints),
      serializeSignatureLevels(input.signature_levels),
      input.include_sachverhalt ? 1 : 0,
      input.include_widerruf ? 1 : 0,
      serializePhases(input.phases),
      id,
      kanzleiId,
    )
    .run();
}

export async function deleteAktenTyp(
  db: D1Database,
  kanzleiId: string,
  id: string,
): Promise<void> {
  // Detach existing akten from this typ first (set akten_typ_id to NULL).
  await db
    .prepare('UPDATE akte SET akten_typ_id = NULL WHERE akten_typ_id = ?1 AND kanzlei_id = ?2')
    .bind(id, kanzleiId)
    .run();
  await db
    .prepare('DELETE FROM akten_typ WHERE id = ?1 AND kanzlei_id = ?2')
    .bind(id, kanzleiId)
    .run();
}

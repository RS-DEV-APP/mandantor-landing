// Status-Pipeline-Helper: pro Akten-Typ definierte Phasen lesen/schreiben,
// pro Akte die aktuelle Phase setzen + auditieren + Mandant-Webhook auslösen.

export function parsePhases(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s) => typeof s === 'string')
      .map((s) => (s as string).trim())
      .filter((s) => s.length > 0)
      .slice(0, 12);
  } catch {
    return [];
  }
}

export function serializePhases(phases: string[]): string | null {
  const cleaned = phases
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 12);
  return cleaned.length > 0 ? JSON.stringify(cleaned) : null;
}

export async function setAktePhase(
  db: D1Database,
  kanzleiId: string,
  akteId: string,
  phaseIndex: number | null,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `UPDATE akte SET current_phase = ?1, phase_updated_at = ?2
       WHERE id = ?3 AND kanzlei_id = ?4`,
    )
    .bind(phaseIndex, now, akteId, kanzleiId)
    .run();
}

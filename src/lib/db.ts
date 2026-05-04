import { newId, slugify } from './ids';

export type Kanzlei = {
  id: string;
  email: string;
  display_name: string;
  slug: string;
  vollmacht_template: string | null;
  honorar_hourly: string | null;
  honorar_advance: string | null;
  logo_r2_key: string | null;
  logo_mime_type: string | null;
  brand_color: string | null;
  retention_years: number | null;
  draft_retention_months: number | null;
  onboarding_completed_at: number | null;
  impressum_url: string | null;
  datenschutz_url: string | null;
  public_intake_enabled: number;
  public_intake_other_enabled: number;
  created_at: number;
};

export type KanzleiLinks = {
  impressum_url: string | null;
  datenschutz_url: string | null;
};

export function pickKanzleiLinks(k: Kanzlei | null | undefined): KanzleiLinks | null {
  if (!k) return null;
  if (!k.impressum_url && !k.datenschutz_url) return null;
  return { impressum_url: k.impressum_url, datenschutz_url: k.datenschutz_url };
}

export async function setKanzleiBranding(
  db: D1Database,
  kanzleiId: string,
  patch: { logo_r2_key?: string | null; logo_mime_type?: string | null; brand_color?: string | null },
): Promise<void> {
  // Build dynamic UPDATE based on provided fields
  const sets: string[] = [];
  const binds: unknown[] = [];
  let i = 1;
  if (patch.logo_r2_key !== undefined) { sets.push(`logo_r2_key = ?${i++}`); binds.push(patch.logo_r2_key); }
  if (patch.logo_mime_type !== undefined) { sets.push(`logo_mime_type = ?${i++}`); binds.push(patch.logo_mime_type); }
  if (patch.brand_color !== undefined) { sets.push(`brand_color = ?${i++}`); binds.push(patch.brand_color); }
  if (sets.length === 0) return;
  binds.push(kanzleiId);
  await db.prepare(`UPDATE kanzlei SET ${sets.join(', ')} WHERE id = ?${i}`).bind(...binds).run();
}

export async function findKanzleiByEmail(db: D1Database, email: string): Promise<Kanzlei | null> {
  const row = await db
    .prepare('SELECT * FROM kanzlei WHERE email = ?1 LIMIT 1')
    .bind(email.toLowerCase())
    .first<Kanzlei>();
  return row ?? null;
}

export async function findKanzleiById(db: D1Database, id: string): Promise<Kanzlei | null> {
  const row = await db
    .prepare('SELECT * FROM kanzlei WHERE id = ?1 LIMIT 1')
    .bind(id)
    .first<Kanzlei>();
  return row ?? null;
}

export async function findKanzleiBySlug(db: D1Database, slug: string): Promise<Kanzlei | null> {
  const row = await db
    .prepare('SELECT * FROM kanzlei WHERE slug = ?1 LIMIT 1')
    .bind(slug)
    .first<Kanzlei>();
  return row ?? null;
}

export async function setKanzleiLinks(
  db: D1Database,
  kanzleiId: string,
  patch: { impressum_url: string | null; datenschutz_url: string | null },
): Promise<void> {
  await db
    .prepare('UPDATE kanzlei SET impressum_url = ?1, datenschutz_url = ?2 WHERE id = ?3')
    .bind(patch.impressum_url, patch.datenschutz_url, kanzleiId)
    .run();
}

export async function setPublicIntakeSettings(
  db: D1Database,
  kanzleiId: string,
  patch: { public_intake_enabled: 0 | 1; public_intake_other_enabled: 0 | 1 },
): Promise<void> {
  await db
    .prepare(
      'UPDATE kanzlei SET public_intake_enabled = ?1, public_intake_other_enabled = ?2 WHERE id = ?3',
    )
    .bind(patch.public_intake_enabled, patch.public_intake_other_enabled, kanzleiId)
    .run();
}

export async function createKanzlei(db: D1Database, email: string): Promise<Kanzlei> {
  const id = newId();
  const local = email.split('@')[0] ?? 'kanzlei';
  const display_name = local.charAt(0).toUpperCase() + local.slice(1);
  let slug = slugify(local);

  // Ensure slug uniqueness with simple numeric suffix retry.
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt + 1}`;
    const exists = await db
      .prepare('SELECT 1 FROM kanzlei WHERE slug = ?1')
      .bind(candidate)
      .first();
    if (!exists) {
      slug = candidate;
      break;
    }
  }

  await db
    .prepare(
      'INSERT INTO kanzlei (id, email, display_name, slug) VALUES (?1, ?2, ?3, ?4)',
    )
    .bind(id, email.toLowerCase(), display_name, slug)
    .run();

  const created = await findKanzleiById(db, id);
  if (!created) throw new Error('failed to read back created kanzlei');
  return created;
}

export async function findOrCreateKanzlei(db: D1Database, email: string): Promise<Kanzlei> {
  const existing = await findKanzleiByEmail(db, email);
  if (existing) return existing;
  return createKanzlei(db, email);
}

export async function updateKanzleiSettings(
  db: D1Database,
  id: string,
  patch: {
    display_name: string;
    vollmacht_template: string | null;
    honorar_hourly: string | null;
    honorar_advance: string | null;
    impressum_url: string | null;
    datenschutz_url: string | null;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE kanzlei
       SET display_name = ?1,
           vollmacht_template = ?2,
           honorar_hourly = ?3,
           honorar_advance = ?4,
           impressum_url = ?5,
           datenschutz_url = ?6
       WHERE id = ?7`,
    )
    .bind(
      patch.display_name,
      patch.vollmacht_template ?? null,
      patch.honorar_hourly ?? null,
      patch.honorar_advance ?? null,
      patch.impressum_url ?? null,
      patch.datenschutz_url ?? null,
      id,
    )
    .run();
}

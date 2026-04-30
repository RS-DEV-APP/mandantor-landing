import { newId, slugify } from './ids';

export type Kanzlei = {
  id: string;
  email: string;
  display_name: string;
  slug: string;
  vollmacht_template: string | null;
  honorar_hourly: string | null;
  honorar_advance: string | null;
  created_at: number;
};

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

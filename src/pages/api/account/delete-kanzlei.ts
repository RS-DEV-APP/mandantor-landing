import type { APIRoute } from 'astro';
import { findKanzleiById } from '../../../lib/db';
import { listUsersOfKanzlei } from '../../../lib/users';
import { SESSION_COOKIE } from '../../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, cookies, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !env.UPLOADS || !session) return new Response('Unauthorized', { status: 401 });
  if (session.role !== 'admin') {
    return redirect('/app/account/danger?error=' + encodeURIComponent('Nur Administratoren'), 303);
  }

  const formData = await request.formData();
  const confirm = (formData.get('confirm_name') ?? '').toString().trim();

  const kanzlei = await findKanzleiById(env.DB, session.kanzlei_id);
  if (!kanzlei) return new Response('Nicht gefunden', { status: 404 });

  if (confirm !== kanzlei.display_name) {
    return redirect(
      '/app/account/danger?error=' + encodeURIComponent('Kanzlei-Name stimmt nicht überein'),
      303,
    );
  }

  // Re-check: must still be last active admin (defense-in-depth, in case team changed mid-flow)
  const team = await listUsersOfKanzlei(env.DB, kanzlei.id);
  const otherAdmins = team.filter((u) => u.id !== session.user_id && u.role === 'admin' && u.status === 'active');
  if (otherAdmins.length > 0) {
    return redirect(
      '/app/account/danger?error=' + encodeURIComponent('Inzwischen gibt es weitere Administratoren — bitte erneut versuchen'),
      303,
    );
  }

  // Delete R2 objects: list all akte_file rows and delete each from UPLOADS bucket
  const fileRows = await env.DB
    .prepare(`SELECT akte_file.r2_key FROM akte_file
              JOIN akte ON akte_file.akte_id = akte.id
              WHERE akte.kanzlei_id = ?1`)
    .bind(kanzlei.id)
    .all<{ r2_key: string }>();
  for (const row of fileRows.results ?? []) {
    try {
      await env.UPLOADS.delete(row.r2_key);
    } catch (err) {
      console.error('R2 delete failed', row.r2_key, err);
    }
  }

  // Cascade delete in DB. Order: child tables first to respect FKs.
  const stmts = [
    env.DB.prepare(`DELETE FROM akte_file WHERE akte_id IN (SELECT id FROM akte WHERE kanzlei_id = ?1)`).bind(kanzlei.id),
    env.DB.prepare(`DELETE FROM akte_step WHERE akte_id IN (SELECT id FROM akte WHERE kanzlei_id = ?1)`).bind(kanzlei.id),
    env.DB.prepare(`DELETE FROM akte WHERE kanzlei_id = ?1`).bind(kanzlei.id),
    env.DB.prepare(`DELETE FROM akten_typ WHERE kanzlei_id = ?1`).bind(kanzlei.id),
    env.DB.prepare(`DELETE FROM invoice WHERE kanzlei_id = ?1`).bind(kanzlei.id),
    env.DB.prepare(`DELETE FROM subscription WHERE kanzlei_id = ?1`).bind(kanzlei.id),
    env.DB.prepare(`DELETE FROM user_invitation WHERE kanzlei_id = ?1`).bind(kanzlei.id),
    env.DB.prepare(`DELETE FROM session WHERE kanzlei_id = ?1`).bind(kanzlei.id),
    env.DB.prepare(`DELETE FROM magic_link WHERE kanzlei_id = ?1`).bind(kanzlei.id),
    env.DB.prepare(`DELETE FROM kanzlei_user WHERE kanzlei_id = ?1`).bind(kanzlei.id),
    env.DB.prepare(`DELETE FROM kanzlei WHERE id = ?1`).bind(kanzlei.id),
  ];
  await env.DB.batch(stmts);

  cookies.delete(SESSION_COOKIE, { path: '/' });
  return redirect('/?deleted=1', 303);
};

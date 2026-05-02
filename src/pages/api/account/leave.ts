import type { APIRoute } from 'astro';
import { softDeleteUser, listUsersOfKanzlei } from '../../../lib/users';
import { deleteSessionsForUser, SESSION_COOKIE } from '../../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ locals, cookies, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !session) return new Response('Unauthorized', { status: 401 });

  // If admin: ensure another admin remains
  if (session.role === 'admin') {
    const team = await listUsersOfKanzlei(env.DB, session.kanzlei_id);
    const otherAdmins = team.filter((u) => u.id !== session.user_id && u.role === 'admin' && u.status === 'active');
    if (otherAdmins.length === 0) {
      return redirect(
        '/app/account/danger?error=' + encodeURIComponent('Sie sind letzter Administrator — nutzen Sie stattdessen "Kanzlei löschen"'),
        303,
      );
    }
  }

  await softDeleteUser(env.DB, session.kanzlei_id, session.user_id);
  await deleteSessionsForUser(env.DB, session.user_id);
  cookies.delete(SESSION_COOKIE, { path: '/' });
  return redirect('/app/login?left=1', 303);
};

import type { APIRoute } from 'astro';
import { findUserById, softDeleteUser } from '../../../../lib/users';
import { deleteSessionsForUser } from '../../../../lib/auth';
import { appendAudit, buildAuditContext } from '../../../../lib/audit';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !session) return new Response('Unauthorized', { status: 401 });
  if (session.role !== 'admin') {
    return redirect('/app/account/team?error=' + encodeURIComponent('Nur Administratoren können Mitglieder entfernen'), 303);
  }

  const formData = await request.formData();
  const targetId = (formData.get('user_id') ?? '').toString();
  if (!targetId) return new Response('user_id fehlt', { status: 400 });
  if (targetId === session.user_id) {
    return redirect('/app/account/team?error=' + encodeURIComponent('Sie können sich nicht selbst entfernen'), 303);
  }

  const target = await findUserById(env.DB, targetId);
  if (!target || target.kanzlei_id !== session.kanzlei_id) {
    return new Response('Nicht gefunden', { status: 404 });
  }

  await softDeleteUser(env.DB, session.kanzlei_id, target.id);
  await deleteSessionsForUser(env.DB, target.id);
  await appendAudit(env.DB, env.SECRET_KEY, session.kanzlei_id, buildAuditContext(request, session), {
    eventType: 'team.removed',
    subjectType: 'kanzlei_user',
    subjectId: target.id,
    payload: { email: target.email, role: target.role },
  });

  return redirect('/app/account/team?removed=' + encodeURIComponent(target.email), 303);
};

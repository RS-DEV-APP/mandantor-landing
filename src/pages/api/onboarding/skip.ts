import type { APIRoute } from 'astro';
import { appendAudit, buildAuditContext } from '../../../lib/audit';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !session) return new Response('Unauthorized', { status: 401 });

  const now = Math.floor(Date.now() / 1000);
  await env.DB
    .prepare('UPDATE kanzlei SET onboarding_completed_at = ?1 WHERE id = ?2 AND onboarding_completed_at IS NULL')
    .bind(now, session.kanzlei_id)
    .run();

  try {
    await appendAudit(env.DB, env.SECRET_KEY, session.kanzlei_id, buildAuditContext(request, session), {
      eventType: 'kanzlei.onboarding_skipped',
      subjectType: 'kanzlei',
      subjectId: session.kanzlei_id,
    });
  } catch (err) {
    console.error('audit failed', err);
  }

  return redirect('/app/dashboard', 303);
};

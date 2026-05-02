import type { APIRoute } from 'astro';
import { findAkteById } from '../../../lib/akten';
import { reactivateAkte } from '../../../lib/retention';
import { appendAudit, buildAuditContext } from '../../../lib/audit';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !session) return new Response('Unauthorized', { status: 401 });

  const formData = await request.formData();
  const akteId = (formData.get('akte_id') ?? '').toString();
  if (!akteId) return new Response('akte_id fehlt', { status: 400 });

  const akte = await findAkteById(env.DB, session.kanzlei_id, akteId);
  if (!akte) return new Response('Nicht gefunden', { status: 404 });

  await reactivateAkte(env.DB, session.kanzlei_id, akteId);
  await appendAudit(env.DB, env.SECRET_KEY, session.kanzlei_id, buildAuditContext(request, session), {
    eventType: 'akte.reactivated',
    subjectType: 'akte',
    subjectId: akteId,
    payload: { previous_status: akte.status, was_retention_marked: !!akte.retention_marked_at },
  });

  return redirect('/app/dashboard?reactivated=' + encodeURIComponent(akte.case_label ?? akte.id.slice(0, 8)), 303);
};

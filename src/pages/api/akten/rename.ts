import type { APIRoute } from 'astro';
import { findAkteById, renameAkte } from '../../../lib/akten';
import { appendAudit, buildAuditContext } from '../../../lib/audit';
import { rebuildFtsAsync } from '../../../lib/search';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !session) return new Response('Unauthorized', { status: 401 });

  const formData = await request.formData();
  const akteId = (formData.get('akte_id') ?? '').toString();
  const newLabel = (formData.get('case_label') ?? '').toString().trim();

  if (!akteId) return new Response('akte_id fehlt', { status: 400 });
  if (newLabel.length > 200) return new Response('Bezeichnung zu lang', { status: 400 });

  const akte = await findAkteById(env.DB, session.kanzlei_id, akteId);
  if (!akte) return new Response('Nicht gefunden', { status: 404 });

  await renameAkte(env.DB, session.kanzlei_id, akteId, newLabel || null);
  await appendAudit(env.DB, env.SECRET_KEY, session.kanzlei_id, buildAuditContext(request, session), {
    eventType: 'akte.renamed',
    subjectType: 'akte',
    subjectId: akteId,
    payload: { old_label: akte.case_label, new_label: newLabel || null },
  });
  rebuildFtsAsync(env.DB, locals.runtime?.ctx, akteId);
  return redirect(`/app/akten/${akteId}`, 303);
};

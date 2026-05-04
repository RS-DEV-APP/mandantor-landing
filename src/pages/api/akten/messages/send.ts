import type { APIRoute } from 'astro';
import { findAkteById } from '../../../../lib/akten';
import { createMessage } from '../../../../lib/messages';
import { appendAudit, buildAuditContext } from '../../../../lib/audit';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !env.SECRET_KEY || !session) return new Response('Unauthorized', { status: 401 });

  const formData = await request.formData();
  const akteId = (formData.get('akte_id') ?? '').toString();
  const body = (formData.get('body') ?? '').toString().trim().slice(0, 5000);
  if (!akteId || !body) return new Response('akte_id und body erforderlich', { status: 400 });

  const akte = await findAkteById(env.DB, session.kanzlei_id, akteId);
  if (!akte) return new Response('Nicht gefunden', { status: 404 });

  await createMessage(env.DB, {
    akteId,
    kanzleiId: session.kanzlei_id,
    sender: 'lawyer',
    senderUserId: session.user_id,
    body,
  });

  await appendAudit(env.DB, env.SECRET_KEY, session.kanzlei_id, buildAuditContext(request, session), {
    eventType: 'akte.message_sent',
    subjectType: 'akte',
    subjectId: akteId,
    payload: { sender: 'lawyer', length: body.length },
  });

  return redirect(`/app/akten/${akteId}#chat`, 303);
};

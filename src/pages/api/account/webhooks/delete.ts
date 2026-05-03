import type { APIRoute } from 'astro';
import { deleteWebhook, findWebhook } from '../../../../lib/webhooks';
import { appendAudit, buildAuditContext } from '../../../../lib/audit';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !env.SECRET_KEY || !session) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (session.role !== 'admin') {
    return redirect(
      '/app/account/webhooks?error=' + encodeURIComponent('Nur Administratoren können Webhooks löschen'),
      303,
    );
  }

  const formData = await request.formData();
  const webhookId = (formData.get('webhook_id') ?? '').toString();
  if (!webhookId) return new Response('webhook_id fehlt', { status: 400 });

  const endpoint = await findWebhook(env.DB, session.kanzlei_id, webhookId);
  if (!endpoint) return new Response('Nicht gefunden', { status: 404 });

  await deleteWebhook(env.DB, session.kanzlei_id, webhookId);

  await appendAudit(env.DB, env.SECRET_KEY, session.kanzlei_id, buildAuditContext(request, session), {
    eventType: 'webhook.deleted',
    subjectType: 'webhook_endpoint',
    subjectId: webhookId,
    payload: { url: endpoint.url },
  });

  return redirect('/app/account/webhooks?deleted=1', 303);
};

import type { APIRoute } from 'astro';
import { fireWebhook, findWebhook } from '../../../../lib/webhooks';
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
      '/app/account/webhooks?error=' + encodeURIComponent('Nur Administratoren können Webhooks testen'),
      303,
    );
  }

  const formData = await request.formData();
  const webhookId = (formData.get('webhook_id') ?? '').toString();
  if (!webhookId) return new Response('webhook_id fehlt', { status: 400 });

  const endpoint = await findWebhook(env.DB, session.kanzlei_id, webhookId);
  if (!endpoint) return new Response('Nicht gefunden', { status: 404 });

  const result = await fireWebhook(env.DB, endpoint, 'webhook.test', {
    message: 'Test from Mandantor',
    sent_at: Math.floor(Date.now() / 1000),
  });

  await appendAudit(env.DB, env.SECRET_KEY, session.kanzlei_id, buildAuditContext(request, session), {
    eventType: 'webhook.test',
    subjectType: 'webhook_endpoint',
    subjectId: webhookId,
    payload: { url: endpoint.url, status_code: result.statusCode, ok: result.ok },
  });

  const params = new URLSearchParams();
  params.set('tested', webhookId);
  params.set('test_ok', result.ok ? '1' : '0');
  if (result.statusCode !== null) params.set('test_status', String(result.statusCode));
  if (result.error) params.set('test_error', result.error);
  return redirect(`/app/account/webhooks?${params.toString()}`, 303);
};

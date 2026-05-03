import type { APIRoute } from 'astro';
import { ALL_WEBHOOK_EVENTS, createWebhook } from '../../../../lib/webhooks';
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
      '/app/account/webhooks?error=' + encodeURIComponent('Nur Administratoren können Webhooks anlegen'),
      303,
    );
  }

  const formData = await request.formData();
  const url = (formData.get('url') ?? '').toString().trim();
  const description = (formData.get('description') ?? '').toString().trim().slice(0, 200) || null;
  const events = formData.getAll('events').map((v) => v.toString());

  if (!url || !url.startsWith('https://')) {
    return redirect(
      '/app/account/webhooks?error=' + encodeURIComponent('URL muss mit https:// beginnen'),
      303,
    );
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) {
      return redirect(
        '/app/account/webhooks?error=' + encodeURIComponent('localhost-URLs sind nicht erlaubt'),
        303,
      );
    }
  } catch {
    return redirect(
      '/app/account/webhooks?error=' + encodeURIComponent('Ungültige URL'),
      303,
    );
  }

  const validEvents = events.filter((e) => (ALL_WEBHOOK_EVENTS as string[]).includes(e));
  if (validEvents.length === 0) {
    return redirect(
      '/app/account/webhooks?error=' + encodeURIComponent('Bitte mindestens ein Event auswählen'),
      303,
    );
  }

  const endpoint = await createWebhook(env.DB, session.kanzlei_id, url, validEvents, description);

  await appendAudit(env.DB, env.SECRET_KEY, session.kanzlei_id, buildAuditContext(request, session), {
    eventType: 'webhook.created',
    subjectType: 'webhook_endpoint',
    subjectId: endpoint.id,
    payload: { url, events: validEvents, description },
  });

  return redirect(`/app/account/webhooks?created=${endpoint.id}`, 303);
};

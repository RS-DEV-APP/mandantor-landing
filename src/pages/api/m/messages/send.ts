import type { APIRoute } from 'astro';
import { findAkteByMandantToken, akteLang } from '../../../../lib/akten';
import { findKanzleiById } from '../../../../lib/db';
import { createMessage } from '../../../../lib/messages';
import { sendNewMandantMessageNotification } from '../../../../lib/mail';
import { appendAudit } from '../../../../lib/audit';
import { dispatchEvent } from '../../../../lib/webhooks';

export const prerender = false;

function getClientIp(request: Request): string | null {
  return request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? null;
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  if (!env?.DB || !env.SECRET_KEY) {
    return new Response('Server misconfigured', { status: 500 });
  }

  const formData = await request.formData();
  const token = (formData.get('token') ?? '').toString();
  const body = (formData.get('body') ?? '').toString().trim().slice(0, 5000);
  if (!token || !body) return new Response('Invalid request', { status: 400 });

  const akte = await findAkteByMandantToken(env.DB, token);
  if (!akte) return new Response('Nicht gefunden / Not found', { status: 404 });
  const lang = akteLang(akte);
  // Mandant kann erst nach submit/reopen-Workflow Nachrichten schicken.
  if (akte.status === 'draft' || akte.status === 'archived') {
    const msg = lang === 'en' ? 'Messages not available in this state' : 'Nachrichten sind in diesem Aktenstatus nicht verfügbar';
    return new Response(msg, { status: 403 });
  }

  await createMessage(env.DB, {
    akteId: akte.id,
    kanzleiId: akte.kanzlei_id,
    sender: 'mandant',
    senderUserId: null,
    body,
  });

  const ip = getClientIp(request);
  const ua = request.headers.get('user-agent');
  await appendAudit(env.DB, env.SECRET_KEY, akte.kanzlei_id, {
    actorUserId: null,
    actorEmail: akte.mandant_email,
    ip,
    ua,
  }, {
    eventType: 'akte.message_sent',
    subjectType: 'akte',
    subjectId: akte.id,
    payload: { sender: 'mandant', length: body.length },
  });

  // Webhook + E-Mail-Notification an die Kanzlei (Hintergrund)
  await dispatchEvent(env.DB, locals.runtime?.ctx, akte.kanzlei_id, 'akte.message_from_mandant', {
    akte_id: akte.id,
    case_label: akte.case_label,
    mandant_name: akte.mandant_name,
    mandant_email: akte.mandant_email,
    body_preview: body.slice(0, 200),
    created_at: Math.floor(Date.now() / 1000),
  });

  try {
    const kanzlei = await findKanzleiById(env.DB, akte.kanzlei_id);
    if (kanzlei) {
      const origin = new URL(request.url).origin;
      const akteUrl = `${origin}/app/akten/${akte.id}#chat`;
      const mailPromise = sendNewMandantMessageNotification(
        env,
        kanzlei.email,
        akte.mandant_name ?? (lang === 'en' ? 'A client' : 'Ein Mandant'),
        akte.case_label,
        body.slice(0, 500),
        akteUrl,
      );
      if (locals.runtime?.ctx) {
        locals.runtime.ctx.waitUntil(mailPromise.catch((err) => console.error('msg notif mail failed', err)));
      }
    }
  } catch (err) {
    console.error('msg notif failed', err);
  }

  return redirect(`/m/${token}?msg_sent=1#chat`, 303);
};

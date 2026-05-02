import type { APIRoute } from 'astro';
import { findAkteById, reopenAkte } from '../../../lib/akten';
import { findKanzleiById } from '../../../lib/db';
import { sendReopenRequestEmail } from '../../../lib/mail';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !session) return new Response('Unauthorized', { status: 401 });

  const formData = await request.formData();
  const akteId = (formData.get('akte_id') ?? '').toString();
  const reason = (formData.get('reason') ?? '').toString().trim().slice(0, 500);
  if (!akteId || !reason) return new Response('akte_id und Grund erforderlich', { status: 400 });

  const akte = await findAkteById(env.DB, session.kanzlei_id, akteId);
  if (!akte) return new Response('Nicht gefunden', { status: 404 });
  if (akte.status !== 'submitted') {
    return redirect(`/app/akten/${akteId}?error=` + encodeURIComponent('Nur eingereichte Akten können zurückgegeben werden'), 303);
  }

  await reopenAkte(env.DB, session.kanzlei_id, akteId, reason);

  if (akte.mandant_email) {
    try {
      const kanzlei = await findKanzleiById(env.DB, akte.kanzlei_id);
      const origin = new URL(request.url).origin;
      const inviteUrl = `${origin}/m/${akte.mandant_token}`;
      await sendReopenRequestEmail(
        env,
        akte.mandant_email,
        kanzlei?.display_name ?? 'Ihre Kanzlei',
        reason,
        inviteUrl,
      );
    } catch (err) {
      console.error('reopen mail failed', err);
    }
  }

  return redirect(`/app/akten/${akteId}?reopened=1`, 303);
};

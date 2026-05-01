import type { APIRoute } from 'astro';
import { findAkteById } from '../../../lib/akten';
import { findKanzleiById } from '../../../lib/db';
import { sendMandantInviteEmail } from '../../../lib/mail';

export const prerender = false;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const formData = await request.formData();
  const akteId = (formData.get('akte_id') ?? '').toString();
  const mandantEmail = (formData.get('mandant_email') ?? '').toString().trim().toLowerCase();

  if (!akteId) return new Response('akte_id fehlt', { status: 400 });
  if (!mandantEmail || !EMAIL_REGEX.test(mandantEmail)) {
    return redirect(`/app/akten/${akteId}?invite_error=` + encodeURIComponent('Ungültige E-Mail-Adresse'), 303);
  }

  const akte = await findAkteById(env.DB, session.kanzlei_id, akteId);
  if (!akte) return new Response('Nicht gefunden', { status: 404 });

  const kanzlei = await findKanzleiById(env.DB, akte.kanzlei_id);
  if (!kanzlei) return new Response('Kanzlei nicht gefunden', { status: 404 });

  const origin = new URL(request.url).origin;
  const inviteUrl = `${origin}/m/${akte.mandant_token}`;

  try {
    await sendMandantInviteEmail(env, mandantEmail, kanzlei.display_name, inviteUrl, akte.case_label);
  } catch (err) {
    console.error('mandant invite failed', err);
    return redirect(
      `/app/akten/${akteId}?invite_error=` + encodeURIComponent('Versand fehlgeschlagen — bitte erneut versuchen'),
      303,
    );
  }

  return redirect(`/app/akten/${akteId}?invited=` + encodeURIComponent(mandantEmail), 303);
};

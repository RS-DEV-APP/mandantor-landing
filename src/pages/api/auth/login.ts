import type { APIRoute } from 'astro';
import { findOrCreateKanzlei } from '../../../lib/db';
import { createMagicLink } from '../../../lib/auth';
import { sendMagicLinkEmail } from '../../../lib/mail';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  if (!env?.DB || !env.SECRET_KEY) {
    return new Response('Server misconfigured', { status: 500 });
  }

  const formData = await request.formData();
  const email = (formData.get('email') ?? '').toString().trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return redirect('/app/login?error=' + encodeURIComponent('Ungültige E-Mail-Adresse.'), 303);
  }

  try {
    const kanzlei = await findOrCreateKanzlei(env.DB, email);
    const token = await createMagicLink(env.DB, env.SECRET_KEY, email, kanzlei.id);

    const origin = new URL(request.url).origin;
    const magicUrl = `${origin}/auth/verify?token=${encodeURIComponent(token)}`;

    await sendMagicLinkEmail(env, email, magicUrl);
    return redirect('/app/login?sent=1', 303);
  } catch (err) {
    console.error('login error', err);
    const msg = (err as Error).message ?? 'Unbekannter Fehler.';
    return redirect(
      '/app/login?error=' + encodeURIComponent('Versand fehlgeschlagen: ' + msg),
      303,
    );
  }
};

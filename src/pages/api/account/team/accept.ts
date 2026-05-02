import type { APIRoute } from 'astro';
import { consumeInvitation, activateInvitedUser } from '../../../../lib/users';
import { createMagicLink } from '../../../../lib/auth';
import { sendMagicLinkEmail } from '../../../../lib/mail';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  if (!env?.DB || !env.SECRET_KEY) return new Response('Server misconfigured', { status: 500 });

  const formData = await request.formData();
  const token = (formData.get('token') ?? '').toString();
  if (!token) return new Response('token fehlt', { status: 400 });

  const inv = await consumeInvitation(env.DB, env.SECRET_KEY, token);
  if (!inv) {
    return redirect(
      '/app/invite?token=' + encodeURIComponent(token) + '&error=' +
      encodeURIComponent('Einladung ungültig oder abgelaufen'),
      303,
    );
  }

  const user = await activateInvitedUser(env.DB, inv.kanzlei_id, inv.email, inv.role, null);

  // Send a fresh magic-link mail so the new user can log in.
  const magicToken = await createMagicLink(env.DB, env.SECRET_KEY, user.email, user.kanzlei_id);
  const origin = new URL(request.url).origin;
  const magicUrl = `${origin}/auth/verify?token=${encodeURIComponent(magicToken)}`;

  try {
    await sendMagicLinkEmail(env, user.email, magicUrl);
  } catch (err) {
    console.error('post-invite magic mail failed', err);
  }

  return redirect('/app/login?invited=1', 303);
};

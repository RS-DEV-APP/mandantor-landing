import type { APIRoute } from 'astro';
import { consumeMagicLink, createSession, SESSION_COOKIE, SESSION_MAX_AGE } from '../../lib/auth';

export const prerender = false;

export const GET: APIRoute = async ({ url, request, locals, cookies, redirect }) => {
  const env = locals.runtime?.env;
  if (!env?.DB || !env.SECRET_KEY) {
    return new Response('Server misconfigured', { status: 500 });
  }

  const token = url.searchParams.get('token');
  if (!token) {
    return redirect('/app/login?error=' + encodeURIComponent('Ungültiger Link.'), 303);
  }

  const result = await consumeMagicLink(env.DB, env.SECRET_KEY, token);
  if (!result) {
    return redirect(
      '/app/login?error=' + encodeURIComponent('Link ungültig oder abgelaufen.'),
      303,
    );
  }

  const ip = request.headers.get('cf-connecting-ip');
  const ua = request.headers.get('user-agent');
  const sessionToken = await createSession(env.DB, env.SECRET_KEY, result.kanzlei_id, ip, ua);

  cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });

  return redirect('/app/dashboard', 303);
};

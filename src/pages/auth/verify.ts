import type { APIRoute } from 'astro';
import { consumeMagicLink, createSession, SESSION_COOKIE, SESSION_MAX_AGE } from '../../lib/auth';
import { findUserByEmail, createKanzleiAdmin } from '../../lib/users';
import { createPending2fa, PENDING_2FA_COOKIE, PENDING_2FA_MAX_AGE } from '../../lib/pending2fa';

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

  let user = await findUserByEmail(env.DB, result.email);
  if (!user) {
    user = await createKanzleiAdmin(env.DB, result.kanzlei_id, result.email);
  }

  // 2FA-Gate: wenn aktiv → erst Challenge abfragen, kein Session-Cookie
  if (user.totp_secret) {
    const pendingToken = await createPending2fa(env.DB, env.SECRET_KEY, user.id, user.kanzlei_id);
    cookies.set(PENDING_2FA_COOKIE, pendingToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: PENDING_2FA_MAX_AGE,
    });
    return redirect('/app/login/totp', 303);
  }

  const ip = request.headers.get('cf-connecting-ip');
  const ua = request.headers.get('user-agent');
  const sessionToken = await createSession(env.DB, env.SECRET_KEY, user.kanzlei_id, user.id, ip, ua);

  cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });

  return redirect('/app/dashboard', 303);
};

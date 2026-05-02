import type { APIRoute } from 'astro';
import {
  lookupPending2fa,
  deletePending2fa,
  PENDING_2FA_COOKIE,
} from '../../../lib/pending2fa';
import { createSession, SESSION_COOKIE, SESSION_MAX_AGE } from '../../../lib/auth';
import { findUserById, consumeRecoveryCode } from '../../../lib/users';
import { verifyTotp, hashRecoveryCode } from '../../../lib/totp';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, cookies, redirect }) => {
  const env = locals.runtime?.env;
  if (!env?.DB || !env.SECRET_KEY) return new Response('Server misconfigured', { status: 500 });

  const pendingToken = cookies.get(PENDING_2FA_COOKIE)?.value;
  const pending = await lookupPending2fa(env.DB, env.SECRET_KEY, pendingToken);
  if (!pending || !pendingToken) {
    return redirect('/app/login?error=' + encodeURIComponent('Sitzung abgelaufen — bitte erneut anmelden'), 303);
  }

  const formData = await request.formData();
  const codeRaw = (formData.get('code') ?? '').toString().trim();

  const user = await findUserById(env.DB, pending.user_id);
  if (!user || !user.totp_secret) {
    return redirect('/app/login?error=' + encodeURIComponent('Konto nicht gefunden oder 2FA inaktiv'), 303);
  }

  let ok = false;

  // Try TOTP first (6 digits)
  if (/^\d{6}$/.test(codeRaw.replace(/\s/g, ''))) {
    ok = await verifyTotp(user.totp_secret, codeRaw);
  } else {
    // Recovery code path
    const hashed = await hashRecoveryCode(env.SECRET_KEY, codeRaw);
    ok = await consumeRecoveryCode(env.DB, user.id, hashed);
  }

  if (!ok) {
    return redirect(
      '/app/login/totp?error=' + encodeURIComponent('Code nicht gültig — bitte erneut versuchen'),
      303,
    );
  }

  // Convert pending → real session
  await deletePending2fa(env.DB, env.SECRET_KEY, pendingToken);
  cookies.delete(PENDING_2FA_COOKIE, { path: '/' });

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

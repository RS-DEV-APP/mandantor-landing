import { defineMiddleware } from 'astro:middleware';
import { lookupSession, SESSION_COOKIE } from './lib/auth';
import { findKanzleiById } from './lib/db';

const PROTECTED_PREFIX = '/app/';
const PUBLIC_APP_PATHS = new Set(['/app/login', '/app/login/']);

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, cookies, locals, redirect } = context;

  if (url.pathname.startsWith(PROTECTED_PREFIX) && !PUBLIC_APP_PATHS.has(url.pathname)) {
    const env = locals.runtime?.env;
    if (!env?.DB || !env.SECRET_KEY) {
      return new Response('Server misconfigured: missing DB or SECRET_KEY', { status: 500 });
    }

    const cookieToken = cookies.get(SESSION_COOKIE)?.value;
    const session = await lookupSession(env.DB, env.SECRET_KEY, cookieToken);
    if (!session) return redirect('/app/login', 302);

    const kanzlei = await findKanzleiById(env.DB, session.kanzlei_id);
    if (!kanzlei) return redirect('/app/login', 302);

    locals.session = { kanzlei_id: kanzlei.id, email: kanzlei.email };
  }

  return next();
});

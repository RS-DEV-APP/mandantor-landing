import { defineMiddleware } from 'astro:middleware';
import { lookupSession, SESSION_COOKIE } from './lib/auth';
import { findKanzleiById } from './lib/db';

const PUBLIC_APP_PATHS = new Set(['/app/login', '/app/login/']);
const PUBLIC_API_PREFIXES = ['/api/auth/', '/api/health'];

function needsAuth(pathname: string): boolean {
  if (pathname.startsWith('/app/')) return !PUBLIC_APP_PATHS.has(pathname);
  if (pathname.startsWith('/api/')) return !PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p));
  return false;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, cookies, locals, redirect } = context;

  if (needsAuth(url.pathname)) {
    const env = locals.runtime?.env;
    if (!env?.DB || !env.SECRET_KEY) {
      return new Response('Server misconfigured: missing DB or SECRET_KEY', { status: 500 });
    }

    const cookieToken = cookies.get(SESSION_COOKIE)?.value;
    const session = await lookupSession(env.DB, env.SECRET_KEY, cookieToken);
    if (!session) {
      return url.pathname.startsWith('/api/')
        ? new Response('Unauthorized', { status: 401 })
        : redirect('/app/login', 302);
    }

    const kanzlei = await findKanzleiById(env.DB, session.kanzlei_id);
    if (!kanzlei) {
      return url.pathname.startsWith('/api/')
        ? new Response('Unauthorized', { status: 401 })
        : redirect('/app/login', 302);
    }

    locals.session = { kanzlei_id: kanzlei.id, email: kanzlei.email };
  }

  return next();
});

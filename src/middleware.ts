import { defineMiddleware } from 'astro:middleware';
import { lookupSession, SESSION_COOKIE } from './lib/auth';
import { findKanzleiById } from './lib/db';
import { findUserById } from './lib/users';
import { hashToken } from './lib/hash';

const PUBLIC_APP_PATHS = new Set(['/app/login', '/app/login/', '/app/invite', '/app/invite/']);
const PUBLIC_API_PREFIXES = ['/api/auth/', '/api/health', '/api/m/', '/api/stripe/webhook', '/api/cron/'];

function needsAuth(pathname: string): boolean {
  if (pathname.startsWith('/app/')) return !PUBLIC_APP_PATHS.has(pathname);
  if (pathname.startsWith('/api/')) {
    if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) return false;
    // /api/kanzlei/<id>/logo is public so the mandant wizard can show the kanzlei logo
    if (/^\/api\/kanzlei\/[^/]+\/logo$/.test(pathname)) return false;
    return true;
  }
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

    const user = await findUserById(env.DB, session.user_id);
    if (!user || user.status === 'removed' || user.kanzlei_id !== kanzlei.id) {
      return url.pathname.startsWith('/api/')
        ? new Response('Unauthorized', { status: 401 })
        : redirect('/app/login', 302);
    }

    const tokenHash = cookieToken ? await hashToken(env.SECRET_KEY, cookieToken) : null;

    locals.session = {
      kanzlei_id: kanzlei.id,
      user_id: user.id,
      email: user.email,
      role: user.role,
      session_token_hash: tokenHash,
    };
  }

  return next();
});

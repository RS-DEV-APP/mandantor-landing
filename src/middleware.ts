import { defineMiddleware } from 'astro:middleware';
import { lookupSession, SESSION_COOKIE } from './lib/auth';
import { findKanzleiById } from './lib/db';
import { findUserById } from './lib/users';
import { hashToken } from './lib/hash';

const PUBLIC_APP_PATHS = new Set(['/app/login', '/app/login/', '/app/invite', '/app/invite/']);
const PUBLIC_API_PREFIXES = ['/api/auth/', '/api/health', '/api/m/', '/api/o/', '/api/stripe/webhook', '/api/cron/'];

// HTTP-Basic-Auth-Schranke vor der gesamten Seite. Default: aktiv mit fest
// hinterlegtem Passwort. Override via Cloudflare-Env-Var SITE_PASSWORD möglich
// (für späteres Rotieren ohne Code-Deploy). Browser cached die Credentials für
// die Origin → kein Re-Prompt pro Request.
//
// Bypass nur für Endpoints, die ihre eigene Auth haben (Webhooks/Crons) +
// statische Assets, die das CF-CDN ohne Worker-Pass durchreicht.
const DEFAULT_SITE_PASSWORD = 'mandantor-2026';
const SITE_AUTH_BYPASS_PREFIXES = ['/api/cron/', '/api/stripe/webhook'];
const SITE_AUTH_BYPASS_EXACT = new Set(['/robots.txt', '/icon.svg', '/favicon.ico']);

function siteAuthOk(authorization: string | null, expected: string): boolean {
  if (!authorization || !authorization.startsWith('Basic ')) return false;
  try {
    const decoded = atob(authorization.slice(6));
    const idx = decoded.indexOf(':');
    const password = idx >= 0 ? decoded.slice(idx + 1) : decoded;
    return password === expected;
  } catch {
    return false;
  }
}

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
  const { url, cookies, locals, redirect, request } = context;

  // ── Site-weites Basic-Auth-Gate (immer aktiv; Override via env.SITE_PASSWORD) ──
  const sitePassword = (locals.runtime?.env as { SITE_PASSWORD?: string } | undefined)?.SITE_PASSWORD
    ?? DEFAULT_SITE_PASSWORD;
  {
    const path = url.pathname;
    const bypass = SITE_AUTH_BYPASS_EXACT.has(path)
      || SITE_AUTH_BYPASS_PREFIXES.some((p) => path.startsWith(p))
      || path.startsWith('/_astro/'); // Astro-Build-Assets
    if (!bypass && !siteAuthOk(request.headers.get('authorization'), sitePassword)) {
      return new Response('Mandantor — geschützter Bereich. Bitte Zugangsdaten eingeben.', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="Mandantor"',
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }
  }

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

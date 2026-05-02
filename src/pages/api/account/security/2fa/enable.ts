import type { APIRoute } from 'astro';
import { findUserById, setUserTotp } from '../../../../../lib/users';
import {
  verifyTotp,
  generateRecoveryCodes,
  hashAllRecoveryCodes,
} from '../../../../../lib/totp';
import { appendAudit, buildAuditContext } from '../../../../../lib/audit';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !env.SECRET_KEY || !session) return new Response('Unauthorized', { status: 401 });

  const formData = await request.formData();
  const secret = (formData.get('secret') ?? '').toString().trim();
  const code = (formData.get('code') ?? '').toString().trim();

  if (!secret) {
    return redirect('/app/account/security/2fa?error=' + encodeURIComponent('Secret fehlt'), 303);
  }

  const user = await findUserById(env.DB, session.user_id);
  if (!user) return new Response('User nicht gefunden', { status: 404 });
  if (user.totp_secret) {
    return redirect('/app/account/security/2fa?error=' + encodeURIComponent('2FA ist bereits aktiv'), 303);
  }

  const ok = await verifyTotp(secret, code);
  if (!ok) {
    // Secret in der URL halten, damit Reload den gleichen QR zeigt
    return redirect(
      '/app/account/security/2fa?s=' + encodeURIComponent(secret) +
      '&error=' + encodeURIComponent('Code stimmt nicht — bitte erneut versuchen'),
      303,
    );
  }

  const codes = generateRecoveryCodes(8);
  const hashed = await hashAllRecoveryCodes(env.SECRET_KEY, codes);
  await setUserTotp(env.DB, user.id, secret, hashed);
  await appendAudit(env.DB, env.SECRET_KEY, session.kanzlei_id, buildAuditContext(request, session), {
    eventType: '2fa.enabled',
    subjectType: 'kanzlei_user',
    subjectId: user.id,
  });

  // Recovery-Codes Klartext in der Redirect-URL — sind nur einmal sichtbar.
  const params = new URLSearchParams();
  params.set('enabled', '1');
  for (const c of codes) params.append('rc', c);
  return redirect('/app/account/security/2fa?' + params.toString(), 303);
};

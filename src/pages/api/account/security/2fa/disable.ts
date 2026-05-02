import type { APIRoute } from 'astro';
import { findUserById, setUserTotp } from '../../../../../lib/users';
import { verifyTotp } from '../../../../../lib/totp';
import { appendAudit, buildAuditContext } from '../../../../../lib/audit';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !session) return new Response('Unauthorized', { status: 401 });

  const formData = await request.formData();
  const code = (formData.get('code') ?? '').toString().trim();

  const user = await findUserById(env.DB, session.user_id);
  if (!user || !user.totp_secret) {
    return redirect('/app/account/security/2fa?error=' + encodeURIComponent('2FA ist nicht aktiv'), 303);
  }

  const ok = await verifyTotp(user.totp_secret, code);
  if (!ok) {
    return redirect('/app/account/security/2fa?error=' + encodeURIComponent('Code stimmt nicht'), 303);
  }

  await setUserTotp(env.DB, user.id, null, null);
  await appendAudit(env.DB, env.SECRET_KEY, session.kanzlei_id, buildAuditContext(request, session), {
    eventType: '2fa.disabled',
    subjectType: 'kanzlei_user',
    subjectId: user.id,
  });
  return redirect('/app/account/security/2fa?error=' + encodeURIComponent('2FA wurde deaktiviert'), 303);
};

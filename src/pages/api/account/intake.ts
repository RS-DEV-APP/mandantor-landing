import type { APIRoute } from 'astro';
import { setPublicIntakeSettings } from '../../../lib/db';
import { appendAudit, buildAuditContext } from '../../../lib/audit';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !env.SECRET_KEY || !session) return new Response('Unauthorized', { status: 401 });
  if (session.role !== 'admin') {
    return redirect('/app/account/intake?error=' + encodeURIComponent('Nur Administratoren können das Online-Mandat verwalten'), 303);
  }

  const formData = await request.formData();
  const enabled = (formData.get('public_intake_enabled') ?? '').toString() === '1' ? 1 : 0;
  const otherEnabled = (formData.get('public_intake_other_enabled') ?? '').toString() === '1' ? 1 : 0;

  await setPublicIntakeSettings(env.DB, session.kanzlei_id, {
    public_intake_enabled: enabled as 0 | 1,
    public_intake_other_enabled: otherEnabled as 0 | 1,
  });

  await appendAudit(env.DB, env.SECRET_KEY, session.kanzlei_id, buildAuditContext(request, session), {
    eventType: 'kanzlei.intake_settings_updated',
    subjectType: 'kanzlei',
    subjectId: session.kanzlei_id,
    payload: { public_intake_enabled: enabled, public_intake_other_enabled: otherEnabled },
  });

  return redirect('/app/account/intake?saved=1', 303);
};

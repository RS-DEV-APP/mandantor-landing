import type { APIRoute } from 'astro';
import { findKanzleiById } from '../../../../lib/db';
import {
  findUserById,
  findUserByEmail,
  createInvitation,
  type Role,
} from '../../../../lib/users';
import { sendTeamInviteEmail } from '../../../../lib/mail';
import { getSubscription, countActiveSeats } from '../../../../lib/subscription';
import { PLAN_LIMITS } from '../../../../lib/stripe';
import { appendAudit, buildAuditContext } from '../../../../lib/audit';

export const prerender = false;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !env.SECRET_KEY || !session) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (session.role !== 'admin') {
    return redirect('/app/account/team?error=' + encodeURIComponent('Nur Administratoren können einladen'), 303);
  }

  const formData = await request.formData();
  const email = (formData.get('email') ?? '').toString().trim().toLowerCase();
  const roleRaw = (formData.get('role') ?? 'member').toString();
  const role: Role = roleRaw === 'admin' ? 'admin' : 'member';

  if (!email || !EMAIL_REGEX.test(email)) {
    return redirect('/app/account/team?error=' + encodeURIComponent('Ungültige E-Mail-Adresse'), 303);
  }

  // Existing user check — same kanzlei = no-op, other kanzlei = block
  const existing = await findUserByEmail(env.DB, email);
  if (existing && existing.status === 'active') {
    if (existing.kanzlei_id === session.kanzlei_id) {
      return redirect('/app/account/team?error=' + encodeURIComponent('Diese Person ist bereits Mitglied'), 303);
    }
    return redirect(
      '/app/account/team?error=' + encodeURIComponent('Diese E-Mail ist bereits einer anderen Kanzlei zugeordnet'),
      303,
    );
  }

  const kanzlei = await findKanzleiById(env.DB, session.kanzlei_id);
  if (!kanzlei) return new Response('Kanzlei nicht gefunden', { status: 404 });

  const sub = await getSubscription(env.DB, session.kanzlei_id);
  const plan = sub?.plan ?? 'pilot';
  const seatLimit = PLAN_LIMITS[plan]?.seats ?? null;
  if (seatLimit !== null) {
    const seats = await countActiveSeats(env.DB, session.kanzlei_id);
    if (seats >= seatLimit) {
      return redirect(
        '/app/account/team?error=' +
          encodeURIComponent(
            `Sitz-Limit erreicht (${seatLimit} im ${plan}-Plan). Upgrade unter Account → Abrechnung.`,
          ),
        303,
      );
    }
  }

  const inviter = await findUserById(env.DB, session.user_id);
  const inviterName = inviter?.display_name?.trim() || inviter?.email || 'Ein Kollege';

  const { token } = await createInvitation(env.DB, env.SECRET_KEY, kanzlei.id, email, role, session.user_id);
  const origin = new URL(request.url).origin;
  const inviteUrl = `${origin}/app/invite?token=${encodeURIComponent(token)}`;

  try {
    await sendTeamInviteEmail(env, email, kanzlei.display_name, inviterName, inviteUrl, role);
  } catch (err) {
    console.error('team invite mail failed', err);
    return redirect('/app/account/team?error=' + encodeURIComponent('Versand fehlgeschlagen — bitte erneut versuchen'), 303);
  }

  await appendAudit(env.DB, env.SECRET_KEY, session.kanzlei_id, buildAuditContext(request, session), {
    eventType: 'team.invited',
    subjectType: 'kanzlei_user',
    payload: { email, role },
  });

  return redirect('/app/account/team?invited=' + encodeURIComponent(email), 303);
};

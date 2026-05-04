import type { APIRoute } from 'astro';
import { findAkteByMandantToken, akteLang } from '../../../lib/akten';
import { findKanzleiById } from '../../../lib/db';
import { findAktenTypByIdOnly } from '../../../lib/akten_typ';
import { listSteps, listFiles, markSubmitted, saveStep } from '../../../lib/mandant';
import { sendSubmissionNotificationEmail, sendMandantConfirmationEmail } from '../../../lib/mail';
import { appendAudit } from '../../../lib/audit';
import { dispatchEvent } from '../../../lib/webhooks';

export const prerender = false;

function getClientIp(request: Request): string | null {
  return request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? null;
}

function extractStep1<T = { vorname?: string; nachname?: string; email?: string }>(
  steps: { step_no: number; data_json: string | null }[],
): T {
  const step1 = steps.find((s) => s.step_no === 1);
  if (!step1?.data_json) return {} as T;
  try { return JSON.parse(step1.data_json) as T; } catch { return {} as T; }
}

function buildMandantName(data: { vorname?: string; nachname?: string }): string {
  const parts = [data.vorname, data.nachname].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Ein Mandant';
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  if (!env?.DB || !env.SECRET_KEY) {
    return new Response('Server misconfigured', { status: 500 });
  }

  const formData = await request.formData();
  const token = (formData.get('token') ?? '').toString();
  if (!token) return new Response('Invalid request', { status: 400 });

  const akte = await findAkteByMandantToken(env.DB, token);
  if (!akte) return new Response('Nicht gefunden', { status: 404 });
  if (akte.status === 'submitted' || akte.status === 'archived') {
    return redirect(`/m/${token}`, 303);
  }

  const steps = await listSteps(env.DB, akte.id);
  const signed = new Set(steps.filter((s) => s.signed_at).map((s) => s.step_no));
  const aktenTyp = akte.akten_typ_id
    ? await findAktenTypByIdOnly(env.DB, akte.akten_typ_id)
    : null;
  const includeSachverhalt = aktenTyp?.include_sachverhalt === 1 || akte.intake_source === 'public';
  const includeWiderruf = aktenTyp?.include_widerruf === 1;
  const required: number[] = [
    1,
    ...(includeSachverhalt ? [6] : []),
    ...(includeWiderruf ? [7] : []),
    2,
    3,
    4,
  ];
  const lang = akteLang(akte);
  for (const r of required) {
    if (!signed.has(r)) {
      const msg = lang === 'en' ? `Step ${r} not completed` : `Schritt ${r} ist nicht abgeschlossen`;
      return new Response(msg, { status: 400 });
    }
  }

  const files = await listFiles(env.DB, akte.id);
  const ip = getClientIp(request);
  const ua = request.headers.get('user-agent');
  await saveStep(env.DB, env.SECRET_KEY, akte.id, 5, { file_count: files.length }, ip, ua);
  await markSubmitted(env.DB, akte.id);

  await appendAudit(env.DB, env.SECRET_KEY, akte.kanzlei_id, {
    actorUserId: null,
    actorEmail: null,
    ip,
    ua,
  }, {
    eventType: 'akte.submitted',
    subjectType: 'akte',
    subjectId: akte.id,
    payload: { case_label: akte.case_label, file_count: files.length },
  });

  // Mail-Versand: Fehler nicht propagieren, Submit war ja erfolgreich.
  const mandantData = extractStep1(steps);
  const mandantName = buildMandantName(mandantData);

  await dispatchEvent(env.DB, locals.runtime?.ctx, akte.kanzlei_id, 'akte.submitted', {
    akte_id: akte.id,
    case_label: akte.case_label,
    mandant_name: mandantName,
    mandant_email: (mandantData.email ?? '').trim().toLowerCase() || null,
    file_count: files.length,
    submitted_at: Math.floor(Date.now() / 1000),
  });

  try {
    const kanzlei = await findKanzleiById(env.DB, akte.kanzlei_id);
    if (kanzlei) {
      const origin = new URL(request.url).origin;
      const akteUrl = `${origin}/app/akten/${akte.id}`;
      await sendSubmissionNotificationEmail(env, kanzlei.email, mandantName, akte.case_label, akteUrl);

      // Mandant-Bestätigung an die in Step 1 angegebene Email
      const mandantEmail = (mandantData.email ?? '').trim().toLowerCase();
      if (mandantEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mandantEmail)) {
        try {
          const branding = {
            logoUrl: kanzlei.logo_r2_key ? `${origin}/api/kanzlei/${kanzlei.id}/logo` : null,
            accentColor: kanzlei.brand_color,
            impressumUrl: kanzlei.impressum_url,
            datenschutzUrl: kanzlei.datenschutz_url,
          };
          await sendMandantConfirmationEmail(env, mandantEmail, kanzlei.display_name, akte.case_label, akteLang(akte), branding);
        } catch (err) {
          console.error('mandant confirmation failed', err);
        }
      }
    }
  } catch (err) {
    console.error('submission notification failed', err);
  }

  return redirect(`/m/${token}`, 303);
};

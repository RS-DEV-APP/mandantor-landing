import type { APIRoute } from 'astro';
import { findAkteByMandantToken } from '../../../lib/akten';
import { findKanzleiById } from '../../../lib/db';
import { listSteps, listFiles, markSubmitted, saveStep } from '../../../lib/mandant';
import { sendSubmissionNotificationEmail, sendMandantConfirmationEmail } from '../../../lib/mail';

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
  for (const required of [1, 2, 3, 4]) {
    if (!signed.has(required)) {
      return new Response(`Schritt ${required} ist nicht abgeschlossen`, { status: 400 });
    }
  }

  const files = await listFiles(env.DB, akte.id);
  const ip = getClientIp(request);
  const ua = request.headers.get('user-agent');
  await saveStep(env.DB, env.SECRET_KEY, akte.id, 5, { file_count: files.length }, ip, ua);
  await markSubmitted(env.DB, akte.id);

  // Mail-Versand: Fehler nicht propagieren, Submit war ja erfolgreich.
  const mandantData = extractStep1(steps);
  const mandantName = buildMandantName(mandantData);

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
          await sendMandantConfirmationEmail(env, mandantEmail, kanzlei.display_name, akte.case_label);
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

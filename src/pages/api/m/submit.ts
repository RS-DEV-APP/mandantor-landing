import type { APIRoute } from 'astro';
import { findAkteByMandantToken } from '../../../lib/akten';
import { findKanzleiById } from '../../../lib/db';
import { listSteps, listFiles, markSubmitted, saveStep } from '../../../lib/mandant';
import { sendSubmissionNotificationEmail } from '../../../lib/mail';

export const prerender = false;

function getClientIp(request: Request): string | null {
  return request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? null;
}

function extractMandantName(steps: { step_no: number; data_json: string | null }[]): string {
  const step1 = steps.find((s) => s.step_no === 1);
  if (!step1?.data_json) return 'Ein Mandant';
  try {
    const data = JSON.parse(step1.data_json) as { vorname?: string; nachname?: string };
    const parts = [data.vorname, data.nachname].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : 'Ein Mandant';
  } catch {
    return 'Ein Mandant';
  }
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

  // Anwalt-Notification — Fehler nicht propagieren, Submit war ja erfolgreich.
  try {
    const kanzlei = await findKanzleiById(env.DB, akte.kanzlei_id);
    if (kanzlei) {
      const origin = new URL(request.url).origin;
      const akteUrl = `${origin}/app/akten/${akte.id}`;
      const mandantName = extractMandantName(steps);
      await sendSubmissionNotificationEmail(env, kanzlei.email, mandantName, akte.case_label, akteUrl);
    }
  } catch (err) {
    console.error('submission notification failed', err);
  }

  return redirect(`/m/${token}`, 303);
};

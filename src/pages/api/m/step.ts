import type { APIRoute } from 'astro';
import { findAkteByMandantToken, akteLang } from '../../../lib/akten';
import { saveStep, STEP_COUNT } from '../../../lib/mandant';
import { findAktenTypByIdOnly } from '../../../lib/akten_typ';
import { analyzeAndPersist } from '../../../lib/ai_actions';
import { rebuildFtsAsync } from '../../../lib/search';
import type { Lang } from '../../../lib/i18n';

function err(lang: Lang, de: string, en: string): string {
  return lang === 'en' ? en : de;
}

export const prerender = false;

function getClientIp(request: Request): string | null {
  return request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? null;
}

function nextStepInFlow(current: number, flow: number[]): number {
  const idx = flow.indexOf(current);
  if (idx === -1 || idx === flow.length - 1) return flow[flow.length - 1] ?? current;
  return flow[idx + 1] ?? current;
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  if (!env?.DB || !env.SECRET_KEY) {
    return new Response('Server misconfigured', { status: 500 });
  }

  const formData = await request.formData();
  const token = (formData.get('token') ?? '').toString();
  const stepNo = parseInt((formData.get('step_no') ?? '').toString(), 10);

  if (!token || !stepNo || stepNo < 1 || stepNo > STEP_COUNT) {
    return new Response('Invalid request', { status: 400 });
  }

  const akte = await findAkteByMandantToken(env.DB, token);
  if (!akte) return new Response('Nicht gefunden / Not found', { status: 404 });
  const lang = akteLang(akte);
  if (akte.status === 'submitted' || akte.status === 'archived') {
    return new Response(err(lang, 'Akte ist bereits abgeschlossen', 'File already submitted'), { status: 403 });
  }

  // Collect step-specific data
  const data: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key === 'token' || key === 'step_no') continue;
    data[key] = value.toString();
  }

  // Step-specific validation
  if (stepNo === 1) {
    const required = ['vorname', 'nachname', 'anschrift', 'plz', 'ort', 'geburtsdatum', 'email'];
    for (const f of required) {
      if (!data[f] || (data[f] as string).trim() === '') {
        return new Response(err(lang, `Fehlt: ${f}`, `Missing: ${f}`), { status: 400 });
      }
    }
  } else if (stepNo >= 2 && stepNo <= 4) {
    if (data.confirm !== '1') return new Response(err(lang, 'Bestätigung fehlt', 'Confirmation missing'), { status: 400 });
    if (!data.signed_name || (data.signed_name as string).trim() === '') {
      return new Response(err(lang, 'Name fehlt', 'Name missing'), { status: 400 });
    }
  } else if (stepNo === 6) {
    const text = (data.sachverhalt as string | undefined)?.trim() ?? '';
    if (text.length < 10) return new Response(err(lang, 'Sachverhalt zu kurz (min. 10 Zeichen)', 'Description too short (min 10 chars)'), { status: 400 });
    if (text.length > 5000) return new Response(err(lang, 'Sachverhalt zu lang (max. 5000 Zeichen)', 'Description too long (max 5000 chars)'), { status: 400 });
  } else if (stepNo === 7) {
    if (data.confirm !== '1') return new Response(err(lang, 'Bestätigung fehlt', 'Confirmation missing'), { status: 400 });
    if (!data.signed_name || (data.signed_name as string).trim() === '') {
      return new Response(err(lang, 'Name fehlt', 'Name missing'), { status: 400 });
    }
  }

  const ip = getClientIp(request);
  const ua = request.headers.get('user-agent');
  await saveStep(env.DB, env.SECRET_KEY, akte.id, stepNo, data, ip, ua);
  if (stepNo === 1 || stepNo === 6) rebuildFtsAsync(env.DB, locals.runtime?.ctx, akte.id);

  // Wenn Step 6 (Sachverhalt) gerade gespeichert wurde, KI-Analyse im Hintergrund anstoßen.
  if (stepNo === 6) {
    const text = ((data.sachverhalt as string | undefined) ?? '').trim();
    if (text.length >= 30) {
      const ctxAudit = { actorUserId: null, actorEmail: akte.mandant_email, ip, ua };
      const aiPromise = analyzeAndPersist(env.DB, env, akte.id, akte.kanzlei_id, text, ctxAudit)
        .catch((err) => console.error('step6 ai analyze failed', err));
      if (locals.runtime?.ctx) {
        locals.runtime.ctx.waitUntil(aiPromise);
      }
    }
  }

  // Bestimme den nächsten Schritt anhand des dynamischen Flows
  const aktenTyp = akte.akten_typ_id
    ? await findAktenTypByIdOnly(env.DB, akte.akten_typ_id)
    : null;
  const includeSachverhalt = aktenTyp?.include_sachverhalt === 1 || akte.intake_source === 'public';
  const includeWiderruf = aktenTyp?.include_widerruf === 1;
  const flow: number[] = [
    1,
    ...(includeSachverhalt ? [6] : []),
    ...(includeWiderruf ? [7] : []),
    2,
    3,
    4,
    5,
  ];
  const next = nextStepInFlow(stepNo, flow);
  return redirect(`/m/${token}?step=${next}`, 303);
};

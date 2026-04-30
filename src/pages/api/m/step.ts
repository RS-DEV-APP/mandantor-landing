import type { APIRoute } from 'astro';
import { findAkteByMandantToken } from '../../../lib/akten';
import { saveStep, STEP_COUNT } from '../../../lib/mandant';

export const prerender = false;

function getClientIp(request: Request): string | null {
  return request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? null;
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
  if (!akte) return new Response('Nicht gefunden', { status: 404 });
  if (akte.status === 'submitted' || akte.status === 'archived') {
    return new Response('Akte ist bereits abgeschlossen', { status: 403 });
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
        return new Response(`Fehlt: ${f}`, { status: 400 });
      }
    }
  } else if (stepNo >= 2 && stepNo <= 4) {
    if (data.confirm !== '1') return new Response('Bestätigung fehlt', { status: 400 });
    if (!data.signed_name || (data.signed_name as string).trim() === '') {
      return new Response('Name fehlt', { status: 400 });
    }
  }

  const ip = getClientIp(request);
  const ua = request.headers.get('user-agent');
  await saveStep(env.DB, env.SECRET_KEY, akte.id, stepNo, data, ip, ua);

  const nextStep = stepNo < STEP_COUNT ? stepNo + 1 : STEP_COUNT;
  return redirect(`/m/${token}?step=${nextStep}`, 303);
};

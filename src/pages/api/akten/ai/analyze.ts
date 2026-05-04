import type { APIRoute } from 'astro';
import { findAkteById } from '../../../../lib/akten';
import { analyzeAndPersist } from '../../../../lib/ai_actions';
import { isAiConfigured } from '../../../../lib/ai';
import { buildAuditContext } from '../../../../lib/audit';

export const prerender = false;

// Manuelle KI-Analyse für eine Akte. Liest den Sachverhalt aus akte_step Step 6
// (oder das mandant_name + case_label als Fallback) und schreibt Summary + Sentiment.
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !env.SECRET_KEY || !session) return new Response('Unauthorized', { status: 401 });
  if (!isAiConfigured(env)) {
    return redirect('/app/dashboard?error=' + encodeURIComponent('KI-Funktion nicht konfiguriert (ANTHROPIC_API_KEY fehlt)'), 303);
  }

  const formData = await request.formData();
  const akteId = (formData.get('akte_id') ?? '').toString();
  if (!akteId) return new Response('akte_id fehlt', { status: 400 });

  const akte = await findAkteById(env.DB, session.kanzlei_id, akteId);
  if (!akte) return new Response('Nicht gefunden', { status: 404 });

  const step6 = await env.DB
    .prepare('SELECT data_json FROM akte_step WHERE akte_id = ?1 AND step_no = 6 LIMIT 1')
    .bind(akte.id)
    .first<{ data_json: string }>();

  let text = '';
  if (step6?.data_json) {
    try {
      const parsed = JSON.parse(step6.data_json) as { sachverhalt?: string };
      text = parsed.sachverhalt ?? '';
    } catch { /* ignore */ }
  }
  if (!text) {
    return redirect(`/app/akten/${akteId}?error=` + encodeURIComponent('Kein Sachverhalt vorhanden — KI-Analyse nicht möglich'), 303);
  }

  const result = await analyzeAndPersist(
    env.DB,
    env,
    akte.id,
    session.kanzlei_id,
    text,
    buildAuditContext(request, session),
  );

  if (!result) {
    return redirect(`/app/akten/${akteId}?error=` + encodeURIComponent('KI-Analyse fehlgeschlagen — bitte später erneut versuchen'), 303);
  }

  return redirect(`/app/akten/${akteId}?ai_analyzed=1`, 303);
};

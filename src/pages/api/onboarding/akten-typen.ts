import type { APIRoute } from 'astro';
import { createAktenTyp, listAktenTypen } from '../../../lib/akten_typ';
import { AKTEN_TYP_PRESETS } from '../../../lib/akten_typ_presets';
import { appendAudit, buildAuditContext } from '../../../lib/audit';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !session) return new Response('Unauthorized', { status: 401 });

  const formData = await request.formData();
  const selected = formData.getAll('presets').map((v) => v.toString());

  const existing = await listAktenTypen(env.DB, session.kanzlei_id);
  const existingNames = new Set(existing.map((t) => t.name.toLowerCase()));

  for (const key of selected) {
    const preset = AKTEN_TYP_PRESETS.find((p) => p.key === key);
    if (!preset) continue;
    if (existingNames.has(preset.name.toLowerCase())) continue;

    const created = await createAktenTyp(env.DB, session.kanzlei_id, {
      name: preset.name,
      vollmacht_template: preset.vollmacht_template ?? null,
      honorar_hourly: preset.honorar_hourly ?? null,
      honorar_advance: preset.honorar_advance ?? null,
      dsgvo_template: preset.dsgvo_template ?? null,
      file_hints: preset.file_hints,
      signature_levels: {},
    });

    await appendAudit(env.DB, env.SECRET_KEY, session.kanzlei_id, buildAuditContext(request, session), {
      eventType: 'akten_typ.created',
      subjectType: 'akten_typ',
      subjectId: created.id,
      payload: { name: preset.name, source: 'onboarding_preset', preset_key: preset.key },
    });
  }

  return redirect('/app/onboarding/done', 303);
};

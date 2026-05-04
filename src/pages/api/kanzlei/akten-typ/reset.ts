import type { APIRoute } from 'astro';
import { findAktenTypById, updateAktenTyp } from '../../../../lib/akten_typ';
import { AKTEN_TYP_PRESETS } from '../../../../lib/akten_typ_presets';
import { appendAudit, buildAuditContext } from '../../../../lib/audit';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !env.SECRET_KEY || !session) return new Response('Unauthorized', { status: 401 });
  if (session.role !== 'admin') {
    return redirect('/app/settings?error=' + encodeURIComponent('Nur Administratoren können Akten-Typen zurücksetzen'), 303);
  }

  const formData = await request.formData();
  const id = (formData.get('id') ?? '').toString();
  const presetKey = (formData.get('preset_key') ?? '').toString();
  if (!id || !presetKey) return new Response('id und preset_key erforderlich', { status: 400 });

  const existing = await findAktenTypById(env.DB, session.kanzlei_id, id);
  if (!existing) return new Response('Nicht gefunden', { status: 404 });

  const preset = AKTEN_TYP_PRESETS.find((p) => p.key === presetKey);
  if (!preset) return new Response('Preset nicht gefunden', { status: 400 });

  await updateAktenTyp(env.DB, session.kanzlei_id, id, {
    name: preset.name,
    vollmacht_template: preset.vollmacht_template ?? null,
    honorar_hourly: preset.honorar_hourly ?? null,
    honorar_advance: preset.honorar_advance ?? null,
    dsgvo_template: preset.dsgvo_template ?? null,
    widerruf_template: null,
    file_hints: preset.file_hints,
    signature_levels: {},
    include_sachverhalt: false,
    include_widerruf: false,
    phases: [],
  });

  await appendAudit(env.DB, env.SECRET_KEY, session.kanzlei_id, buildAuditContext(request, session), {
    eventType: 'akten_typ.reset_to_preset',
    subjectType: 'akten_typ',
    subjectId: id,
    payload: { preset_key: presetKey, name: preset.name },
  });

  return redirect('/app/settings?saved_typ=' + encodeURIComponent(preset.name), 303);
};

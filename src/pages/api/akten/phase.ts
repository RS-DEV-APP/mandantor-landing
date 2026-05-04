import type { APIRoute } from 'astro';
import { findAkteById } from '../../../lib/akten';
import { findAktenTypById } from '../../../lib/akten_typ';
import { setAktePhase, parsePhases } from '../../../lib/phases';
import { appendAudit, buildAuditContext } from '../../../lib/audit';
import { dispatchEvent } from '../../../lib/webhooks';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !env.SECRET_KEY || !session) return new Response('Unauthorized', { status: 401 });

  const formData = await request.formData();
  const akteId = (formData.get('akte_id') ?? '').toString();
  const phaseRaw = (formData.get('phase_index') ?? '').toString();
  if (!akteId) return new Response('akte_id fehlt', { status: 400 });

  const akte = await findAkteById(env.DB, session.kanzlei_id, akteId);
  if (!akte) return new Response('Nicht gefunden', { status: 404 });

  const phaseIndex = phaseRaw === '' ? null : parseInt(phaseRaw, 10);
  let phaseLabel: string | null = null;

  if (phaseIndex !== null) {
    if (Number.isNaN(phaseIndex) || phaseIndex < 0) {
      return redirect(`/app/akten/${akteId}?error=` + encodeURIComponent('Ungültige Phase'), 303);
    }
    if (akte.akten_typ_id) {
      const typ = await findAktenTypById(env.DB, session.kanzlei_id, akte.akten_typ_id);
      const phases = typ ? parsePhases(typ.phases_json) : [];
      if (phaseIndex >= phases.length) {
        return redirect(`/app/akten/${akteId}?error=` + encodeURIComponent('Phase außerhalb der Pipeline'), 303);
      }
      phaseLabel = phases[phaseIndex] ?? null;
    }
  }

  await setAktePhase(env.DB, session.kanzlei_id, akteId, phaseIndex);

  await appendAudit(env.DB, env.SECRET_KEY, session.kanzlei_id, buildAuditContext(request, session), {
    eventType: 'akte.phase_changed',
    subjectType: 'akte',
    subjectId: akteId,
    payload: { previous: akte.current_phase, current: phaseIndex, label: phaseLabel },
  });

  await dispatchEvent(env.DB, locals.runtime?.ctx, session.kanzlei_id, 'akte.phase_changed', {
    akte_id: akteId,
    case_label: akte.case_label,
    previous_phase: akte.current_phase,
    current_phase: phaseIndex,
    phase_label: phaseLabel,
  });

  return redirect(`/app/akten/${akteId}?phase_set=1`, 303);
};

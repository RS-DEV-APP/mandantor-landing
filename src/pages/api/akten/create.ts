import type { APIRoute } from 'astro';
import { createAkte, setMandantContact } from '../../../lib/akten';
import { findAktenTypById } from '../../../lib/akten_typ';
import { getSubscription, countActiveAkten } from '../../../lib/subscription';
import { PLAN_LIMITS } from '../../../lib/stripe';
import { appendAudit, buildAuditContext } from '../../../lib/audit';
import { dispatchEvent } from '../../../lib/webhooks';
import { normalizeLang } from '../../../lib/i18n';
import { rebuildFtsAsync } from '../../../lib/search';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !session) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Plan-Limits prüfen
  const sub = await getSubscription(env.DB, session.kanzlei_id);
  const plan = sub?.plan ?? 'pilot';
  const limit = PLAN_LIMITS[plan]?.activeAkten ?? null;
  if (limit !== null) {
    const count = await countActiveAkten(env.DB, session.kanzlei_id);
    if (count >= limit) {
      return redirect(
        '/app/dashboard?limit_error=' +
          encodeURIComponent(
            `Akten-Limit erreicht (${limit} im ${plan}-Plan). Bitte archivieren Sie nicht mehr benötigte Akten oder upgraden Sie unter Account → Abrechnung.`,
          ),
        303,
      );
    }
  }

  const formData = await request.formData();
  const caseLabel = ((formData.get('case_label') ?? '').toString().trim() || null);
  const mandantEmail = ((formData.get('mandant_email') ?? '').toString().trim().toLowerCase() || null);
  const mandantName = ((formData.get('mandant_name') ?? '').toString().trim() || null);
  const aktenTypIdRaw = (formData.get('akten_typ_id') ?? '').toString().trim();
  const confirmConflict = (formData.get('confirm_conflict') ?? '').toString() === '1';
  const lang = normalizeLang((formData.get('lang') ?? '').toString());

  // Conflict-Check (nur wenn Email oder Name gesetzt UND nicht explizit bestätigt)
  if (!confirmConflict && (mandantEmail || mandantName)) {
    const conflict = await env.DB
      .prepare(
        `SELECT id, case_label FROM akte
         WHERE kanzlei_id = ?1 AND status != 'archived'
           AND ((?2 IS NOT NULL AND mandant_email = ?2) OR (?3 IS NOT NULL AND mandant_name = ?3))
         LIMIT 1`,
      )
      .bind(session.kanzlei_id, mandantEmail, mandantName)
      .first<{ id: string; case_label: string | null }>();
    if (conflict) {
      const params = new URLSearchParams();
      params.set('conflict_id', conflict.id);
      params.set('conflict_label', conflict.case_label ?? 'Ohne Bezeichnung');
      if (caseLabel) params.set('case_label', caseLabel);
      if (mandantEmail) params.set('mandant_email', mandantEmail);
      if (mandantName) params.set('mandant_name', mandantName);
      if (aktenTypIdRaw) params.set('akten_typ_id', aktenTypIdRaw);
      return redirect('/app/dashboard?' + params.toString(), 303);
    }
  }

  let aktenTypId: string | null = null;
  if (aktenTypIdRaw) {
    const typ = await findAktenTypById(env.DB, session.kanzlei_id, aktenTypIdRaw);
    if (typ) aktenTypId = typ.id;
  }

  const akte = await createAkte(env.DB, session.kanzlei_id, caseLabel, aktenTypId, lang);
  if (mandantEmail || mandantName) {
    await setMandantContact(env.DB, akte.id, mandantEmail, mandantName);
  }

  await appendAudit(env.DB, env.SECRET_KEY, session.kanzlei_id, buildAuditContext(request, session), {
    eventType: 'akte.created',
    subjectType: 'akte',
    subjectId: akte.id,
    payload: { case_label: caseLabel, akten_typ_id: aktenTypId, mandant_email: mandantEmail, mandant_name: mandantName },
  });

  rebuildFtsAsync(env.DB, locals.runtime?.ctx, akte.id);

  await dispatchEvent(env.DB, locals.runtime?.ctx, session.kanzlei_id, 'akte.created', {
    akte_id: akte.id,
    case_label: caseLabel,
    akten_typ_id: aktenTypId,
    mandant_email: mandantEmail,
    mandant_name: mandantName,
    lang,
    created_at: Math.floor(Date.now() / 1000),
  });

  return redirect(`/app/akten/${akte.id}`, 303);
};

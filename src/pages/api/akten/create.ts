import type { APIRoute } from 'astro';
import { createAkte } from '../../../lib/akten';
import { findAktenTypById } from '../../../lib/akten_typ';
import { getSubscription, countActiveAkten } from '../../../lib/subscription';
import { PLAN_LIMITS } from '../../../lib/stripe';

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
  const aktenTypIdRaw = (formData.get('akten_typ_id') ?? '').toString().trim();

  let aktenTypId: string | null = null;
  if (aktenTypIdRaw) {
    const typ = await findAktenTypById(env.DB, session.kanzlei_id, aktenTypIdRaw);
    if (typ) aktenTypId = typ.id;
  }

  const akte = await createAkte(env.DB, session.kanzlei_id, caseLabel, aktenTypId);
  return redirect(`/app/akten/${akte.id}`, 303);
};

import type { APIRoute } from 'astro';
import { createAkte } from '../../../lib/akten';
import { findAktenTypById } from '../../../lib/akten_typ';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !session) {
    return new Response('Unauthorized', { status: 401 });
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

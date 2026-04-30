import type { APIRoute } from 'astro';
import { createAkte } from '../../../lib/akten';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const formData = await request.formData();
  const caseLabel = ((formData.get('case_label') ?? '').toString().trim() || null);

  const akte = await createAkte(env.DB, session.kanzlei_id, caseLabel);
  return redirect(`/app/akten/${akte.id}`, 303);
};

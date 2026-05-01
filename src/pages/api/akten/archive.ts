import type { APIRoute } from 'astro';
import { findAkteById, archiveAkte } from '../../../lib/akten';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !session) return new Response('Unauthorized', { status: 401 });

  const formData = await request.formData();
  const akteId = (formData.get('akte_id') ?? '').toString();
  if (!akteId) return new Response('akte_id fehlt', { status: 400 });

  const akte = await findAkteById(env.DB, session.kanzlei_id, akteId);
  if (!akte) return new Response('Nicht gefunden', { status: 404 });

  await archiveAkte(env.DB, session.kanzlei_id, akteId);
  return redirect('/app/dashboard?archived=' + encodeURIComponent(akte.case_label ?? akte.id.slice(0, 8)), 303);
};

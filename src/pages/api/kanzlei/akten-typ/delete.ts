import type { APIRoute } from 'astro';
import { findAktenTypById, deleteAktenTyp } from '../../../../lib/akten_typ';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !session) return new Response('Unauthorized', { status: 401 });

  const formData = await request.formData();
  const id = (formData.get('id') ?? '').toString();
  if (!id) return new Response('id fehlt', { status: 400 });

  const existing = await findAktenTypById(env.DB, session.kanzlei_id, id);
  if (!existing) return new Response('Nicht gefunden', { status: 404 });

  await deleteAktenTyp(env.DB, session.kanzlei_id, id);
  return redirect(`/app/settings?deleted_typ=` + encodeURIComponent(existing.name), 303);
};

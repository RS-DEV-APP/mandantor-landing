import type { APIRoute } from 'astro';
import { findAkteById } from '../../../../lib/akten';
import { createNote } from '../../../../lib/notes';
import { rebuildFtsAsync } from '../../../../lib/search';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !session) return new Response('Unauthorized', { status: 401 });

  const formData = await request.formData();
  const akteId = (formData.get('akte_id') ?? '').toString();
  const content = (formData.get('content') ?? '').toString().trim().slice(0, 5000);
  if (!akteId || !content) return new Response('akte_id und content erforderlich', { status: 400 });

  const akte = await findAkteById(env.DB, session.kanzlei_id, akteId);
  if (!akte) return new Response('Nicht gefunden', { status: 404 });

  await createNote(env.DB, akteId, session.user_id, content);
  rebuildFtsAsync(env.DB, locals.runtime?.ctx, akteId);
  return redirect(`/app/akten/${akteId}#notizen`, 303);
};

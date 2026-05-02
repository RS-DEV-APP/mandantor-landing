import type { APIRoute } from 'astro';
import { updateUserDisplayName } from '../../../lib/users';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !session) return new Response('Unauthorized', { status: 401 });

  const formData = await request.formData();
  const displayName = (formData.get('display_name') ?? '').toString().trim();

  await updateUserDisplayName(env.DB, session.user_id, displayName.slice(0, 80) || null);
  return redirect('/app/account/profile?saved=1', 303);
};

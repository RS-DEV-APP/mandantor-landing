import type { APIRoute } from 'astro';
import { deleteSessionByHash } from '../../../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !session) return new Response('Unauthorized', { status: 401 });

  const formData = await request.formData();
  const tokenHash = (formData.get('token_hash') ?? '').toString();
  if (!tokenHash) return new Response('token_hash fehlt', { status: 400 });
  if (tokenHash === session.session_token_hash) {
    return redirect('/app/account/security', 303);
  }

  await deleteSessionByHash(env.DB, session.user_id, tokenHash);
  return redirect('/app/account/security?revoked=1', 303);
};

import type { APIRoute } from 'astro';
import { deleteOtherSessionsForUser } from '../../../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !session) return new Response('Unauthorized', { status: 401 });
  if (!session.session_token_hash) return new Response('No session token hash', { status: 400 });

  await deleteOtherSessionsForUser(env.DB, session.user_id, session.session_token_hash);
  return redirect('/app/account/security?all_revoked=1', 303);
};

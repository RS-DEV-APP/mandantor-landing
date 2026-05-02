import type { APIRoute } from 'astro';
import { revokeInvitation } from '../../../../lib/users';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !session) return new Response('Unauthorized', { status: 401 });
  if (session.role !== 'admin') {
    return redirect('/app/account/team?error=' + encodeURIComponent('Nur Administratoren können Einladungen widerrufen'), 303);
  }

  const formData = await request.formData();
  const tokenHash = (formData.get('token_hash') ?? '').toString();
  if (!tokenHash) return new Response('token_hash fehlt', { status: 400 });

  await revokeInvitation(env.DB, session.kanzlei_id, tokenHash);
  return redirect('/app/account/team', 303);
};

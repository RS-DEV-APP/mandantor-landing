import type { APIRoute } from 'astro';
import { deleteSession, SESSION_COOKIE } from '../../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ locals, cookies, redirect }) => {
  const env = locals.runtime?.env;
  const token = cookies.get(SESSION_COOKIE)?.value;

  if (env?.DB && env.SECRET_KEY) {
    await deleteSession(env.DB, env.SECRET_KEY, token);
  }

  cookies.delete(SESSION_COOKIE, { path: '/' });
  return redirect('/app/login', 303);
};

import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !session) return new Response('Unauthorized', { status: 401 });

  const formData = await request.formData();
  const displayName = (formData.get('display_name') ?? '').toString().trim();
  if (!displayName || displayName.length > 80) {
    return redirect('/app/onboarding/kanzlei', 303);
  }

  await env.DB
    .prepare('UPDATE kanzlei SET display_name = ?1 WHERE id = ?2')
    .bind(displayName, session.kanzlei_id)
    .run();

  return redirect('/app/onboarding/branding', 303);
};

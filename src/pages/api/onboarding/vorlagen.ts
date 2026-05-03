import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !session) return new Response('Unauthorized', { status: 401 });

  const formData = await request.formData();
  const vollmacht = (formData.get('vollmacht_template') ?? '').toString().trim() || null;
  const honorarHourly = (formData.get('honorar_hourly') ?? '').toString().trim() || null;
  const honorarAdvance = (formData.get('honorar_advance') ?? '').toString().trim() || null;

  await env.DB
    .prepare(
      `UPDATE kanzlei SET vollmacht_template = ?1, honorar_hourly = ?2, honorar_advance = ?3
       WHERE id = ?4`,
    )
    .bind(vollmacht, honorarHourly, honorarAdvance, session.kanzlei_id)
    .run();

  return redirect('/app/onboarding/akten-typen', 303);
};

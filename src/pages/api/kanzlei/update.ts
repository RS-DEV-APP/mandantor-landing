import type { APIRoute } from 'astro';
import { updateKanzleiSettings } from '../../../lib/db';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const formData = await request.formData();
  const displayName = (formData.get('display_name') ?? '').toString().trim();
  const vollmachtTemplate = (formData.get('vollmacht_template') ?? '').toString().trim();
  const honorarHourly = (formData.get('honorar_hourly') ?? '').toString().trim();
  const honorarAdvance = (formData.get('honorar_advance') ?? '').toString().trim();
  const impressumUrl = (formData.get('impressum_url') ?? '').toString().trim();
  const datenschutzUrl = (formData.get('datenschutz_url') ?? '').toString().trim();

  if (!displayName) {
    return redirect(
      '/app/settings?error=' + encodeURIComponent('Kanzlei-Name darf nicht leer sein'),
      303,
    );
  }
  if (displayName.length > 80) {
    return redirect(
      '/app/settings?error=' + encodeURIComponent('Kanzlei-Name maximal 80 Zeichen'),
      303,
    );
  }
  for (const [field, val] of [['Impressum-URL', impressumUrl], ['Datenschutz-URL', datenschutzUrl]] as const) {
    if (val && !val.startsWith('https://')) {
      return redirect(
        '/app/settings?error=' + encodeURIComponent(`${field} muss mit https:// beginnen`),
        303,
      );
    }
  }

  await updateKanzleiSettings(env.DB, session.kanzlei_id, {
    display_name: displayName,
    vollmacht_template: vollmachtTemplate || null,
    honorar_hourly: honorarHourly || null,
    honorar_advance: honorarAdvance || null,
    impressum_url: impressumUrl || null,
    datenschutz_url: datenschutzUrl || null,
  });

  return redirect('/app/settings?saved=1', 303);
};

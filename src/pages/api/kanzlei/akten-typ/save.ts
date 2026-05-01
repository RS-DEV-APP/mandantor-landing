import type { APIRoute } from 'astro';
import {
  createAktenTyp,
  updateAktenTyp,
  findAktenTypById,
  type AktenTypInput,
} from '../../../../lib/akten_typ';

export const prerender = false;

function readInput(formData: FormData): AktenTypInput | { error: string } {
  const name = (formData.get('name') ?? '').toString().trim();
  if (!name) return { error: 'Name darf nicht leer sein' };
  if (name.length > 80) return { error: 'Name maximal 80 Zeichen' };

  const fileHintsRaw = (formData.get('file_hints') ?? '').toString();
  const fileHints = fileHintsRaw
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return {
    name,
    vollmacht_template: ((formData.get('vollmacht_template') ?? '').toString().trim()) || null,
    honorar_hourly: ((formData.get('honorar_hourly') ?? '').toString().trim()) || null,
    honorar_advance: ((formData.get('honorar_advance') ?? '').toString().trim()) || null,
    dsgvo_template: ((formData.get('dsgvo_template') ?? '').toString().trim()) || null,
    file_hints: fileHints,
  };
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !session) return new Response('Unauthorized', { status: 401 });

  const formData = await request.formData();
  const idParam = (formData.get('id') ?? '').toString().trim();

  const result = readInput(formData);
  if ('error' in result) {
    const target = idParam
      ? `/app/settings/akten-typ/${idParam}`
      : '/app/settings/akten-typ/new';
    return redirect(target + '?error=' + encodeURIComponent(result.error), 303);
  }

  if (idParam) {
    const existing = await findAktenTypById(env.DB, session.kanzlei_id, idParam);
    if (!existing) return new Response('Nicht gefunden', { status: 404 });
    await updateAktenTyp(env.DB, session.kanzlei_id, idParam, result);
    return redirect(`/app/settings?saved_typ=` + encodeURIComponent(result.name), 303);
  }

  const created = await createAktenTyp(env.DB, session.kanzlei_id, result);
  return redirect(`/app/settings?saved_typ=` + encodeURIComponent(created.name), 303);
};

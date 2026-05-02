import type { APIRoute } from 'astro';
import { setKanzleiRetention } from '../../../lib/retention';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !session) return new Response('Unauthorized', { status: 401 });
  if (session.role !== 'admin') {
    return redirect('/app/settings?error=' + encodeURIComponent('Nur Administratoren'), 303);
  }

  const formData = await request.formData();
  const yearsRaw = (formData.get('retention_years') ?? '').toString().trim();
  const monthsRaw = (formData.get('draft_retention_months') ?? '').toString().trim();

  let years: number | null = null;
  if (yearsRaw) {
    const n = parseInt(yearsRaw, 10);
    if (!Number.isFinite(n) || n < 1 || n > 30) {
      return redirect('/app/settings?error=' + encodeURIComponent('Aufbewahrungs-Frist muss zwischen 1 und 30 Jahren sein'), 303);
    }
    years = n;
  }
  let months: number | null = null;
  if (monthsRaw) {
    const n = parseInt(monthsRaw, 10);
    if (!Number.isFinite(n) || n < 1 || n > 60) {
      return redirect('/app/settings?error=' + encodeURIComponent('Pre-Submit-Frist muss zwischen 1 und 60 Monaten sein'), 303);
    }
    months = n;
  }

  await setKanzleiRetention(env.DB, session.kanzlei_id, years, months);
  return redirect('/app/settings?retention_saved=1', 303);
};

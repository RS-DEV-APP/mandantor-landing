import type { APIRoute } from 'astro';
import { setKanzleiBranding } from '../../../lib/db';

export const prerender = false;

const MAX_LOGO_BYTES = 200 * 1024;
const ALLOWED_LOGO_MIME = new Set(['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']);
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !env.UPLOADS || !session) return new Response('Unauthorized', { status: 401 });
  if (session.role !== 'admin') {
    return redirect('/app/settings?error=' + encodeURIComponent('Nur Administratoren können Branding ändern'), 303);
  }

  const formData = await request.formData();
  const colorRaw = (formData.get('brand_color') ?? '').toString().trim();
  const removeLogo = (formData.get('remove_logo') ?? '').toString() === '1';
  const file = formData.get('logo');

  const patch: { logo_r2_key?: string | null; logo_mime_type?: string | null; brand_color?: string | null } = {};

  if (colorRaw) {
    if (!HEX_COLOR.test(colorRaw)) {
      return redirect('/app/settings?error=' + encodeURIComponent('Farbe muss Hex-Format sein, z.B. #B8956A'), 303);
    }
    patch.brand_color = colorRaw;
  } else if (formData.has('brand_color')) {
    patch.brand_color = null;
  }

  if (removeLogo) {
    patch.logo_r2_key = null;
    patch.logo_mime_type = null;
  } else if (file instanceof File && file.size > 0) {
    if (file.size > MAX_LOGO_BYTES) {
      return redirect('/app/settings?error=' + encodeURIComponent(`Logo zu groß (max ${MAX_LOGO_BYTES / 1024} KB)`), 303);
    }
    if (!ALLOWED_LOGO_MIME.has(file.type)) {
      return redirect('/app/settings?error=' + encodeURIComponent('Logo-Format nicht erlaubt — bitte PNG, JPG, SVG oder WebP'), 303);
    }
    const ext = (file.name.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const key = `branding/${session.kanzlei_id}/logo-${Date.now()}.${ext}`;
    await env.UPLOADS.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
    });
    patch.logo_r2_key = key;
    patch.logo_mime_type = file.type;
  }

  await setKanzleiBranding(env.DB, session.kanzlei_id, patch);
  return redirect('/app/settings?branded=1', 303);
};

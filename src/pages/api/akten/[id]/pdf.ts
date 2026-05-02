import type { APIRoute } from 'astro';
import { findAkteById } from '../../../../lib/akten';
import { findKanzleiById } from '../../../../lib/db';
import { findAktenTypByIdOnly } from '../../../../lib/akten_typ';
import { listSteps, listFiles } from '../../../../lib/mandant';
import { buildAktePdf } from '../../../../lib/pdf';

export const prerender = false;

function encodeFilename(name: string): string {
  const safe = name.replace(/[\r\n]/g, '');
  return encodeURIComponent(safe).replace(/['()]/g, escape).replace(/\*/g, '%2A');
}

export const GET: APIRoute = async ({ params, locals, url }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !env.UPLOADS || !session) return new Response('Unauthorized', { status: 401 });

  const akteId = params.id ?? '';
  const akte = await findAkteById(env.DB, session.kanzlei_id, akteId);
  if (!akte) return new Response('Nicht gefunden', { status: 404 });

  const kanzlei = await findKanzleiById(env.DB, akte.kanzlei_id);
  if (!kanzlei) return new Response('Kanzlei nicht gefunden', { status: 404 });

  const aktenTyp = akte.akten_typ_id
    ? await findAktenTypByIdOnly(env.DB, akte.akten_typ_id)
    : null;
  const steps = await listSteps(env.DB, akte.id);
  const files = await listFiles(env.DB, akte.id);

  let logoBytes: Uint8Array | null = null;
  if (kanzlei.logo_r2_key) {
    try {
      const obj = await env.UPLOADS.get(kanzlei.logo_r2_key);
      if (obj) {
        // SVG kann pdf-lib nicht direkt — nur PNG/JPG verwenden
        const isRaster = (kanzlei.logo_mime_type ?? '').match(/png|jpe?g|webp/i);
        if (isRaster) {
          logoBytes = new Uint8Array(await obj.arrayBuffer());
        }
      }
    } catch {
      logoBytes = null;
    }
  }

  const pdfBytes = await buildAktePdf({
    kanzlei,
    akte,
    steps,
    files,
    aktenTypName: aktenTyp?.name ?? null,
    logoPng: logoBytes,
    logoMime: kanzlei.logo_mime_type,
  });

  const filename = `Akte-${(akte.case_label ?? akte.id.slice(0, 8)).replace(/[^a-zA-Z0-9_.-]+/g, '_')}.pdf`;
  const inline = url.searchParams.get('inline') === '1';
  const disposition = inline ? 'inline' : 'attachment';

  return new Response(pdfBytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': pdfBytes.byteLength.toString(),
      'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeFilename(filename)}`,
      'Cache-Control': 'private, no-store',
    },
  });
};

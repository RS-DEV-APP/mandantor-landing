import type { APIRoute } from 'astro';
import { findAkteById } from '../../../../lib/akten';
import { listFiles } from '../../../../lib/mandant';
import { buildZip, type ZipEntry } from '../../../../lib/zip';

export const prerender = false;

function encodeFilename(name: string): string {
  const safe = name.replace(/[\r\n]/g, '');
  return encodeURIComponent(safe).replace(/['()]/g, escape).replace(/\*/g, '%2A');
}

export const GET: APIRoute = async ({ params, locals }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !env.UPLOADS || !session) return new Response('Unauthorized', { status: 401 });

  const akteId = params.id ?? '';
  const akte = await findAkteById(env.DB, session.kanzlei_id, akteId);
  if (!akte) return new Response('Nicht gefunden', { status: 404 });

  const files = await listFiles(env.DB, akte.id);
  if (files.length === 0) return new Response('Keine Dokumente in dieser Akte', { status: 404 });

  const entries: ZipEntry[] = [];
  for (const f of files) {
    const obj = await env.UPLOADS.get(f.r2_key);
    if (!obj) continue;
    const buf = new Uint8Array(await obj.arrayBuffer());
    entries.push({ name: f.file_name, data: buf });
  }
  if (entries.length === 0) return new Response('Dokumente nicht abrufbar', { status: 500 });

  const zipBytes = buildZip(entries);
  const filename = `Akte-${(akte.case_label ?? akte.id.slice(0, 8)).replace(/[^a-zA-Z0-9_.-]+/g, '_')}.zip`;

  return new Response(zipBytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': zipBytes.length.toString(),
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeFilename(filename)}`,
      'Cache-Control': 'private, no-store',
    },
  });
};

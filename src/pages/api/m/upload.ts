import type { APIRoute } from 'astro';
import { findAkteByMandantToken } from '../../../lib/akten';
import { listFiles, recordFile, MAX_UPLOAD_BYTES, MAX_FILES_PER_AKTE, ALLOWED_UPLOAD_MIME, fileExtensionAllowed } from '../../../lib/mandant';
import { newId } from '../../../lib/ids';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  if (!env?.DB || !env.UPLOADS) {
    return new Response('Server misconfigured: missing DB or UPLOADS binding', { status: 500 });
  }

  const formData = await request.formData();
  const token = (formData.get('token') ?? '').toString();
  const file = formData.get('file');

  if (!token || !(file instanceof File)) {
    return new Response('Invalid request', { status: 400 });
  }

  const akte = await findAkteByMandantToken(env.DB, token);
  if (!akte) return new Response('Nicht gefunden', { status: 404 });
  if (akte.status === 'submitted' || akte.status === 'archived') {
    return new Response('Akte ist bereits abgeschlossen', { status: 403 });
  }

  if (file.size === 0) return new Response('Datei ist leer', { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) {
    return new Response(`Datei zu groß (max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB)`, { status: 400 });
  }
  if (!fileExtensionAllowed(file.name)) {
    return new Response('Dateityp nicht erlaubt', { status: 400 });
  }
  if (file.type && !ALLOWED_UPLOAD_MIME.has(file.type)) {
    return new Response(`MIME-Typ nicht erlaubt: ${file.type}`, { status: 400 });
  }

  const existing = await listFiles(env.DB, akte.id);
  if (existing.length >= MAX_FILES_PER_AKTE) {
    return new Response(`Maximal ${MAX_FILES_PER_AKTE} Dateien pro Akte`, { status: 400 });
  }

  const r2Key = `akten/${akte.id}/${newId()}-${file.name}`;
  await env.UPLOADS.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
    customMetadata: { akte_id: akte.id, original_name: file.name },
  });

  await recordFile(env.DB, akte.id, file.name, r2Key, file.size, file.type || null);

  return redirect(`/m/${token}?step=5`, 303);
};

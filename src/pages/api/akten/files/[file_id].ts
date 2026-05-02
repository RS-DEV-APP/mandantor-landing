import type { APIRoute } from 'astro';

export const prerender = false;

type FileRow = {
  id: string;
  akte_id: string;
  file_name: string;
  r2_key: string;
  size_bytes: number;
  mime_type: string | null;
  kanzlei_id: string;
};

function encodeFilename(name: string): string {
  // RFC 5987: filename* with UTF-8 encoding, percent-encoded.
  // Strip CR/LF defensively to prevent header injection.
  const safe = name.replace(/[\r\n]/g, '');
  return encodeURIComponent(safe).replace(/['()]/g, escape).replace(/\*/g, '%2A');
}

export const GET: APIRoute = async ({ params, locals, url }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !env.UPLOADS || !session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const fileId = params.file_id ?? '';
  if (!fileId) return new Response('Not found', { status: 404 });

  const row = await env.DB
    .prepare(
      `SELECT akte_file.id, akte_file.akte_id, akte_file.file_name, akte_file.r2_key,
              akte_file.size_bytes, akte_file.mime_type, akte.kanzlei_id
       FROM akte_file
       JOIN akte ON akte_file.akte_id = akte.id
       WHERE akte_file.id = ?1 AND akte.kanzlei_id = ?2
       LIMIT 1`,
    )
    .bind(fileId, session.kanzlei_id)
    .first<FileRow>();

  if (!row) return new Response('Not found', { status: 404 });

  const obj = await env.UPLOADS.get(row.r2_key);
  if (!obj) return new Response('Not found', { status: 404 });

  const inline = url.searchParams.get('inline') === '1';
  const disposition = inline ? 'inline' : 'attachment';

  const headers = new Headers();
  headers.set('Content-Type', row.mime_type ?? obj.httpMetadata?.contentType ?? 'application/octet-stream');
  headers.set('Content-Length', row.size_bytes.toString());
  headers.set('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeFilename(row.file_name)}`);
  headers.set('Cache-Control', 'private, no-store');
  // Lock down inline rendering to same-origin only — keeps PDFs from being framed by third parties.
  headers.set('Content-Security-Policy', "frame-ancestors 'self'");

  return new Response(obj.body, { status: 200, headers });
};

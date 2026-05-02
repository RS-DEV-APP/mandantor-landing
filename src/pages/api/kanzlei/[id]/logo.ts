import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const env = locals.runtime?.env;
  if (!env?.DB || !env.UPLOADS) return new Response('Server misconfigured', { status: 500 });

  const id = params.id ?? '';
  if (!id) return new Response('Not found', { status: 404 });

  const row = await env.DB
    .prepare('SELECT logo_r2_key, logo_mime_type FROM kanzlei WHERE id = ?1 LIMIT 1')
    .bind(id)
    .first<{ logo_r2_key: string | null; logo_mime_type: string | null }>();

  if (!row?.logo_r2_key) return new Response('No logo', { status: 404 });

  const obj = await env.UPLOADS.get(row.logo_r2_key);
  if (!obj) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  headers.set('Content-Type', row.logo_mime_type ?? obj.httpMetadata?.contentType ?? 'application/octet-stream');
  headers.set('Cache-Control', 'public, max-age=300');
  return new Response(obj.body, { status: 200, headers });
};

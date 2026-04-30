import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const env = (locals as any).runtime?.env ?? {};
  const result = {
    ok: true,
    timestamp: new Date().toISOString(),
    bindings: {
      DB: !!env.DB,
      UPLOADS: !!env.UPLOADS,
      SECRET_KEY: !!env.SECRET_KEY,
    },
    db_ping: null as string | null,
  };

  if (env.DB) {
    try {
      const row = await env.DB.prepare('SELECT 1 AS one').first<{ one: number }>();
      result.db_ping = row?.one === 1 ? 'pong' : 'unexpected';
    } catch (err) {
      result.db_ping = `error: ${(err as Error).message}`;
    }
  }

  return new Response(JSON.stringify(result, null, 2), {
    headers: { 'content-type': 'application/json' },
  });
};

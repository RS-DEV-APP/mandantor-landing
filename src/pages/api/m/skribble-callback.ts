import type { APIRoute } from 'astro';
import { getSignatureStatus, isConfigured } from '../../../lib/skribble';

export const prerender = false;

// Skribble ruft diesen Endpoint nach Status-Änderungen auf (success/decline/error redirect URLs).
// Wir holen den aktuellen Status via API ab und persistieren ihn in signature_request.

export const GET: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  if (!env?.DB) return new Response('Server misconfigured', { status: 500 });
  if (!isConfigured(env)) return new Response('Skribble not configured', { status: 503 });

  const url = new URL(request.url);
  const sessionId = url.searchParams.get('session_id');
  const akteToken = url.searchParams.get('token');
  if (!sessionId || !akteToken) return new Response('Missing params', { status: 400 });

  const status = await getSignatureStatus(env, sessionId);
  if (!status.ok) {
    console.error('skribble status fetch failed', status);
    return redirect(`/m/${akteToken}?error=skribble_status_failed`, 303);
  }

  const now = Math.floor(Date.now() / 1000);
  await env.DB
    .prepare(
      `UPDATE signature_request SET status = ?1, completed_at = CASE WHEN ?1 IN ('signed', 'declined', 'expired') THEN ?2 ELSE completed_at END WHERE external_session_id = ?3`,
    )
    .bind(status.status, now, sessionId)
    .run();

  return redirect(`/m/${akteToken}?step=${url.searchParams.get('step') ?? ''}`, 303);
};

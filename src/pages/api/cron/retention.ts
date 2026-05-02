import type { APIRoute } from 'astro';
import {
  listKanzleienForRetention,
  findAktenForArchival,
  markForRetention,
  DEFAULT_RETENTION_YEARS,
  DEFAULT_DRAFT_RETENTION_MONTHS,
} from '../../../lib/retention';
import { appendAudit } from '../../../lib/audit';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime?.env;
  if (!env?.DB || !env.SECRET_KEY) return new Response('Server misconfigured', { status: 500 });

  const auth = request.headers.get('x-cron-auth');
  if (auth !== env.SECRET_KEY) return new Response('Unauthorized', { status: 401 });

  const ip = request.headers.get('cf-connecting-ip') ?? null;
  const ua = request.headers.get('user-agent') ?? null;

  const kanzleien = await listKanzleienForRetention(env.DB);
  const log: { archived: number; kanzleien: number; errors: string[] } = {
    archived: 0,
    kanzleien: kanzleien.length,
    errors: [],
  };

  for (const k of kanzleien) {
    const years = k.retention_years ?? DEFAULT_RETENTION_YEARS;
    const months = k.draft_retention_months ?? DEFAULT_DRAFT_RETENTION_MONTHS;
    try {
      const candidates = await findAktenForArchival(env.DB, k.id, months, years);
      for (const a of candidates) {
        const isLegal = a.status === 'submitted';
        await markForRetention(env.DB, a.id, k.id, isLegal);
        await appendAudit(env.DB, env.SECRET_KEY, k.id, {
          actorUserId: null,
          actorEmail: null,
          ip,
          ua,
        }, {
          eventType: 'akte.auto_archived',
          subjectType: 'akte',
          subjectId: a.id,
          payload: {
            reason: isLegal ? 'retention_legal_period' : 'draft_inactivity',
            previous_status: a.status,
            retention_years: years,
            draft_retention_months: months,
          },
        });
        log.archived++;
      }
    } catch (err) {
      log.errors.push(`${k.id}: ${(err as Error).message ?? 'unknown'}`);
    }
  }

  return new Response(JSON.stringify(log, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
};

import type { APIRoute } from 'astro';
import { sendReminderEmail } from '../../../lib/mail';
import { findKanzleiById } from '../../../lib/db';

export const prerender = false;

// Sends reminder mails to mandants whose akte is still open after a few days.
// Triggered by an external cron (Cloudflare Cron Trigger or GitHub Actions),
// authenticated with the SECRET_KEY in the X-Cron-Auth header.

const REMINDER_AFTER_DAYS = 3;
const COOLDOWN_DAYS = 4;

type ReminderRow = {
  id: string;
  kanzlei_id: string;
  mandant_token: string;
  case_label: string | null;
  mandant_email: string | null;
  reminder_sent_at: number | null;
  created_at: number;
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime?.env;
  if (!env?.DB || !env.SECRET_KEY) return new Response('Server misconfigured', { status: 500 });

  const auth = request.headers.get('x-cron-auth');
  if (auth !== env.SECRET_KEY) return new Response('Unauthorized', { status: 401 });

  const now = Math.floor(Date.now() / 1000);
  const cutoffStale = now - REMINDER_AFTER_DAYS * 86400;
  const cutoffCooldown = now - COOLDOWN_DAYS * 86400;

  // Akten that are still open (draft or in_progress), have a mandant_email, and either
  // never got a reminder OR last reminder is older than the cooldown.
  const result = await env.DB
    .prepare(
      `SELECT id, kanzlei_id, mandant_token, case_label, mandant_email, reminder_sent_at, created_at
       FROM akte
       WHERE status IN ('draft', 'in_progress')
         AND mandant_email IS NOT NULL
         AND created_at < ?1
         AND (reminder_sent_at IS NULL OR reminder_sent_at < ?2)
       LIMIT 100`,
    )
    .bind(cutoffStale, cutoffCooldown)
    .all<ReminderRow>();

  const candidates = result.results ?? [];
  const origin = new URL(request.url).origin;
  const log: { sent: number; skipped: number; errors: string[] } = { sent: 0, skipped: 0, errors: [] };

  for (const row of candidates) {
    if (!row.mandant_email) {
      log.skipped++;
      continue;
    }
    const kanzlei = await findKanzleiById(env.DB, row.kanzlei_id);
    if (!kanzlei) {
      log.skipped++;
      continue;
    }
    const inviteUrl = `${origin}/m/${row.mandant_token}`;
    try {
      await sendReminderEmail(env, row.mandant_email, kanzlei.display_name, inviteUrl);
      await env.DB
        .prepare('UPDATE akte SET reminder_sent_at = ?1 WHERE id = ?2')
        .bind(now, row.id)
        .run();
      log.sent++;
    } catch (err) {
      log.errors.push(`${row.id}: ${(err as Error).message ?? 'unknown error'}`);
    }
  }

  return new Response(JSON.stringify(log, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
};

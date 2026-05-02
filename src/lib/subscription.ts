import { newId } from './ids';
import type { Plan } from './stripe';

export type SubscriptionRow = {
  kanzlei_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: Plan;
  status: string;
  current_period_end: number | null;
  seat_count: number;
  cancel_at_period_end: number;
  created_at: number;
  updated_at: number;
};

export async function getSubscription(db: D1Database, kanzleiId: string): Promise<SubscriptionRow | null> {
  const row = await db
    .prepare('SELECT * FROM subscription WHERE kanzlei_id = ?1 LIMIT 1')
    .bind(kanzleiId)
    .first<SubscriptionRow>();
  return row ?? null;
}

export async function setStripeCustomer(
  db: D1Database,
  kanzleiId: string,
  customerId: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare('UPDATE subscription SET stripe_customer_id = ?1, updated_at = ?2 WHERE kanzlei_id = ?3')
    .bind(customerId, now, kanzleiId)
    .run();
}

export async function applySubscriptionUpdate(
  db: D1Database,
  args: {
    kanzleiId: string;
    stripeSubscriptionId: string;
    plan: Plan;
    status: string;
    currentPeriodEnd: number | null;
    seatCount: number;
    cancelAtPeriodEnd: boolean;
  },
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `UPDATE subscription SET
         stripe_subscription_id = ?1,
         plan = ?2,
         status = ?3,
         current_period_end = ?4,
         seat_count = ?5,
         cancel_at_period_end = ?6,
         updated_at = ?7
       WHERE kanzlei_id = ?8`,
    )
    .bind(
      args.stripeSubscriptionId,
      args.plan,
      args.status,
      args.currentPeriodEnd,
      args.seatCount,
      args.cancelAtPeriodEnd ? 1 : 0,
      now,
      args.kanzleiId,
    )
    .run();
}

export async function clearSubscription(db: D1Database, kanzleiId: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `UPDATE subscription SET
         stripe_subscription_id = NULL,
         plan = 'pilot',
         status = 'canceled',
         current_period_end = NULL,
         cancel_at_period_end = 0,
         updated_at = ?1
       WHERE kanzlei_id = ?2`,
    )
    .bind(now, kanzleiId)
    .run();
}

// ── Invoices ─────────────────────────────────────────────────────────────

export type InvoiceArgs = {
  kanzleiId: string;
  stripeInvoiceId: string;
  number: string | null;
  amountCents: number;
  currency: string;
  status: string;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  periodStart: number | null;
  periodEnd: number | null;
};

export async function upsertInvoice(db: D1Database, args: InvoiceArgs): Promise<void> {
  const existing = await db
    .prepare('SELECT id FROM invoice WHERE stripe_invoice_id = ?1 LIMIT 1')
    .bind(args.stripeInvoiceId)
    .first<{ id: string }>();
  if (existing) {
    await db
      .prepare(
        `UPDATE invoice SET
           number = ?1, amount_cents = ?2, currency = ?3, status = ?4,
           hosted_invoice_url = ?5, invoice_pdf_url = ?6,
           period_start = ?7, period_end = ?8
         WHERE id = ?9`,
      )
      .bind(
        args.number, args.amountCents, args.currency, args.status,
        args.hostedInvoiceUrl, args.invoicePdfUrl,
        args.periodStart, args.periodEnd, existing.id,
      )
      .run();
    return;
  }
  await db
    .prepare(
      `INSERT INTO invoice
        (id, kanzlei_id, stripe_invoice_id, number, amount_cents, currency, status,
         hosted_invoice_url, invoice_pdf_url, period_start, period_end)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
    )
    .bind(
      newId(), args.kanzleiId, args.stripeInvoiceId, args.number,
      args.amountCents, args.currency, args.status,
      args.hostedInvoiceUrl, args.invoicePdfUrl,
      args.periodStart, args.periodEnd,
    )
    .run();
}

// ── Limit-Enforcement helpers ────────────────────────────────────────────

export async function countActiveAkten(db: D1Database, kanzleiId: string): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM akte WHERE kanzlei_id = ?1 AND status != 'archived'`)
    .bind(kanzleiId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function countActiveSeats(db: D1Database, kanzleiId: string): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM kanzlei_user WHERE kanzlei_id = ?1 AND status = 'active'`)
    .bind(kanzleiId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

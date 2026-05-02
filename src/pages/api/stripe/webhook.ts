import type { APIRoute } from 'astro';
import { verifyStripeSignature, planFromStripePrice } from '../../../lib/stripe';
import { applySubscriptionUpdate, clearSubscription, upsertInvoice } from '../../../lib/subscription';

export const prerender = false;

type StripeEvent = {
  id: string;
  type: string;
  data: { object: any };
};

async function handleSubscriptionEvent(env: Env, sub: any) {
  const kanzleiId = (sub.metadata?.kanzlei_id as string | undefined)
    ?? null;
  if (!kanzleiId) {
    console.warn('subscription event without kanzlei_id metadata', sub.id);
    return;
  }

  if (sub.status === 'canceled') {
    await clearSubscription(env.DB, kanzleiId);
    return;
  }

  const item = sub.items?.data?.[0];
  const priceId = item?.price?.id as string | undefined;
  const seatCount = (item?.quantity as number | undefined) ?? 1;
  const plan = planFromStripePrice(priceId, env);

  await applySubscriptionUpdate(env.DB, {
    kanzleiId,
    stripeSubscriptionId: sub.id,
    plan,
    status: sub.status,
    currentPeriodEnd: sub.current_period_end ?? null,
    seatCount,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
  });
}

async function handleInvoiceEvent(env: Env, inv: any) {
  const kanzleiId = (inv.subscription_details?.metadata?.kanzlei_id as string | undefined)
    ?? (inv.metadata?.kanzlei_id as string | undefined)
    ?? null;
  if (!kanzleiId) {
    console.warn('invoice event without kanzlei_id metadata', inv.id);
    return;
  }
  await upsertInvoice(env.DB, {
    kanzleiId,
    stripeInvoiceId: inv.id,
    number: inv.number ?? null,
    amountCents: inv.amount_paid ?? inv.amount_due ?? 0,
    currency: (inv.currency ?? 'eur').toUpperCase(),
    status: inv.status ?? 'unknown',
    hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
    invoicePdfUrl: inv.invoice_pdf ?? null,
    periodStart: inv.period_start ?? null,
    periodEnd: inv.period_end ?? null,
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime?.env;
  if (!env?.DB || !env.STRIPE_WEBHOOK_SECRET) {
    return new Response('Server misconfigured', { status: 500 });
  }

  const sig = request.headers.get('stripe-signature');
  const payload = await request.text();
  const ok = await verifyStripeSignature(payload, sig, env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return new Response('Invalid signature', { status: 401 });

  let event: StripeEvent;
  try { event = JSON.parse(payload); }
  catch { return new Response('Invalid JSON', { status: 400 }); }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionEvent(env, event.data.object);
        break;
      case 'invoice.paid':
      case 'invoice.payment_failed':
      case 'invoice.finalized':
        await handleInvoiceEvent(env, event.data.object);
        break;
      default:
        // ignore other events
        break;
    }
  } catch (err) {
    console.error('webhook handler failed', event.type, err);
    return new Response('Handler error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

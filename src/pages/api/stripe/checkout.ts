import type { APIRoute } from 'astro';
import { findKanzleiById } from '../../../lib/db';
import { findUserById } from '../../../lib/users';
import { createStripeCustomer, createCheckoutSession } from '../../../lib/stripe';
import { getSubscription, setStripeCustomer } from '../../../lib/subscription';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !session) return new Response('Unauthorized', { status: 401 });
  if (session.role !== 'admin') {
    return redirect('/app/account/billing?error=' + encodeURIComponent('Nur Administratoren können Pläne ändern'), 303);
  }
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_STANDARD) {
    return redirect('/app/account/billing?error=' + encodeURIComponent('Stripe ist serverseitig nicht konfiguriert'), 303);
  }

  const kanzlei = await findKanzleiById(env.DB, session.kanzlei_id);
  const user = await findUserById(env.DB, session.user_id);
  if (!kanzlei || !user) return new Response('Nicht gefunden', { status: 404 });

  let sub = await getSubscription(env.DB, kanzlei.id);
  let customerId = sub?.stripe_customer_id ?? null;

  if (!customerId) {
    const c = await createStripeCustomer(
      env.STRIPE_SECRET_KEY,
      kanzlei.email,
      kanzlei.display_name,
      kanzlei.id,
    );
    customerId = c.id;
    await setStripeCustomer(env.DB, kanzlei.id, customerId);
  }

  const origin = new URL(request.url).origin;
  const checkout = await createCheckoutSession(env.STRIPE_SECRET_KEY, {
    customerId,
    priceId: env.STRIPE_PRICE_STANDARD,
    successUrl: `${origin}/app/account/billing?checkout=success`,
    cancelUrl: `${origin}/app/account/billing?checkout=cancel`,
    quantity: 1,
    kanzleiId: kanzlei.id,
  });

  return redirect(checkout.url, 303);
};

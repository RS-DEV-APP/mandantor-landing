import type { APIRoute } from 'astro';
import { createPortalSession } from '../../../lib/stripe';
import { getSubscription } from '../../../lib/subscription';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime?.env;
  const session = locals.session;
  if (!env?.DB || !session) return new Response('Unauthorized', { status: 401 });
  if (session.role !== 'admin') {
    return redirect('/app/account/billing?error=' + encodeURIComponent('Nur Administratoren'), 303);
  }
  if (!env.STRIPE_SECRET_KEY) {
    return redirect('/app/account/billing?error=' + encodeURIComponent('Stripe nicht konfiguriert'), 303);
  }

  const sub = await getSubscription(env.DB, session.kanzlei_id);
  if (!sub?.stripe_customer_id) {
    return redirect('/app/account/billing?error=' + encodeURIComponent('Noch keine Stripe-Verknüpfung — erst Plan auswählen'), 303);
  }

  const origin = new URL(request.url).origin;
  const portal = await createPortalSession(
    env.STRIPE_SECRET_KEY,
    sub.stripe_customer_id,
    `${origin}/app/account/billing`,
  );
  return redirect(portal.url, 303);
};

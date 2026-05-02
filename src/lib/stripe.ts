// Thin Stripe REST wrapper — kein npm-SDK, direkt fetch gegen api.stripe.com.
// Reicht für Customer/Checkout/Subscription/Invoice und läuft ohne Bundle-Bloat
// im Cloudflare-Workers-Runtime.

const STRIPE_API = 'https://api.stripe.com/v1';

function formEncode(payload: Record<string, string | number | undefined | null>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(payload)) {
    if (v === undefined || v === null) continue;
    params.set(k, String(v));
  }
  return params.toString();
}

async function stripeFetch(
  apiKey: string,
  path: string,
  init: { method: 'GET' | 'POST'; body?: string } = { method: 'GET' },
): Promise<any> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: init.body,
  });
  const json = (await res.json()) as any;
  if (!res.ok) {
    const msg = json?.error?.message ?? `Stripe ${res.status}`;
    throw new Error(`Stripe API: ${msg}`);
  }
  return json;
}

// ── Customer ─────────────────────────────────────────────────────────────

export async function createStripeCustomer(
  apiKey: string,
  email: string,
  name: string,
  kanzleiId: string,
): Promise<{ id: string }> {
  const body = formEncode({
    email,
    name,
    'metadata[kanzlei_id]': kanzleiId,
  });
  return stripeFetch(apiKey, '/customers', { method: 'POST', body });
}

// ── Checkout ─────────────────────────────────────────────────────────────

export async function createCheckoutSession(
  apiKey: string,
  args: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    quantity?: number;
    kanzleiId: string;
  },
): Promise<{ id: string; url: string }> {
  const body = formEncode({
    'mode': 'subscription',
    'customer': args.customerId,
    'line_items[0][price]': args.priceId,
    'line_items[0][quantity]': args.quantity ?? 1,
    'success_url': args.successUrl,
    'cancel_url': args.cancelUrl,
    'allow_promotion_codes': 'true',
    'subscription_data[metadata][kanzlei_id]': args.kanzleiId,
    'metadata[kanzlei_id]': args.kanzleiId,
    'locale': 'de',
    'billing_address_collection': 'required',
  });
  return stripeFetch(apiKey, '/checkout/sessions', { method: 'POST', body });
}

// ── Customer Portal (Plan-Wechsel, Kündigung, Zahlungsmittel) ────────────

export async function createPortalSession(
  apiKey: string,
  customerId: string,
  returnUrl: string,
): Promise<{ id: string; url: string }> {
  const body = formEncode({
    customer: customerId,
    return_url: returnUrl,
  });
  return stripeFetch(apiKey, '/billing_portal/sessions', { method: 'POST', body });
}

// ── Webhook signature verification ──────────────────────────────────────

export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const i = kv.indexOf('=');
      return [kv.slice(0, i), kv.slice(i + 1)];
    }),
  );
  const t = parts.t;
  const sigs = Object.entries(parts)
    .filter(([k]) => k.startsWith('v') && k !== 'v0')
    .map(([, v]) => v);
  if (!t || sigs.length === 0) return false;
  const ts = parseInt(t, 10);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > toleranceSeconds) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const data = enc.encode(`${t}.${payload}`);
  const sigBuf = await crypto.subtle.sign('HMAC', key, data);
  const expected = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return sigs.includes(expected);
}

// ── Plan helpers ─────────────────────────────────────────────────────────

export type Plan = 'pilot' | 'starter' | 'pro';

export const PLAN_LIMITS: Record<Plan, { activeAkten: number | null; seats: number | null }> = {
  pilot: { activeAkten: null, seats: null },
  starter: { activeAkten: 50, seats: 1 },
  pro: { activeAkten: 250, seats: 10 },
};

export function planFromStripePrice(priceId: string | undefined, env: Env): Plan {
  if (!priceId) return 'pilot';
  if (env.STRIPE_PRICE_STANDARD && priceId === env.STRIPE_PRICE_STANDARD) return 'starter';
  // Future: STRIPE_PRICE_PRO
  return 'starter';
}

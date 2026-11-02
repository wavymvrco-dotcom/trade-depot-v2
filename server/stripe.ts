// Stripe integration via Replit connector — do NOT cache the client, tokens expire
import Stripe from "stripe";

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) throw new Error("X-Replit-Token not found");

  const connectorName = "stripe";
  const isProduction = process.env.REPLIT_DEPLOYMENT === "1";
  const targetEnvironment = isProduction ? "production" : "development";

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set("include_secrets", "true");
  url.searchParams.set("connector_names", connectorName);
  url.searchParams.set("environment", targetEnvironment);

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json", "X-Replit-Token": xReplitToken },
  });
  const data = await response.json();
  const connectionSettings = data.items?.[0];

  if (!connectionSettings?.settings?.publishable || !connectionSettings?.settings?.secret) {
    throw new Error(`Stripe ${targetEnvironment} connection not found`);
  }

  return {
    publishableKey: connectionSettings.settings.publishable as string,
    secretKey: connectionSettings.settings.secret as string,
  };
}

// WARNING: Never cache — call fresh every request
export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getCredentials();
  return new Stripe(secretKey, { apiVersion: "2025-08-27.basil" as any });
}

export async function getStripePublishableKey(): Promise<string> {
  const { publishableKey } = await getCredentials();
  return publishableKey;
}

// ── Billing helpers ────────────────────────────────────────────────────────────

/** Create a Stripe customer silently — call on user registration */
export async function createStripeCustomer(userId: string, username: string, email?: string | null) {
  try {
    const stripe = await getUncachableStripeClient();
    const customer = await stripe.customers.create({
      name: username,
      email: email || undefined,
      metadata: { userId },
    });
    return customer.id;
  } catch (e: any) {
    console.error("[Stripe] Failed to create customer:", e.message);
    return null;
  }
}

/** Get or create a Stripe checkout session for Pro subscription */
export async function createCheckoutSession(stripeCustomerId: string, successUrl: string, cancelUrl: string) {
  const stripe = await getUncachableStripeClient();

  // Get or create the Pro price
  const priceId = await getProPriceId(stripe);

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    subscription_data: {
      trial_period_days: 30, // 30-day trial for Pro at launch
      metadata: { customerId: stripeCustomerId },
    },
  });

  return session;
}

/** Create a billing portal session for managing subscriptions */
export async function createPortalSession(stripeCustomerId: string, returnUrl: string) {
  const stripe = await getUncachableStripeClient();
  return stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  });
}

/** Retrieve a customer's active subscriptions */
export async function getCustomerSubscriptions(stripeCustomerId: string) {
  try {
    const stripe = await getUncachableStripeClient();
    const subs = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: "all",
      limit: 5,
    });
    return subs.data;
  } catch {
    return [];
  }
}

// ── Internal helpers ────────────────────────────────────────────────────────────

let cachedProPriceId: string | null = null;

async function getProPriceId(stripe: Stripe): Promise<string> {
  if (cachedProPriceId) return cachedProPriceId;

  // Look for existing product
  const products = await stripe.products.list({ active: true, limit: 20 });
  let product = products.data.find(p => p.name === "TradeAI Terminal Pro");

  if (!product) {
    product = await stripe.products.create({
      name: "TradeAI Terminal Pro",
      description: "Full access to all TradeAI Terminal features, priority AI processing, and unlimited signals.",
    });
  }

  // Look for existing price
  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 10 });
  let price = prices.data.find(p => p.unit_amount === 2900 && p.currency === "usd" && p.recurring?.interval === "month");

  if (!price) {
    price = await stripe.prices.create({
      product: product.id,
      unit_amount: 2900, // $29.00
      currency: "usd",
      recurring: { interval: "month" },
      nickname: "Pro Monthly",
    });
  }

  cachedProPriceId = price.id;
  return price.id;
}

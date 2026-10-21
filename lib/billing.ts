import { createHmac } from "node:crypto";
import { db, nowIso } from "./db";
import { safeEqual } from "./crypto";
import { env } from "./env";
import { PLANS, type PlanId } from "./plans";
import { getUser, type User } from "./store";

const STRIPE = "https://api.stripe.com/v1";

function priceFor(plan: PlanId): string | undefined {
  return { creator: process.env.STRIPE_PRICE_CREATOR, pro: process.env.STRIPE_PRICE_PRO, agency: process.env.STRIPE_PRICE_AGENCY, trial: undefined }[plan];
}

function planForPrice(priceId: string | undefined): PlanId | null {
  if (!priceId) return null;
  for (const p of ["creator", "pro", "agency"] as const) if (priceFor(p) === priceId) return p;
  return null;
}

async function stripe<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${STRIPE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(30_000),
  });
  const data = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(data.error?.message || `Stripe ${res.status}`);
  return data;
}

export async function createCheckoutUrl(user: User, plan: PlanId): Promise<string> {
  if (!env.billingEnabled) throw new Error("Billing is not configured");
  const price = priceFor(plan);
  if (!price) throw new Error(`No Stripe price configured for ${PLANS[plan].name}`);
  const params: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    success_url: `${env.appUrl}/billing?status=success`,
    cancel_url: `${env.appUrl}/billing?status=cancelled`,
    client_reference_id: user.id,
    "metadata[user_id]": user.id,
    "metadata[plan]": plan,
    "subscription_data[metadata][user_id]": user.id,
    "subscription_data[metadata][plan]": plan,
    allow_promotion_codes: "true",
  };
  if (user.stripe_customer_id) params.customer = user.stripe_customer_id;
  else params.customer_email = user.email;
  const s = await stripe<{ url: string }>("/checkout/sessions", params);
  return s.url;
}

export async function createPortalUrl(user: User): Promise<string> {
  if (!user.stripe_customer_id) throw new Error("No billing account yet");
  const s = await stripe<{ url: string }>("/billing_portal/sessions", { customer: user.stripe_customer_id, return_url: `${env.appUrl}/billing` });
  return s.url;
}

/** Stripe signature check: HMAC-SHA256 over `${timestamp}.${rawBody}`, with a 5 minute tolerance. */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, nowMs = Date.now()): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = parts.t;
  const v1s = header.split(",").filter((kv) => kv.startsWith("v1=")).map((kv) => kv.slice(3));
  if (!t || !v1s.length) return false;
  if (Math.abs(nowMs / 1000 - Number(t)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return v1s.some((v) => safeEqual(v, expected));
}

interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export function handleStripeEvent(evt: StripeEvent): "handled" | "duplicate" | "ignored" {
  const seen = db().prepare("INSERT OR IGNORE INTO stripe_events (id, received_at) VALUES (?,?)").run(evt.id, nowIso());
  if (seen.changes === 0) return "duplicate";
  const o = evt.data.object as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  if (evt.type === "checkout.session.completed") {
    const userId = o.client_reference_id || o.metadata?.user_id;
    if (!userId || !getUser(userId)) return "ignored";
    const plan = (o.metadata?.plan as PlanId) || "creator";
    db().prepare("UPDATE users SET plan=?, stripe_customer_id=?, stripe_subscription_id=?, subscription_status='active' WHERE id=?").run(plan in PLANS ? plan : "creator", o.customer ?? null, o.subscription ?? null, userId);
    return "handled";
  }
  if (evt.type === "customer.subscription.updated" || evt.type === "customer.subscription.deleted") {
    const row = db().prepare("SELECT id FROM users WHERE stripe_subscription_id=? OR stripe_customer_id=?").get(o.id, o.customer) as { id: string } | undefined;
    if (!row) return "ignored";
    const status = evt.type === "customer.subscription.deleted" ? "canceled" : String(o.status);
    const plan = planForPrice(o.items?.data?.[0]?.price?.id);
    db().prepare("UPDATE users SET subscription_status=?, plan=COALESCE(?, plan), stripe_subscription_id=? WHERE id=?").run(status, plan, o.id, row.id);
    return "handled";
  }
  return "ignored";
}

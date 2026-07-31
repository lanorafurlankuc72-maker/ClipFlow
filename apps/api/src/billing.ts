import { createHmac, timingSafeEqual } from 'node:crypto';
import type { UserAccount } from './database.js';

interface StripeCheckoutSession {
  id: string;
  url?: string | null;
  status?: string | null;
  payment_status?: string | null;
  client_reference_id?: string | null;
  customer?: string | null;
  subscription?: string | null;
}

export function billingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

export async function createCheckoutSession(user: UserAccount): Promise<StripeCheckoutSession> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!secretKey || !priceId) throw new BillingNotConfiguredError();

  const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const body = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    success_url: `${appUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/?checkout=cancelled`,
    client_reference_id: user.id,
    'metadata[user_id]': user.id,
  });
  if (user.stripeCustomerId) body.set('customer', user.stripeCustomerId);
  else body.set('customer_email', user.email);

  return stripeRequest<StripeCheckoutSession>('/checkout/sessions', { method: 'POST', body });
}

export async function retrieveCheckoutSession(sessionId: string): Promise<StripeCheckoutSession> {
  if (!process.env.STRIPE_SECRET_KEY) throw new BillingNotConfiguredError();
  return stripeRequest<StripeCheckoutSession>(
    `/checkout/sessions/${encodeURIComponent(sessionId)}`,
  );
}

export function isPaidSubscription(session: StripeCheckoutSession): boolean {
  return (
    session.status === 'complete' &&
    session.payment_status === 'paid' &&
    typeof session.subscription === 'string'
  );
}

export function parseStripeWebhook(rawBody: Buffer, signatureHeader: string | undefined) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) throw new InvalidWebhookSignatureError();
  const pairs = signatureHeader.split(',').map((entry) => entry.split('='));
  const timestamp = pairs.find(([key]) => key === 't')?.[1];
  const signatures = pairs
    .filter((entry): entry is [string, string] => entry[0] === 'v1' && Boolean(entry[1]))
    .map(([, value]) => value);
  if (!timestamp || signatures.length === 0) throw new InvalidWebhookSignatureError();
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300)
    throw new InvalidWebhookSignatureError();
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const valid = signatures.some((signature) => {
    const actual = Buffer.from(signature, 'hex');
    return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
  });
  if (!valid) throw new InvalidWebhookSignatureError();
  return JSON.parse(rawBody.toString('utf8')) as {
    type: string;
    data: { object: StripeCheckoutSession };
  };
}

async function stripeRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(init.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
  });
  const payload = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) throw new StripeApiError(payload.error?.message ?? 'Stripe request failed');
  return payload;
}

export class BillingNotConfiguredError extends Error {}
export class InvalidWebhookSignatureError extends Error {}
export class StripeApiError extends Error {}

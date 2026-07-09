/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Server configuration: HTTP port, Stripe client, pricing catalog, and the admin
 * allow-list. Pure constants + helpers with no app/state dependencies.
 */
import Stripe from 'stripe';

export const PORT = 3000;

// Stripe client — null when no secret key is configured so the app still boots;
// billing endpoints that require Stripe then respond 503 instead of crashing.
export const stripeClient = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// Central pricing config. Amounts are in CENTS, mirroring the pricing UI in
// src/components/SubscriptionPricing.tsx. Verify against the live Stripe catalog
// before production. `accessTier` maps each plan onto the internal access tier.
export const TIER_PRICING: Record<string, {
  tier: number;
  name: string;
  monthly: number;
  annual: number;
  oneTime?: number;
  accessTier: 'discord' | 'pinpoint' | 'skyvision' | 'lifetime';
}> = {
  // Three-tier ladder: Pinpoint ($125 — everything except SkyVision picks &
  // Quant Lab, Discord folded in) → SkyVision ($275 — everything included) →
  // Lifetime (contact-only, no self-serve price). Annual ≈ 17-18% off
  // (103×12 / 226×12). The legacy `discord` plan is no longer sold but stays
  // mapped so existing discord-tier accounts keep resolving.
  discord:   { tier: 1, name: 'Discord',   monthly: 3900,  annual: 38400,  accessTier: 'discord' },
  pinpoint:  { tier: 2, name: 'Pinpoint',  monthly: 12500, annual: 123600, accessTier: 'pinpoint' },
  skyvision: { tier: 3, name: 'SkyVision', monthly: 27500, annual: 271200, accessTier: 'skyvision' },
  lifetime:  { tier: 5, name: 'Lifetime',  monthly: 0,     annual: 0,      accessTier: 'lifetime' },
};

// Admins MUST be configured via ADMIN_EMAILS in production (fail closed); the
// demo defaults apply only outside production.
const splitEmails = (v?: string): string[] => (v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

export const ADMIN_EMAILS = splitEmails(process.env.ADMIN_EMAILS || (process.env.NODE_ENV === 'production' ? '' : 'admin@slayer.io,demo@slayer.io'));
// Granular role tiers (optional, comma-separated env lists). Previously every
// ADMIN_EMAILS entry collapsed to 'owner', making the 6-role type meaningless and
// over-granting privilege. Now owner ⊃ admin ⊃ moderator are distinct.
//
// SECURITY: the owner identity is driven entirely by OWNER_EMAILS so it can be
// rotated/revoked via env without a code change. Demo defaults apply only outside
// production; production fails closed unless OWNER_EMAILS/ADMIN_EMAILS is set.
export const OWNER_EMAILS = splitEmails(process.env.OWNER_EMAILS || (process.env.NODE_ENV === 'production' ? '' : 'zakali6122@gmail.com'));
export const MODERATOR_EMAILS = splitEmails(process.env.MODERATOR_EMAILS);

export type AdminRole = 'owner' | 'admin' | 'moderator' | 'analyst' | 'premium_user' | 'user';

export function roleForEmail(email?: string | null): AdminRole {
  if (!email) return 'user';
  const mail = email.toLowerCase().trim();
  if (OWNER_EMAILS.includes(mail)) return 'owner';
  if (ADMIN_EMAILS.includes(mail)) return 'admin';
  if (MODERATOR_EMAILS.includes(mail)) return 'moderator';
  return 'user';
}

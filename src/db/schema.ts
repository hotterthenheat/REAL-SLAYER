import { relations } from 'drizzle-orm';
import { bigint, boolean, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // legacy auth UID
  email: text('email').notNull().unique(), // business key — upserts conflict on this
  version: integer('version').default(0).notNull(), // OCC for token/billing updates
  tokens: integer('tokens').default(0).notNull(),
  fullProfile: text('full_profile'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Durable moderation state (bans/suspensions + a session-revocation watermark),
// created at runtime by ensureSchema(). Declared here so drizzle-kit push/generate
// does NOT treat it as drift and emit a DROP — that would wipe live ban/suspension
// state and the session watermark.
export const moderation = pgTable('moderation', {
  email: text('email').primaryKey(),
  banned: boolean('banned').default(false).notNull(),
  suspended: boolean('suspended').default(false).notNull(),
  sessionsValidAfter: bigint('sessions_valid_after', { mode: 'number' }).default(0).notNull(),
});

// Stripe webhook idempotency ledger. Declared for the same anti-drift reason — a DROP
// here would re-enable webhook replay (double-processing grants/cancellations).
export const processedWebhookEvents = pgTable('processed_webhook_events', {
  eventId: text('event_id').primaryKey(),
  processedAt: bigint('processed_at', { mode: 'number' }).default(0).notNull(),
});

// Self-learning loop — every model prediction is logged here and later labeled with its
// realized outcome once the horizon elapses, so calibration (isotonic / Brier / ECE) and
// the nearest-neighbour history train on REAL results instead of an empty array / PRNG.
// Durable so accumulated outcomes survive restarts and can reach the calibration
// activation threshold (the prior in-memory state reset every deploy).
export const predictions = pgTable('predictions', {
  id: serial('id').primaryKey(),
  predictionId: text('prediction_id').notNull().unique(),
  ticker: text('ticker').notNull(),
  kind: text('kind').notNull(),                              // 'skyscore' | 'trade' | 'discovery' | ...
  predictedProb: integer('predicted_prob').notNull(),       // 0-100 win probability the model emitted
  features: text('features'),                               // JSON feature vector (for KNN lookup)
  horizonMs: bigint('horizon_ms', { mode: 'number' }).notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  labeledAt: bigint('labeled_at', { mode: 'number' }),      // null until the outcome is known
  outcomeWin: boolean('outcome_win'),                       // null until labeled
  realizedReturn: text('realized_return'),                  // text to avoid float drift
});

// SaaS production core: normalized identity, access, billing, audit, session, and
// API-key tables. The legacy `users.full_profile` remains for backward compatibility
// while route code is migrated; new production paths should write to these tables.
export const accounts = pgTable('accounts', {
  id: serial('id').primaryKey(),
  primaryEmail: text('primary_email').notNull().unique(),
  displayName: text('display_name'),
  emailVerifiedAt: bigint('email_verified_at', { mode: 'number' }),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

export const memberships = pgTable('memberships', {
  id: serial('id').primaryKey(),
  accountId: integer('account_id').notNull(),
  role: text('role').notNull(),
  status: text('status').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
});

export const subscriptions = pgTable('subscriptions', {
  id: serial('id').primaryKey(),
  accountId: integer('account_id').notNull(),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  status: text('status').notNull(),
  priceId: text('price_id'),
  currentPeriodEnd: bigint('current_period_end', { mode: 'number' }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

export const entitlements = pgTable('entitlements', {
  id: serial('id').primaryKey(),
  accountId: integer('account_id').notNull(),
  key: text('key').notNull(),
  source: text('source').notNull(),
  active: boolean('active').default(true).notNull(),
  expiresAt: bigint('expires_at', { mode: 'number' }),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

export const usageEvents = pgTable('usage_events', {
  id: serial('id').primaryKey(),
  accountId: integer('account_id'),
  eventName: text('event_name').notNull(),
  quantity: integer('quantity').default(1).notNull(),
  metadata: text('metadata'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});

export const apiKeys = pgTable('api_keys', {
  id: serial('id').primaryKey(),
  accountId: integer('account_id').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  label: text('label'),
  lastUsedAt: bigint('last_used_at', { mode: 'number' }),
  revokedAt: bigint('revoked_at', { mode: 'number' }),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});

export const auditEvents = pgTable('audit_events', {
  id: serial('id').primaryKey(),
  actorAccountId: integer('actor_account_id'),
  actorEmail: text('actor_email'),
  action: text('action').notNull(),
  target: text('target'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  metadata: text('metadata'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});

export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  sessionId: text('session_id').notNull().unique(),
  accountId: integer('account_id'),
  email: text('email').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  lastActiveAt: bigint('last_active_at', { mode: 'number' }).notNull(),
  revokedAt: bigint('revoked_at', { mode: 'number' }),
});

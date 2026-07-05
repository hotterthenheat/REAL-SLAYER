import { create } from 'zustand';

/**
 * Tracked-setups service — the persistence + lifecycle engine behind "Track Result".
 *
 * The product promise is Scan → Confirm → Validate → Track. This module is the "Track"
 * half: when a user tracks a setup from SkyVision or Pinpoint we persist a real record and
 * then re-price it over time from observed spot + the entry greeks, transitioning it through
 * a true lifecycle (TRACKED → ACTIVE → RESOLVED/INVALIDATED/EXPIRED). Trade History reads
 * these records; it is no longer an empty shell.
 *
 * Honesty rules baked in:
 *  - Nothing is fabricated. A setup only updates while we can OBSERVE its underlying (the
 *    active terminal asset's live spot); otherwise it holds its last-known state.
 *  - The data mode at track time (LIVE / DELAYED / MODEL / SAMPLE) is recorded on the setup
 *    and never changed, so Trade History can keep live performance separate from model/sample.
 *  - Persistence goes through a swappable abstraction so a server store can replace the
 *    local-first one without touching callers.
 */

// ── Lifecycle ────────────────────────────────────────────────────────────────
export type TrackStatus =
  | 'REVIEWED'      // seen, not yet committed (reserved; UI tracks directly today)
  | 'TRACKED'       // committed, awaiting first observation
  | 'ACTIVE'        // observed at least once, live
  | 'INVALIDATED'   // price touched the invalidation level
  | 'RESOLVED_WIN'  // premium reached the target
  | 'RESOLVED_LOSS' // premium collapsed
  | 'EXPIRED'       // ran out of time
  | 'CANCELLED';    // user cancelled

export const TERMINAL_STATUSES: TrackStatus[] = ['INVALIDATED', 'RESOLVED_WIN', 'RESOLVED_LOSS', 'EXPIRED', 'CANCELLED'];
export const isTerminal = (s: TrackStatus) => TERMINAL_STATUSES.includes(s);

export type TrackSource = 'skyvision' | 'pinpoint';
export type TrackKind = 'contract' | 'structure';
/** Mirrors DataStateBadge's taxonomy — recorded at track time, never mutated. */
export type TrackDataMode = 'live' | 'delayed' | 'model' | 'sample';

export interface TrackedSetup {
  id: string;
  createdAt: number;             // ms epoch — "setup opened" time
  updatedAt: number;
  source: TrackSource;
  kind: TrackKind;
  dataMode: TrackDataMode;

  // Contract identity
  ticker: string;
  contract: string;              // display label, e.g. "SPX 5525P"
  direction: 'BULLISH' | 'BEARISH';
  strike: number;
  expiry: string;                // display label, e.g. "0DTE" / "Jun 30"
  optionType: 'C' | 'P';

  // Entry snapshot
  setupScore: number;            // 0–100
  confidence: number;            // 0–100
  premiumAtTrack: number;
  spotAtTrack: number;
  fairValue: number | null;
  expectedMovePct: number | null;
  invalidationLevel: number | null;
  dealerReason: string;
  volatilityReason: string;
  liquidityGrade: string;        // Tight / Fair / Wide / —

  // Modeling inputs (entry greeks) so premium can be re-priced from spot honestly.
  entryDelta: number;            // signed (calls +, puts −)
  entryThetaPerDay: number;      // negative
  dteDays: number;               // days to expiry at track time
  expiresAt: number;             // ms epoch — createdAt + dte window

  // Live tracking state
  status: TrackStatus;
  currentPremium: number;
  premiumChangePct: number;      // vs premiumAtTrack
  maxGainPct: number;
  maxDrawdownPct: number;
  invalidationTouched: boolean;
  targetReached: boolean;
  resolvedAt: number | null;
  finalReturnPct: number | null;
}

/** Everything a caller must supply; the rest is derived/defaulted. */
export interface TrackInput {
  source: TrackSource;
  kind?: TrackKind;
  dataMode: TrackDataMode;
  ticker: string;
  contract: string;
  direction: 'BULLISH' | 'BEARISH';
  strike: number;
  expiry: string;
  optionType: 'C' | 'P';
  setupScore: number;
  confidence: number;
  premiumAtTrack: number;
  spotAtTrack: number;
  fairValue?: number | null;
  expectedMovePct?: number | null;
  invalidationLevel?: number | null;
  dealerReason?: string;
  volatilityReason?: string;
  liquidityGrade?: string;
  entryDelta?: number;
  entryThetaPerDay?: number;
  dteDays?: number;
}

const DAY_MS = 86_400_000;
const clampPct = (n: number) => (isFinite(n) ? n : 0);

/** Target premium gain that counts as a win — the expected move, clamped to a sane band. */
function targetGainPct(s: Pick<TrackedSetup, 'expectedMovePct'>): number {
  const raw = s.expectedMovePct ?? 50;
  return Math.max(15, Math.min(300, raw));
}

// ── Identity / dedupe ─────────────────────────────────────────────────────────
/** A tracked setup is "the same" as another live one when it's the same contract + side. */
export function setupKey(s: Pick<TrackedSetup, 'ticker' | 'strike' | 'optionType' | 'kind'>): string {
  return s.kind === 'structure' ? `${s.ticker}:structure` : `${s.ticker}:${s.strike}:${s.optionType}`;
}

let idSeq = 0;
function makeId(now: number): string {
  // Deterministic-ish, collision-safe without Math.random (blocked in some sandboxes).
  idSeq = (idSeq + 1) % 100000;
  return `ts_${now.toString(36)}_${idSeq.toString(36)}`;
}

// ── Persistence abstraction (local-first, swappable to server) ─────────────────
export interface TrackingPersistence {
  load(): TrackedSetup[];
  save(list: TrackedSetup[]): void;
}

const STORAGE_KEY = 'slayer.trackedSetups.v1';

class LocalStoragePersistence implements TrackingPersistence {
  load(): TrackedSetup[] {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as TrackedSetup[]) : [];
    } catch {
      return [];
    }
  }
  save(list: TrackedSetup[]): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      /* quota / private mode — the in-memory store still works this session */
    }
  }
}

/** The active persistence backend. Swap here (or via setPersistence) for server storage. */
let persistence: TrackingPersistence = new LocalStoragePersistence();
export function setPersistence(p: TrackingPersistence) {
  persistence = p;
}

// ── Resolution engine ──────────────────────────────────────────────────────────
export interface MarketContext {
  ticker: string;
  spot: number;
  /** Live premium for the EXACT active contract, when the terminal is on it. */
  livePremium?: number | null;
  liveContractKey?: string | null; // setupKey of the active contract, if any
  now: number;
}

/**
 * Re-price one setup against observed market context and advance its lifecycle. Pure: returns
 * a new record (or the same reference when nothing changed). Only setups whose underlying is
 * the observed ticker move — everything else is held, because we can't honestly observe it.
 */
export function resolveSetup(s: TrackedSetup, ctx: MarketContext): TrackedSetup {
  if (isTerminal(s.status)) return s;
  if (s.ticker !== ctx.ticker || !isFinite(ctx.spot) || ctx.spot <= 0) {
    // Time can still expire a held setup even when we can't observe its price.
    if (ctx.now >= s.expiresAt) {
      const finalReturn = clampPct(s.premiumChangePct);
      return { ...s, status: 'EXPIRED', resolvedAt: ctx.now, finalReturnPct: finalReturn, updatedAt: ctx.now };
    }
    return s;
  }

  const spotMove = ctx.spot - s.spotAtTrack;
  const elapsedDays = Math.max(0, (ctx.now - s.createdAt) / DAY_MS);

  // Modeled premium from entry greeks: delta move + theta decay, floored at a penny.
  const modeled = s.premiumAtTrack + s.entryDelta * spotMove + s.entryThetaPerDay * elapsedDays;
  const useLive = s.kind === 'contract'
    && typeof ctx.livePremium === 'number'
    && isFinite(ctx.livePremium)
    && ctx.livePremium > 0
    && ctx.liveContractKey === setupKey(s);
  const current = Math.max(0.01, useLive ? (ctx.livePremium as number) : modeled);

  const changePct = clampPct(((current - s.premiumAtTrack) / s.premiumAtTrack) * 100);
  const maxGainPct = Math.max(s.maxGainPct, changePct);
  const maxDrawdownPct = Math.min(s.maxDrawdownPct, changePct);

  // Invalidation: a call dies below the level, a put above it.
  let invalidationTouched = s.invalidationTouched;
  if (s.invalidationLevel != null && isFinite(s.invalidationLevel)) {
    const touched = s.optionType === 'C' ? ctx.spot <= s.invalidationLevel : ctx.spot >= s.invalidationLevel;
    if (touched) invalidationTouched = true;
  }

  const target = targetGainPct(s);
  const targetReached = s.targetReached || changePct >= target;

  // Lifecycle transition (first-match wins; order encodes priority).
  let status: TrackStatus = s.status === 'TRACKED' ? 'ACTIVE' : s.status;
  let resolvedAt: number | null = s.resolvedAt;
  let finalReturnPct: number | null = s.finalReturnPct;

  if (targetReached) {
    status = 'RESOLVED_WIN'; resolvedAt = ctx.now; finalReturnPct = changePct;
  } else if (invalidationTouched) {
    status = 'INVALIDATED'; resolvedAt = ctx.now; finalReturnPct = changePct;
  } else if (changePct <= -70) {
    status = 'RESOLVED_LOSS'; resolvedAt = ctx.now; finalReturnPct = changePct;
  } else if (ctx.now >= s.expiresAt) {
    status = 'EXPIRED'; resolvedAt = ctx.now; finalReturnPct = changePct;
  }

  return {
    ...s,
    status,
    currentPremium: current,
    premiumChangePct: changePct,
    maxGainPct,
    maxDrawdownPct,
    invalidationTouched,
    targetReached,
    resolvedAt,
    finalReturnPct,
    updatedAt: ctx.now,
  };
}

// ── Store ────────────────────────────────────────────────────────────────────
interface TrackingState {
  setups: TrackedSetup[];
  /** Track a setup. Returns { setup, duplicate } — duplicate=true means an existing live
   *  record for the same contract was returned instead of creating a second. */
  track: (input: TrackInput, now: number) => { setup: TrackedSetup; duplicate: boolean };
  /** True when a non-terminal record already exists for this contract/side. */
  isTracked: (key: string) => boolean;
  cancel: (id: number | string) => void;
  clearResolved: () => void;
  clearAll: () => void;
  /** Re-price every setup against the observed market context. */
  updateFromMarket: (ctx: MarketContext) => void;
}

function persist(list: TrackedSetup[]): TrackedSetup[] {
  persistence.save(list);
  return list;
}

export const useTrackingStore = create<TrackingState>((set, get) => ({
  setups: persistence.load(),

  track: (input, now) => {
    const kind: TrackKind = input.kind ?? 'contract';
    const key = setupKey({ ticker: input.ticker, strike: input.strike, optionType: input.optionType, kind });
    const existing = get().setups.find(s => !isTerminal(s.status) && setupKey(s) === key);
    if (existing) return { setup: existing, duplicate: true };

    const dteDays = Math.max(0, input.dteDays ?? 14);
    const premium = Math.max(0.01, isFinite(input.premiumAtTrack) ? input.premiumAtTrack : 0.01);
    const setup: TrackedSetup = {
      id: makeId(now),
      createdAt: now,
      updatedAt: now,
      source: input.source,
      kind,
      dataMode: input.dataMode,
      ticker: input.ticker,
      contract: input.contract,
      direction: input.direction,
      strike: input.strike,
      expiry: input.expiry,
      optionType: input.optionType,
      setupScore: Math.round(input.setupScore) || 0,
      confidence: Math.round(input.confidence) || 0,
      premiumAtTrack: premium,
      spotAtTrack: input.spotAtTrack,
      fairValue: input.fairValue ?? null,
      expectedMovePct: input.expectedMovePct ?? null,
      invalidationLevel: input.invalidationLevel ?? null,
      dealerReason: input.dealerReason || '—',
      volatilityReason: input.volatilityReason || '—',
      liquidityGrade: input.liquidityGrade || '—',
      entryDelta: isFinite(input.entryDelta as number) ? (input.entryDelta as number) : (input.optionType === 'C' ? 0.5 : -0.5),
      entryThetaPerDay: isFinite(input.entryThetaPerDay as number) ? (input.entryThetaPerDay as number) : -Math.max(0.01, premium * 0.03),
      dteDays,
      // 0DTE gets a single-session window (~6.5h) so it can actually expire in a demo.
      expiresAt: now + Math.max(dteDays, 0.27) * DAY_MS,
      status: 'TRACKED',
      currentPremium: premium,
      premiumChangePct: 0,
      maxGainPct: 0,
      maxDrawdownPct: 0,
      invalidationTouched: false,
      targetReached: false,
      resolvedAt: null,
      finalReturnPct: null,
    };
    const next = persist([setup, ...get().setups]);
    set({ setups: next });
    return { setup, duplicate: false };
  },

  isTracked: (key) => get().setups.some(s => !isTerminal(s.status) && setupKey(s) === key),

  cancel: (id) => {
    const now = Date.now();
    const next = persist(get().setups.map(s =>
      s.id === id && !isTerminal(s.status)
        ? { ...s, status: 'CANCELLED' as TrackStatus, resolvedAt: now, updatedAt: now }
        : s
    ));
    set({ setups: next });
  },

  clearResolved: () => {
    const next = persist(get().setups.filter(s => !isTerminal(s.status)));
    set({ setups: next });
  },

  clearAll: () => {
    const next = persist([]);
    set({ setups: next });
  },

  updateFromMarket: (ctx) => {
    const cur = get().setups;
    let changed = false;
    const next = cur.map(s => {
      const r = resolveSetup(s, ctx);
      if (r !== s) changed = true;
      return r;
    });
    if (changed) set({ setups: persist(next) });
  },
}));

// ── Stat aggregation (Live vs Model/Sample kept strictly apart) ────────────────
export interface TrackStats {
  total: number;
  active: number;
  resolved: number;
  wins: number;
  losses: number;
  winRate: number | null;   // null when nothing resolved
  avgReturnPct: number | null;
}

const isWin = (s: TrackedSetup) =>
  s.status === 'RESOLVED_WIN' || (s.status === 'EXPIRED' && (s.finalReturnPct ?? 0) > 0);
const isLoss = (s: TrackedSetup) =>
  s.status === 'RESOLVED_LOSS' || s.status === 'INVALIDATED' || (s.status === 'EXPIRED' && (s.finalReturnPct ?? 0) <= 0);

export function computeStats(setups: TrackedSetup[]): TrackStats {
  const active = setups.filter(s => s.status === 'TRACKED' || s.status === 'ACTIVE').length;
  const resolvedList = setups.filter(s => isTerminal(s.status) && s.status !== 'CANCELLED');
  const wins = resolvedList.filter(isWin).length;
  const losses = resolvedList.filter(isLoss).length;
  const resolved = resolvedList.length;
  const returns = resolvedList.map(s => s.finalReturnPct ?? 0);
  return {
    total: setups.filter(s => s.status !== 'CANCELLED').length,
    active,
    resolved,
    wins,
    losses,
    winRate: resolved > 0 ? Math.round((wins / resolved) * 100) : null,
    avgReturnPct: returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : null,
  };
}

/** Live tracks vs model/sample tracks — never mixed in a single win-rate. */
export function splitByMode(setups: TrackedSetup[]): { live: TrackedSetup[]; modelSample: TrackedSetup[] } {
  const live = setups.filter(s => s.dataMode === 'live' || s.dataMode === 'delayed');
  const modelSample = setups.filter(s => s.dataMode === 'model' || s.dataMode === 'sample');
  return { live, modelSample };
}

/** Short human label for a status chip. */
export const STATUS_LABEL: Record<TrackStatus, string> = {
  REVIEWED: 'Reviewed',
  TRACKED: 'Tracked',
  ACTIVE: 'Active',
  INVALIDATED: 'Invalidated',
  RESOLVED_WIN: 'Win',
  RESOLVED_LOSS: 'Loss',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
};

/** The "SAMPLE TRACK" / "MODEL TRACK" provenance label for a tracked row. */
export function trackModeLabel(mode: TrackDataMode): string {
  switch (mode) {
    case 'live': return 'LIVE TRACK';
    case 'delayed': return 'DELAYED TRACK';
    case 'model': return 'MODEL TRACK';
    case 'sample': return 'SAMPLE TRACK';
  }
}

import { ArrowUpRight, TrendingUp, TrendingDown, ShieldCheck, Crosshair, CheckCircle2, Droplet, AlertTriangle } from 'lucide-react';
import { ASSET_LIST } from '../../data';
import { useContractStore } from '../../lib/store';
import { useTrackingStore, setupKey, isTerminal } from '../../lib/trackedSetups';
import { DataStateBadge } from '../ui/DataStateBadge';
import { toast } from '../ui/toast';

/**
 * Scanner setup-queue primitives for the redesigned SkyVision scanner.
 *
 * The old page ranked setups as small grouped tiles. The redesign makes the queue the core:
 * larger horizontal rows the eye can scan top-down (strongest elevated), and a right-hand
 * inspector that answers "why is THIS contract selected, is it liquid, what invalidates it,
 * what do I click next" — the five 10-second questions from the directive. Terminal aesthetic
 * kept; only the hierarchy changed. All figures are the scanner's SAMPLE model data, badged
 * as such — nothing is presented as a live scan.
 */

export interface ScannerContract {
  id: string;
  ticker: string;
  strike: number;
  isCall: boolean;
  health: number;
  expectedMove: string; // '+42.5%'
  action: string;
  narrative: string;
  shelf: string;
  price: number;
  bid: number;
  ask: number;
  delta?: number;
  theta?: number;
  t1?: number;
  p1?: number;
}

export interface DerivedSetup {
  c: ScannerContract;
  side: 'C' | 'P';
  direction: 'BULLISH' | 'BEARISH';
  label: string;             // "SPX 5520C"
  premium: number;
  fairValue: number;
  fairGapPct: number;        // (fair − premium) / premium
  spread: number;
  spreadPct: number;
  liquidity: 'Tight' | 'Fair' | 'Wide';
  expectedMovePct: number;
  invalidation: number;
  dealerSupport: string;
  conviction: 'High conviction' | 'Setup candidate' | 'Speculative';
}

const SHELF_SUPPORT: Record<string, string> = {
  conviction: 'Dealer buy-wall support',
  whale: 'Institutional block sweep',
  mispriced: 'Model/market price gap',
  invalidation: 'Put-wall rebound',
  improved: 'Accelerating volume sweep',
};
const SHELF_FAIR_MULT: Record<string, number> = {
  mispriced: 1.4, whale: 1.22, conviction: 1.12, improved: 1.1, invalidation: 1.08,
};

/** Turn a raw scanner contract into the display fields the row + inspector both need. */
export function deriveSetup(c: ScannerContract): DerivedSetup {
  const side: 'C' | 'P' = c.isCall ? 'C' : 'P';
  const mid = c.bid > 0 && c.ask > 0 ? (c.bid + c.ask) / 2 : c.price;
  const spread = Math.max(0, (c.ask || c.price) - (c.bid || c.price));
  const spreadPct = mid > 0 ? spread / mid : 0;
  const liquidity = spreadPct < 0.05 ? 'Tight' : spreadPct < 0.12 ? 'Fair' : 'Wide';
  const fairValue = c.price * (SHELF_FAIR_MULT[c.shelf] ?? 1.1);
  const expectedMovePct = Math.abs(parseFloat(c.expectedMove.replace(/[^0-9.\-]/g, ''))) || 0;
  // No live dealer flip in the sample set — derive a defined invalidation just past the strike
  // (a call dies below it, a put above), so every row carries a concrete risk line.
  const invalidation = c.isCall ? Math.round(c.strike * 0.992) : Math.round(c.strike * 1.008);
  const conviction = c.health >= 90 ? 'High conviction' : c.health >= 78 ? 'Setup candidate' : 'Speculative';
  return {
    c, side, direction: c.isCall ? 'BULLISH' : 'BEARISH',
    label: `${c.ticker} ${c.strike}${side}`,
    premium: c.price, fairValue, fairGapPct: c.price > 0 ? (fairValue - c.price) / c.price : 0,
    spread, spreadPct, liquidity, expectedMovePct, invalidation,
    dealerSupport: SHELF_SUPPORT[c.shelf] ?? 'Order-flow momentum', conviction,
  };
}

const liqTone = (l: DerivedSetup['liquidity']) =>
  l === 'Tight' ? 'text-[var(--success)]' : l === 'Wide' ? 'text-[var(--danger)]' : 'text-[var(--warning)]';

function ScoreDot({ score }: { score: number }) {
  const tone = score >= 90 ? 'var(--success)' : score >= 78 ? 'var(--info)' : 'var(--warning)';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: tone }} aria-hidden="true" />
      <span className="font-mono font-black tabular-nums text-[13px]" style={{ color: tone }}>{score}</span>
    </span>
  );
}

// ── Row ─────────────────────────────────────────────────────────────────────
export function SetupRow({ s, selected, elevated, onSelect, onReview }: {
  s: DerivedSetup; selected: boolean; elevated?: boolean; onSelect: () => void; onReview: () => void;
}) {
  const DirIcon = s.direction === 'BULLISH' ? TrendingUp : TrendingDown;
  const dirColor = s.direction === 'BULLISH' ? 'text-[var(--success)]' : 'text-[var(--danger)]';
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      aria-pressed={selected}
      aria-label={`${s.label} setup, score ${s.c.health}`}
      className={`group rounded-xl border p-3 text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-color)] ${
        selected
          ? 'border-[var(--accent-color)]/60 bg-[var(--surface-3)]'
          : elevated
            ? 'border-[var(--success)]/30 bg-[var(--success)]/[0.04] hover:border-[var(--success)]/50'
            : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]'
      }`}
    >
      {elevated && (
        <div className="mb-2 flex items-center gap-1.5">
          <span className="text-[8px] font-black uppercase tracking-widest text-[var(--success)]">Top Ranked Setup</span>
          <span className="h-px flex-1 bg-[var(--success)]/20" />
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        {/* identity */}
        <div className="flex items-center gap-2.5 min-w-0">
          <DirIcon className={`w-4 h-4 shrink-0 ${dirColor}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-black text-[14px] text-[var(--text-primary)] truncate">{s.label}</span>
              <span className={`text-[9px] font-bold uppercase tracking-widest ${dirColor}`}>{s.direction}</span>
            </div>
            <span className="block text-[9px] uppercase tracking-widest text-[var(--text-tertiary)] truncate">{s.dealerSupport}</span>
          </div>
        </div>
        {/* score + review */}
        <div className="flex items-center gap-3 shrink-0">
          <ScoreDot score={s.c.health} />
          <button
            onClick={(e) => { e.stopPropagation(); onReview(); }}
            aria-label={`Review ${s.label} in detail`}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-color)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-color)]"
          >
            Review<ArrowUpRight className="w-3 h-3" />
          </button>
        </div>
      </div>
      {/* metrics strip */}
      <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-5 gap-x-3 gap-y-1.5 border-t border-[var(--border)] pt-2.5 text-[10px]">
        <Metric label="Premium" value={`$${s.premium.toFixed(2)}`} />
        <Metric label="Fair value" value={`$${s.fairValue.toFixed(2)}`} tone={s.fairGapPct > 0.05 ? 'text-[var(--success)]' : undefined} />
        <Metric label="Exp. move" value={`±${s.expectedMovePct.toFixed(0)}%`} tone="text-[var(--info)]" />
        <Metric label="Liquidity" value={`${s.liquidity} · ${(s.spreadPct * 100).toFixed(1)}%`} tone={liqTone(s.liquidity)} />
        <Metric label="Invalidation" value={`${s.side === 'C' ? '<' : '>'} ${s.invalidation.toLocaleString()}`} tone="text-[var(--danger)]" />
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-[8px] uppercase tracking-widest text-[var(--text-tertiary)]">{label}</span>
      <span className={`block text-[11px] font-mono font-black tabular-nums truncate ${tone ?? 'text-[var(--text-primary)]'}`}>{value}</span>
    </div>
  );
}

// ── Inspector (right rail) ─────────────────────────────────────────────────────
function InspectorStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5">
      <span className="block text-[8px] uppercase tracking-widest text-[var(--text-tertiary)]">{label}</span>
      <span className={`block font-mono font-black tabular-nums text-[12px] ${tone ?? 'text-[var(--text-primary)]'}`}>{value}</span>
    </div>
  );
}

export function SetupInspector({ s, onReview }: { s: DerivedSetup | null; onReview: (st: DerivedSetup) => void }) {
  const trackingSetups = useTrackingStore(state => state.setups);
  const track = useTrackingStore(state => state.track);

  if (!s) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-center">
        <Crosshair className="mx-auto mb-2 h-5 w-5 text-[var(--text-tertiary)]" aria-hidden="true" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Select a setup</span>
        <p className="mt-1 text-[9px] text-[var(--text-tertiary)]">Pick a row to inspect why it ranked, its risk, and what to do next.</p>
      </div>
    );
  }

  const thisKey = setupKey({ ticker: s.c.ticker, strike: s.c.strike, optionType: s.side, kind: 'contract' });
  const tracked = trackingSetups.some(t => !isTerminal(t.status) && setupKey(t) === thisKey);
  const DirIcon = s.direction === 'BULLISH' ? TrendingUp : TrendingDown;
  const dirColor = s.direction === 'BULLISH' ? 'text-[var(--success)]' : 'text-[var(--danger)]';

  const handleTrack = () => {
    const asset = ASSET_LIST.find(a => a.ticker === s.c.ticker);
    const spot = asset?.defaultPrice ?? s.c.strike;
    const res = track({
      source: 'skyvision', kind: 'contract', dataMode: 'sample',
      ticker: s.c.ticker, contract: s.label, direction: s.direction, strike: s.c.strike,
      expiry: '0DTE', optionType: s.side, setupScore: s.c.health, confidence: s.c.health,
      premiumAtTrack: s.premium, spotAtTrack: spot, fairValue: s.fairValue,
      expectedMovePct: s.expectedMovePct, invalidationLevel: s.invalidation,
      dealerReason: s.dealerSupport, volatilityReason: `Expected move ±${s.expectedMovePct.toFixed(0)}%`,
      liquidityGrade: s.liquidity, entryDelta: s.c.delta, entryThetaPerDay: s.c.theta, dteDays: 0,
    }, Date.now());
    toast[res.duplicate ? 'info' : 'success'](res.duplicate ? 'Already tracking this setup' : 'Setup tracked', {
      description: res.duplicate ? 'It’s in Trade History (Sample track).' : `${s.label} · Sample track · in Trade History`,
    });
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 lg:sticky lg:top-2">
      <div className="flex items-start justify-between gap-2 border-b border-[var(--border)] pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <DirIcon className={`w-5 h-5 shrink-0 ${dirColor}`} />
          <div className="min-w-0">
            <span className="block font-black text-[20px] leading-none text-[var(--text-primary)] truncate">{s.label}</span>
            <span className={`mt-1 block text-[9px] font-black uppercase tracking-widest ${dirColor}`}>{s.direction} · {s.conviction}</span>
          </div>
        </div>
        <DataStateBadge state="sample" title="Demo data. Live scan requires a connected market feed." className="shrink-0" />
      </div>

      {/* headline stats */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <InspectorStat label="Score" value={String(s.c.health)} tone={s.c.health >= 90 ? 'text-[var(--success)]' : 'text-[var(--info)]'} />
        <InspectorStat label="Confidence" value={`${s.c.health}%`} />
        <InspectorStat label="Conviction" value={s.conviction === 'High conviction' ? 'High' : s.conviction === 'Setup candidate' ? 'Med' : 'Spec'} />
        <InspectorStat label="Premium" value={`$${s.premium.toFixed(2)}`} />
        <InspectorStat label="Fair value" value={`$${s.fairValue.toFixed(2)}`} tone={s.fairGapPct > 0.05 ? 'text-[var(--success)]' : undefined} />
        <InspectorStat label="Exp. move" value={`±${s.expectedMovePct.toFixed(0)}%`} tone="text-[var(--info)]" />
      </div>

      {/* reason */}
      <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
        <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-[var(--text-tertiary)]"><ShieldCheck className="w-3 h-3 text-[var(--success)]" />Why this ranked</span>
        <p className="mt-1 text-[10px] leading-relaxed text-[var(--text-secondary)]">{s.c.narrative}</p>
      </div>

      {/* liquidity + risk */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
          <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-[var(--text-tertiary)]"><Droplet className="w-3 h-3" />Liquidity</span>
          <span className={`mt-1 block font-mono font-black text-[12px] ${liqTone(s.liquidity)}`}>{s.liquidity}</span>
          <span className="block text-[9px] text-[var(--text-tertiary)]">{(s.spreadPct * 100).toFixed(1)}% spread</span>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
          <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-[var(--text-tertiary)]"><AlertTriangle className="w-3 h-3 text-[var(--danger)]" />Invalidation</span>
          <span className="mt-1 block font-mono font-black text-[12px] text-[var(--danger)]">{s.side === 'C' ? 'Below' : 'Above'} {s.invalidation.toLocaleString()}</span>
          <span className="block text-[9px] text-[var(--text-tertiary)]">{s.dealerSupport}</span>
        </div>
      </div>

      {/* actions */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => onReview(s)}
          aria-label={`Review ${s.label} in detail`}
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)] transition-colors hover:border-[var(--accent-color)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-color)]"
        >
          Review Setup<ArrowUpRight className="w-3 h-3" />
        </button>
        {tracked ? (
          <button
            onClick={() => useContractStore.getState().setActiveTab('auditor', true)}
            aria-label="Tracked — open Trade History"
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[var(--success)]/50 bg-[var(--success)]/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--success)] transition-colors hover:border-[var(--success)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--success)]"
          >
            <CheckCircle2 className="w-3 h-3" />Tracking
          </button>
        ) : (
          <button
            onClick={handleTrack}
            aria-label={`Track ${s.label} in Trade History`}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[var(--success)]/30 bg-[var(--success)]/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--success)] transition-colors hover:border-[var(--success)]/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--success)]"
          >
            Track Setup<span aria-hidden="true">+</span>
          </button>
        )}
      </div>
    </div>
  );
}

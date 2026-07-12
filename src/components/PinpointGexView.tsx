/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PINPOINT GEX — the consolidated dealer-positioning workspace, recomposed as a
 * single command deck. One command bar carries the page identity and the
 * Exposure & Walls / Hedging Profile / Ranked Targets sub-switch. The exposure
 * deck itself now composes directly here:
 *
 *   1. KPI strip — the six aggregate reads (Net GEX/DEX/VEX, spot, EM, control)
 *   2. HERO — the Dealer Positioning Map, full-width and tall, flanked by a slim
 *      right rail of wall/pin level callouts, dealer-bias context and the
 *      positioning-insight bullets
 *   3. EXPOSURE MATRIX — a full-width dense data sheet whose column toggles
 *      (GEX/DEX/VEX), expiry readout and CSV export are merged into one toolbar
 *      row on the panel header
 *   4. A hairline status footer
 *
 * Every figure is computed from the live server GEX profile
 * (serverState.gex_profile) — the exact feed DealerFlowView consumes. Nothing is
 * fabricated: a missing profile renders the honest pending deck, and any absent
 * level shows "—". The Live Terminal remains a separate standalone tab.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useContractStore } from '../lib/store';
import { ToggleGroup } from './ui/ToggleGroup';
import { DealerFlowView } from './DealerFlowView';
import { TerminalPanel } from './ui/terminal/TerminalPanel';
import { MetricStrip, type Metric, type MetricTone } from './ui/terminal/MetricStrip';
import { DealerPositioningMap } from './pinpoint/DealerPositioningMap';
import { Download } from 'lucide-react';

// ────────────────────────────────────────────────────────────────────────────
// Sub-view switching (unchanged wiring — pinpoint:<sub> deep-link intents)
// ────────────────────────────────────────────────────────────────────────────

type PinpointSub = 'exposure' | 'profile' | 'targets';

const SUB_OPTIONS: { value: PinpointSub; label: string }[] = [
  { value: 'exposure', label: 'Exposure & Walls' },
  { value: 'profile', label: 'Hedging Profile' },
  { value: 'targets', label: 'Ranked Targets' },
];

const SUB_DESCRIPTOR: Record<PinpointSub, string> = {
  exposure: 'Dealer positioning map · exposure matrix · walls & pin',
  profile: 'Net-gamma map · pressure matrix · order flow · key levels',
  targets: 'Ranked intraday targets from the live dealer profile',
};

export default function PinpointGexView() {
  const [sub, setSub] = useState<PinpointSub>('exposure');

  // Deep-link from the sidebar flyout: a `pinpoint:<sub>` intent selects the tab.
  const subTabIntent = useContractStore((s) => s.subTabIntent);
  const setSubTabIntent = useContractStore((s) => s.setSubTabIntent);
  useEffect(() => {
    if (!subTabIntent?.startsWith('pinpoint:')) return;
    const next = subTabIntent.split(':')[1] as PinpointSub;
    if (SUB_OPTIONS.some((o) => o.value === next)) setSub(next);
    setSubTabIntent(null);
  }, [subTabIntent, setSubTabIntent]);

  return (
    <div className="w-full min-w-0 space-y-[var(--gap)] font-mono text-[var(--text-primary)]">
      {/* ── COMMAND BAR — page identity + sub-view switch in one hairline row ── */}
      <div className="slayer-panel flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2">
        <div className="min-w-0">
          <div className="slayer-title">Pinpoint GEX</div>
          <div className="truncate text-[10px] tracking-wide text-[var(--text-muted)]">
            {SUB_DESCRIPTOR[sub]}
          </div>
        </div>
        <ToggleGroup<PinpointSub>
          ariaLabel="Pinpoint view"
          size="sm"
          value={sub}
          onChange={setSub}
          options={SUB_OPTIONS}
        />
      </div>

      {sub === 'exposure' && <ExposureDeck />}
      {sub === 'profile' && <DealerFlowView forcedView="profile" showToggle={false} />}
      {sub === 'targets' && <DealerFlowView forcedView="targets" showToggle={false} />}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Formatting helpers (compact $ magnitudes, tabular-friendly)
// ────────────────────────────────────────────────────────────────────────────

/** Compact magnitude: 1.3B, 212M, 4.1K, +70. `signed` forces a leading + on positives. */
function fmtCompact(v: number | null | undefined, signed = false): string {
  if (v == null || !isFinite(v)) return '—';
  const sign = v < 0 ? '-' : signed ? '+' : '';
  const a = Math.abs(v);
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(a / 1e9 >= 100 ? 0 : 2)}B`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(a / 1e6 >= 100 ? 0 : 1)}M`;
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(a / 1e3 >= 100 ? 0 : 1)}K`;
  return `${sign}${a.toFixed(0)}`;
}

/** Bare magnitude (no sign — colour encodes direction): 1.3B, 212M, 4K, 70. */
function fmtMag(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return `${(a / 1e9).toFixed(a / 1e9 >= 100 ? 0 : 1)}B`;
  if (a >= 1e6) return `${(a / 1e6).toFixed(0)}M`;
  if (a >= 1e3) return `${(a / 1e3).toFixed(0)}K`;
  return `${a.toFixed(0)}`;
}

/** Signed big-number in billions: "-12.86B" / "+3.40B". */
function fmtBnSigned(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '+';
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(1)}M`;
  return `${sign}${a.toFixed(0)}`;
}

/** Level price with thousands separators, no decimals. */
function fmtLevel(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—';
  return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** Signed percent, one decimal. */
function fmtPct(v: number | null | undefined, signed = true): string {
  if (v == null || !isFinite(v)) return '—';
  const sign = signed && v > 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

// Brand colours used for inline styles (matrix cells / rail markers). Color = data.
const SLAYER_RED = 'var(--slayer-red)'; // #980404 — deepest put/risk red (bars)
const CALL_STEEL = 'var(--call)'; // steel — calls
const NEG_INK = 'var(--negative-ink)';
const POS_INK = 'var(--positive-ink)';

// Insight bullet marker colour by tone — the data hue, used only as a 4px dot so
// the chrome stays neutral.
const toneDot: Record<MetricTone, string> = {
  neutral: 'var(--text-muted)',
  positive: 'var(--positive-ink)',
  negative: 'var(--negative-ink)',
  warning: 'var(--warning)',
  call: 'var(--call)',
  pin: 'var(--pin)',
};

// ────────────────────────────────────────────────────────────────────────────
// Small presentational atoms
// ────────────────────────────────────────────────────────────────────────────

/** A single greek cell of the data sheet: right-aligned tabular number over a
 *  faint magnitude-scaled heat wash, with a thin 2px inline magnitude bar beneath
 *  the number whose width encodes |value| as a share of the column max — the
 *  per-cell mini-bar treatment from the reference sheet. Bar colour is the data
 *  hue: put → red, call → blue, net → green/red by sign. */
function MatrixCell({
  value,
  max,
  side,
}: {
  value: number | null | undefined;
  max: number;
  side: 'put' | 'call' | 'net';
}) {
  const has = value != null && isFinite(value);
  const v = has ? (value as number) : 0;
  const pct = max > 0 ? Math.min(100, (Math.abs(v) / max) * 100) : 0;
  // Numbers: puts readable red, calls steel, net by sign. Wash: puts deep brand
  // red, calls steel, net by sign. Bar: solid data hue (put=red, call=blue, net
  // green≥0 / red<0), flat fill — no gradient/glow.
  const numColor = side === 'put' ? NEG_INK : side === 'call' ? CALL_STEEL : v < 0 ? NEG_INK : POS_INK;
  const washColor = side === 'put' ? SLAYER_RED : side === 'call' ? CALL_STEEL : v < 0 ? NEG_INK : POS_INK;
  const barColor = side === 'put' ? NEG_INK : side === 'call' ? CALL_STEEL : v >= 0 ? POS_INK : NEG_INK;
  const tint = has && pct > 0 ? `color-mix(in srgb, ${washColor} ${Math.round(pct * 0.14)}%, transparent)` : undefined;
  return (
    <div className="relative flex h-[19px] flex-col justify-center overflow-hidden px-1" style={{ background: tint }}>
      <span
        className="slayer-num relative z-10 block text-right text-[9.5px] font-semibold leading-none"
        style={{ color: has ? numColor : 'var(--text-faint)' }}
      >
        {fmtMag(has ? v : null)}
      </span>
      {has && pct > 0 ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[1.5px] right-1 h-[2px]"
          style={{ width: `calc(${Math.max(6, pct)}% - 0px)`, maxWidth: 'calc(100% - 0.5rem)', background: barColor, opacity: 0.85 }}
        />
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// EXPOSURE DECK — the recomposed Exposure & Walls surface
// ────────────────────────────────────────────────────────────────────────────

function ExposureDeck() {
  const selectedAsset = useContractStore((s) => s.selectedAsset);

  // Gate the streamed server state to the asset currently in view so switching
  // tickers can't briefly paint the previous ticker's dealer data — the exact
  // pattern DealerFlowView uses.
  const rawServerState = useContractStore((s) => s.serverState);
  const serverState = useMemo(() => {
    if (!rawServerState) return null;
    const ticker = rawServerState.contract?.replace('-', ' ').split(' ')[0];
    if (ticker !== selectedAsset.ticker) return null;
    return rawServerState;
  }, [rawServerState, selectedAsset.ticker]);

  const profile: any = serverState?.gex_profile;
  const gauge: any = serverState?.dealer_flow;

  // Real values (guarded — any absent level renders "—").
  const spot: number | undefined = profile?.spot;
  const netGex: number | undefined = profile?.netGex;
  const netDex: number | undefined = profile?.netDex;
  const netVex: number | undefined = profile?.netVex;
  const callWall: number | undefined = profile?.callWall;
  const putWall: number | undefined = profile?.putWall;
  const magnet: number | undefined = profile?.magnet; // pin level
  const emPct: number | undefined = profile?.expectedMovePct; // fraction

  // Live frame-over-frame trend of the net-gamma figure (a real trend of the
  // streamed number, not a fabricated label). Updates only past a 1% threshold
  // so it doesn't flicker on tick noise.
  const prevNetGexRef = useRef<number | null>(null);
  const [netGexTrend, setNetGexTrend] = useState<string>('—');

  // Exposure-matrix column-group visibility — real toggles living on the sheet's
  // header toolbar so a trader can focus on a single greek. At least one group
  // always stays on.
  const MATRIX_GROUPS = [
    // Three distinct hues so the greeks never collide: gamma = steel, delta =
    // dealer-cyan, vega = greek-purple.
    { key: 'gex' as const, label: 'GEX 1%', color: 'var(--call)' },
    { key: 'dex' as const, label: 'DEX 1σ', color: 'var(--dealer)' },
    { key: 'vex' as const, label: 'VEX 1%v', color: 'var(--greek)' },
  ];
  const [matrixGroups, setMatrixGroups] = useState<Set<'gex' | 'dex' | 'vex'>>(() => new Set(['gex', 'dex', 'vex']));
  const toggleMatrixGroup = (k: 'gex' | 'dex' | 'vex') =>
    setMatrixGroups((prev) => {
      const next = new Set(prev);
      if (next.has(k)) { if (next.size > 1) next.delete(k); } else next.add(k);
      return next;
    });
  const shownGroups = MATRIX_GROUPS.filter((g) => matrixGroups.has(g.key));
  const matrixGridStyle = { gridTemplateColumns: `64px repeat(${shownGroups.length * 3}, minmax(0, 1fr))` };
  useEffect(() => {
    if (netGex == null || !isFinite(netGex)) return;
    const prev = prevNetGexRef.current;
    if (prev != null) {
      const prevMag = Math.abs(prev);
      const curMag = Math.abs(netGex);
      const thresh = Math.max(1e7, prevMag * 0.01);
      if (curMag - prevMag > thresh) setNetGexTrend('Strengthening');
      else if (prevMag - curMag > thresh) setNetGexTrend('Weakening');
      else setNetGexTrend('Stable');
    }
    prevNetGexRef.current = netGex;
  }, [netGex]);

  // Spot session change, referenced to the oldest candle in the streamed window.
  const spotChange = useMemo(() => {
    if (spot == null) return null;
    const candles = serverState?.candles;
    if (!candles || candles.length === 0) return null;
    const ref = candles[0]?.open ?? candles[0]?.close;
    if (ref == null || !isFinite(ref) || ref === 0) return null;
    const abs = spot - ref;
    return { abs, pct: (abs / ref) * 100 };
  }, [spot, serverState?.candles]);

  // Market-control score + gamma regime, derived exactly like DealerFlowView's
  // headerAnalytics (net-gamma sign, pin tightness, expected-move calmness).
  const control = useMemo(() => {
    if (!profile || spot == null || netGex == null) return null;
    const positiveGamma = netGex >= 0;
    const pin = magnet ?? profile.gammaFlip;
    const em = (emPct ?? 0) || 0.01;
    let pinRiskPct: number | null = null;
    if (pin != null && spot) {
      const distFrac = Math.abs(spot - pin) / spot;
      pinRiskPct = Math.max(5, Math.min(95, Math.round(95 - (distFrac / em) * 65)));
    }
    const gammaPts = positiveGamma ? 55 : 25;
    const pinPts = pinRiskPct != null ? (pinRiskPct / 100) * 30 : 15;
    const calmPts = Math.max(0, 15 - Math.min(15, em * 100 * 3));
    const score = Math.max(0, Math.min(100, Math.round(gammaPts + pinPts + calmPts)));
    const word = score >= 66 ? 'Dealer-controlled' : score >= 45 ? 'Neutral' : 'Volatile';
    return { score, word, positiveGamma };
  }, [profile, spot, netGex, magnet, emPct]);

  // Dealer bias (real: LONG GAMMA / SHORT GAMMA) + a descriptor derived from the
  // real signed dealer-pressure index.
  const biasInfo = useMemo(() => {
    const bias: string | undefined = gauge?.bias;
    const pressure: number | undefined = gauge?.pressure;
    let tone: MetricTone = 'neutral';
    if (bias?.includes('SHORT')) tone = 'negative';
    else if (bias?.includes('LONG')) tone = 'positive';
    let sub = '—';
    if (pressure != null && isFinite(pressure)) {
      const mag = Math.abs(pressure);
      const word = mag > 60 ? 'Strongly' : mag > 25 ? 'Moderately' : 'Slightly';
      const dir = pressure > 0 ? 'positive' : pressure < 0 ? 'negative' : 'neutral';
      sub = `${word} ${dir}`;
    }
    return { label: bias ?? '—', tone, sub };
  }, [gauge]);

  // ── Strike windowing / interval ────────────────────────────────────────────
  const asc = useMemo(() => {
    const s: any[] = profile?.strikes ? [...profile.strikes] : [];
    return s.sort((a, b) => a.strike - b.strike);
  }, [profile]);

  const interval = useMemo(() => {
    if (asc.length < 2) return 0;
    let min = Infinity;
    for (let i = 1; i < asc.length; i++) {
      const d = asc[i].strike - asc[i - 1].strike;
      if (d > 0 && d < min) min = d;
    }
    return isFinite(min) ? min : 0;
  }, [asc]);

  // Net DEX / VEX aggregates — summed from the real per-strike values exactly the
  // way netGex aggregates (prefer the per-strike net field; fall back to call+put).
  // Returns null only when NO strike carries a finite value, so an empty/absent
  // metric honestly shows "—" rather than a fabricated 0.
  const netAgg = useMemo(() => {
    const sumBase = (base: 'Dex' | 'Vex') => {
      if (asc.length === 0) return null;
      let any = false;
      let sum = 0;
      for (const s of asc) {
        const nd = s[`net${base}`];
        let v: number | null = null;
        if (nd != null && isFinite(nd)) v = nd;
        else {
          const c = s[`call${base}`];
          const p = s[`put${base}`];
          if ((c != null && isFinite(c)) || (p != null && isFinite(p))) v = (c || 0) + (p || 0);
        }
        if (v != null) {
          any = true;
          sum += v;
        }
      }
      return any ? sum : null;
    };
    return { dex: sumBase('Dex'), vex: sumBase('Vex') };
  }, [asc]);
  // Prefer the server's top-level aggregate when present; else the per-strike sum.
  const netDexAgg = netDex != null && isFinite(netDex) ? netDex : netAgg.dex;
  const netVexAgg = netVex != null && isFinite(netVex) ? netVex : netAgg.vex;

  const centerIdx = useMemo(() => {
    if (asc.length === 0 || spot == null) return 0;
    let best = 0;
    let bd = Infinity;
    asc.forEach((r, i) => {
      const d = Math.abs(r.strike - spot);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }, [asc, spot]);

  // Matrix window: ±10 strikes around spot.
  const matrixRows = useMemo(() => {
    if (asc.length === 0) return [];
    const lo = Math.max(0, centerIdx - 10);
    const hi = Math.min(asc.length - 1, centerIdx + 10);
    return asc.slice(lo, hi + 1);
  }, [asc, centerIdx]);

  // Per-metric max magnitude across the visible matrix (heat scaling).
  const matrixMax = useMemo(() => {
    const g = (rows: any[], keys: string[]) =>
      Math.max(1, ...rows.flatMap((r) => keys.map((k) => Math.abs(r[k] ?? 0))));
    return {
      gex: g(matrixRows, ['putGex', 'callGex', 'netGex']),
      dex: g(matrixRows, ['putDex', 'callDex', 'netDex']),
      vex: g(matrixRows, ['putVex', 'callVex', 'netVex']),
    };
  }, [matrixRows]);

  // Descending render order (highest strike at top) + a SPOT divider inserted at
  // the spot position.
  const matrixDesc = useMemo(() => [...matrixRows].sort((a, b) => b.strike - a.strike), [matrixRows]);

  // ── CSV export of the visible matrix (real download) ────────────────────────
  const exportCsv = () => {
    const header = [
      'strike',
      'putGex',
      'callGex',
      'netGex',
      'putDex',
      'callDex',
      'netDex',
      'putVex',
      'callVex',
      'netVex',
    ];
    const num = (v: any) => (v == null || !isFinite(v) ? '' : String(v));
    const lines = [header.join(',')];
    for (const r of matrixDesc) {
      lines.push(
        [
          r.strike,
          num(r.putGex),
          num(r.callGex),
          num(r.netGex),
          num(r.putDex),
          num(r.callDex),
          num(r.netDex),
          num(r.putVex),
          num(r.callVex),
          num(r.netVex),
        ].join(',')
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedAsset.ticker}_exposure_matrix.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const nowLabel = useMemo(
    () => new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [serverState]
  );

  // The server ships ONE aggregated chain across all dates — there is nothing to
  // select, so render the expiry as an honest read-only label instead of a
  // dropdown that implies per-expiry filtering it can't perform.
  const expiry = useMemo(() => {
    if (profile?.expiryDate) {
      return profile.expiryLabel ? `${profile.expiryDate} · ${profile.expiryLabel}` : String(profile.expiryDate);
    }
    return `${selectedAsset.ticker} PIPELINE`;
  }, [selectedAsset.ticker, profile?.expiryDate, profile?.expiryLabel]);

  // Shared read-only chain descriptor — rendered on the hero header and inside
  // the matrix toolbar.
  const expiryReadout = (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Expiry</span>
      <span className="slayer-readout slayer-num cursor-default select-none">{expiry} · All Dates</span>
    </div>
  );

  // ── Honest pending state (mirrors DealerFlowView) — hero-first skeleton ─────
  if (!serverState || !profile || !profile.strikes || profile.strikes.length === 0) {
    return (
      <div
        className="w-full min-w-0 space-y-[var(--gap)]"
        id="pinpoint-data-pending"
        role="status"
        aria-busy="true"
        aria-label="Loading pinpoint exposure data"
      >
        {/* KPI strip skeleton — one hairline strip, mirrors the live MetricStrip. */}
        <div className="slayer-panel grid grid-cols-2 overflow-hidden md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`px-4 py-3 ${i !== 0 ? 'border-l border-[var(--border-subtle)]' : ''}`}>
              <div className="h-4 w-16 animate-pulse bg-[var(--bg-panel-soft)]" style={{ opacity: i === 0 ? 1 : 0.6 }} />
              <div className="mt-2 h-[7px] w-10 bg-[var(--bg-panel-soft)]" />
            </div>
          ))}
        </div>

        {/* HERO placeholder — the tall positioning map slot with the honest status line */}
        <div className="slayer-panel flex min-h-[320px] flex-col md:min-h-[420px]">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-3 py-2">
            <div className="min-w-0">
              <div className="slayer-title">Dealer Positioning Map</div>
              <div className="text-[10px] tracking-wide text-[var(--text-muted)]">Net gamma by strike</div>
            </div>
            <span className="flex shrink-0 items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--warning)]">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--warning)]" />
              Awaiting feed
            </span>
          </div>
          <div className="flex flex-1 items-center px-4 py-6">
            <p className="max-w-md text-[11px] leading-relaxed text-[var(--text-muted)]">
              No dealer profile — waiting on {selectedAsset.ticker} feed. Select any strike or option type to start the
              stream.
            </p>
          </div>
        </div>

        {/* Matrix sheet placeholder */}
        <div className="slayer-panel flex flex-col">
          <div className="border-b border-[var(--border-subtle)] px-3 py-2">
            <div className="slayer-title">Exposure Matrix</div>
            <div className="text-[10px] tracking-wide text-[var(--text-muted)]">Inventory &amp; sensitivity by strike</div>
          </div>
          <div className="flex flex-1 flex-col gap-px p-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-5 animate-pulse bg-[var(--bg-panel-soft)]"
                style={{ opacity: Math.max(0.2, 0.9 - i * 0.09) }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const loStrike = matrixRows[0]?.strike;
  const hiStrike = matrixRows[matrixRows.length - 1]?.strike;
  const emAbs = spot != null && emPct != null ? spot * emPct : null;

  // Friction-zone bounds (pin ↔ spot) — only when they differ.
  const frictionLo = spot != null && magnet != null ? Math.min(spot, magnet) : null;
  const frictionHi = spot != null && magnet != null ? Math.max(spot, magnet) : null;
  const hasFriction = frictionLo != null && frictionHi != null && Math.round(frictionLo) !== Math.round(frictionHi);

  // ── Synthesized reads for the Positioning Insight panel ─────────────────────
  // Strongest dealer-support strike: the heaviest |net-gamma| strike at/below
  // spot in the visible window — where dealers hold the most inventory to defend.
  let supportStrike: number | null = null;
  {
    let bestMag = 0;
    for (const r of matrixRows) {
      const ng = r.netGex;
      if (ng == null || !isFinite(ng)) continue;
      if (spot != null && r.strike > spot) continue;
      const mag = Math.abs(ng);
      if (mag > bestMag) { bestMag = mag; supportStrike = r.strike; }
    }
  }
  // Nearest listed strike beyond a level (fallback: one interval step).
  const nextAbove = (lvl: number | null | undefined): number | null => {
    if (lvl == null || !isFinite(lvl)) return null;
    const up = asc.filter((r) => r.strike > lvl).map((r) => r.strike);
    if (up.length) return Math.min(...up);
    return interval ? lvl + interval : null;
  };
  const nextBelow = (lvl: number | null | undefined): number | null => {
    if (lvl == null || !isFinite(lvl)) return null;
    const dn = asc.filter((r) => r.strike < lvl).map((r) => r.strike);
    if (dn.length) return Math.max(...dn);
    return interval ? lvl - interval : null;
  };
  const downTarget = putWall != null ? (magnet != null && magnet < putWall ? magnet : nextBelow(putWall)) : null;
  const upTarget = nextAbove(callWall);
  const frictionSpan = frictionLo != null && frictionHi != null ? Math.round(frictionHi - frictionLo) : null;

  // 4–5 SYNTHESIZED bullets: sign→behavior, friction-band state, deepest support,
  // and two directional what-ifs. Each interprets the levels — none merely echoes
  // a KPI figure — and any missing level degrades to a graceful sentence.
  const insights: { key: string; tone: MetricTone; text: string }[] = [
    {
      key: 'gamma',
      tone: control ? (control.positiveGamma ? 'positive' : 'negative') : 'neutral',
      text: control
        ? control.positiveGamma
          ? `Dealers are long gamma — they fade extensions, so dips get bought and rallies sold; ${netGexTrend.toLowerCase()} grip favors a compressing range.`
          : `Dealers are short gamma — hedging chases price, so momentum self-reinforces; ${netGexTrend.toLowerCase()} exposure argues trend over mean-reversion.`
        : 'Net-gamma regime indeterminate until the profile prints.',
    },
    {
      key: 'friction',
      tone: 'warning',
      text: hasFriction
        ? `Spot ${fmtLevel(spot)} sits ${spot != null && magnet != null && spot > magnet ? 'above' : 'below'} pin ${fmtLevel(magnet)} — a ${frictionSpan ?? '—'}-pt friction band that magnetizes drift back toward the pin on light momentum.`
        : magnet != null
          ? `Spot is pinned to the ${fmtLevel(magnet)} magnet — directional drift is neutralized until a wall gives way.`
          : 'No pin level resolved, so no friction band to lean on.',
    },
    {
      key: 'support',
      tone: 'neutral',
      text: supportStrike != null
        ? `Deepest dealer inventory builds at ${fmtLevel(supportStrike)} — the heaviest net-gamma strike at/below spot and the first real catch on a flush.`
        : 'No dominant inventory strike below spot in the visible window.',
    },
    {
      key: 'break-down',
      tone: 'negative',
      text: putWall != null
        ? `Break under ${fmtLevel(putWall)} (put wall) and support thins fast — next magnet lower is ${fmtLevel(downTarget)}.`
        : 'Put wall unresolved — downside pivot indeterminate.',
    },
    {
      key: 'break-up',
      tone: 'call',
      text: callWall != null
        ? `Break above ${fmtLevel(callWall)} (call wall) and short-gamma supply gives way — quick air pocket toward ${fmtLevel(upTarget)}.`
        : 'Call wall unresolved — upside pivot indeterminate.',
    },
  ];

  // Bottom summary — the level ladder the top strip omits (walls + pin) plus the
  // net aggregates, in the reference's compact 8-cell order.
  const summaryMetrics: Metric[] = [
    { label: 'Net GEX', value: fmtBnSigned(netGex), tone: netGex == null ? 'neutral' : netGex < 0 ? 'negative' : 'positive' },
    { label: 'Net DEX', value: fmtCompact(netDexAgg, true), tone: netDexAgg == null ? 'neutral' : netDexAgg < 0 ? 'negative' : 'positive' },
    { label: 'Net VEX', value: fmtCompact(netVexAgg, true), tone: netVexAgg == null ? 'neutral' : netVexAgg < 0 ? 'negative' : 'positive' },
    { label: 'Spot', value: fmtLevel(spot), tone: 'neutral' },
    { label: 'Put Wall', value: fmtLevel(putWall), tone: 'negative' },
    { label: 'Pin Level', value: fmtLevel(magnet), tone: 'pin' },
    { label: 'Call Wall', value: fmtLevel(callWall), tone: 'call' },
    { label: 'Dealer Bias', value: biasInfo.label, tone: biasInfo.tone },
  ];

  // KPI strip — the six aggregate reads. Wall/pin levels moved to the hero's
  // right-rail ladder; the net DEX/VEX aggregates absorbed the old standalone
  // "Aggregate Net Exposure" panel.
  const topMetrics: Metric[] = [
    {
      label: 'Net GEX',
      value: fmtBnSigned(netGex),
      sub: netGexTrend,
      tone: netGex == null ? 'neutral' : netGex < 0 ? 'negative' : 'positive',
      primary: true,
    },
    {
      label: 'Spot',
      value: fmtLevel(spot),
      sub: spotChange ? `${spotChange.abs >= 0 ? '+' : ''}${spotChange.abs.toFixed(2)} (${fmtPct(spotChange.pct)})` : '—',
      tone: spotChange ? (spotChange.abs >= 0 ? 'positive' : 'negative') : 'neutral',
      primary: true,
    },
    {
      label: 'Net DEX',
      value: fmtCompact(netDexAgg, true),
      sub: netDexAgg == null ? '—' : netDexAgg < 0 ? 'Downside tilt' : 'Upside tilt',
      tone: netDexAgg == null ? 'neutral' : netDexAgg < 0 ? 'negative' : 'positive',
    },
    {
      label: 'Net VEX',
      value: fmtCompact(netVexAgg, true),
      sub: netVexAgg == null ? '—' : netVexAgg < 0 ? 'Short vega' : 'Long vega',
      tone: netVexAgg == null ? 'neutral' : netVexAgg < 0 ? 'negative' : 'positive',
    },
    {
      label: 'Expected Move (1D)',
      value: emAbs != null ? `±${emAbs.toFixed(2)}` : '—',
      sub: emPct != null ? `±${(emPct * 100).toFixed(1)}%` : '—',
      tone: 'warning',
    },
    { label: 'Market Control', value: control ? `${control.score}/100` : '—', sub: control?.word ?? '—', tone: 'neutral' },
    // Dealer bias + gamma regime live here as aggregate reads — NOT in a
    // redundant side rail (the walls/pin they used to sit beside are labelled on
    // the map itself, so the old "Walls & Pin" rail + insight bullets were slop).
    { label: 'Dealer Bias', value: biasInfo.label, sub: biasInfo.sub, tone: biasInfo.tone },
    {
      label: 'Gamma Regime',
      value: control ? (control.positiveGamma ? 'LONG γ' : 'SHORT γ') : '—',
      sub: control ? (control.positiveGamma ? 'Dampens moves' : 'Amplifies moves') : '—',
      tone: control ? (control.positiveGamma ? 'positive' : 'negative') : 'neutral',
    },
  ];

  const rowTint = (isPin: boolean, isCall: boolean, isPut: boolean): string | undefined =>
    isPin ? 'rgba(44,104,123,0.16)' : isCall ? 'rgba(121,44,162,0.14)' : isPut ? 'rgba(152,4,4,0.16)' : undefined;

  return (
    <div className="w-full min-w-0 space-y-[var(--gap)]" id="pinpoint-exposure-view">
      {/* ─────────────── 1. KPI STRIP ─────────────── */}
      <MetricStrip metrics={topMetrics} columns={8} />

      {/* ─────────────── 2. TWO-PANEL GRID — MATRIX (L) · MAP (R) ─────────────── */}
      {/* Reference composition: a dense Exposure Matrix on the left (~48%) beside
          the Dealer Positioning Map on the right (~52%). On xl the row takes a
          fixed tall height and each panel scrolls internally; below xl it stacks
          to a single column and each panel takes its natural height. */}
      <div className="grid min-w-0 grid-cols-1 gap-[var(--gap)] xl:h-[calc(100vh-452px)] xl:min-h-[440px] xl:grid-cols-[minmax(0,48fr)_minmax(0,52fr)]">
      {/* ── EXPOSURE MATRIX — dense data sheet, scrolls inside its own panel ── */}
      <TerminalPanel
        title="Exposure Matrix"
        subtitle="Inventory & sensitivity by strike"
        className="min-w-0 xl:h-full"
        bodyClassName="flex min-h-0 flex-col gap-2"
        actions={
          /* One toolbar row: greek column toggles · expiry readout · CSV export. */
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Columns</span>
              {MATRIX_GROUPS.map((g) => {
                const on = matrixGroups.has(g.key);
                return (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => toggleMatrixGroup(g.key)}
                    aria-pressed={on}
                    title={on ? `Hide ${g.label} columns` : `Show ${g.label} columns`}
                    className={`rounded-[var(--radius-control)] border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] ${
                      on
                        ? 'border-[var(--border-mid)] bg-[var(--surface-2)]'
                        : 'border-[var(--border-subtle)] text-[var(--text-faint)] line-through decoration-[var(--text-faint)]/60'
                    }`}
                    style={on ? { color: g.color } : undefined}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>
            <span aria-hidden="true" className="hidden h-4 w-px bg-[var(--border-subtle)] sm:block" />
            {expiryReadout}
            <button
              type="button"
              onClick={exportCsv}
              aria-label="Export matrix as CSV"
              className="flex shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[#050505] p-1.5 text-[var(--text-secondary)] transition-colors hover:border-[var(--border-mid)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:border-[var(--border-strong)]"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          </div>
        }
      >
        {/* SHEET — scrolls vertically inside the panel (dense ladder) and
            horizontally on narrow widths so the page body never scrolls. */}
        <div className="slayer-scrollbar min-h-0 flex-1 overflow-x-auto overflow-y-auto border border-[var(--border-subtle)]">
          <div className="min-w-[520px] xl:min-w-0">
            {/* Group header */}
            <div
              className="grid items-end border-b border-[var(--border-subtle)] text-[9px] font-semibold uppercase tracking-[0.13em] text-[var(--text-muted)]"
              style={matrixGridStyle}
            >
              <div className="px-1.5 py-1.5">Strike</div>
              {shownGroups.map((g) => (
                <div key={g.key} className="col-span-3 border-l border-[var(--border-subtle)] py-1.5 text-center" style={{ color: g.color }}>
                  {g.label}
                </div>
              ))}
            </div>
            {/* Sub header */}
            <div
              className="grid border-b border-[var(--border-subtle)] text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--text-faint)]"
              style={matrixGridStyle}
            >
              <div className="px-1.5 py-1" />
              {shownGroups.map((g) => (
                <div key={g.key} className="col-span-3 grid grid-cols-3 border-l border-[var(--border-subtle)]">
                  <div className="px-1 py-1 text-right text-[var(--negative-ink)]/80">Put</div>
                  <div className="px-1 py-1 text-right text-[var(--call)]/90">Call</div>
                  <div className="px-1 py-1 text-right">Net</div>
                </div>
              ))}
            </div>

            {/* Rows (descending) with SPOT divider inserted */}
            {matrixDesc.map((r, i) => {
              const prev = matrixDesc[i - 1];
              // Insert the SPOT divider when we cross spot going down.
              const showSpotDivider =
                spot != null &&
                ((i === 0 && r.strike < spot) ||
                  (prev != null && prev.strike >= spot && r.strike < spot));
              const isPin = magnet != null && Math.abs(r.strike - magnet) < 1e-6;
              const isCallWall = callWall != null && Math.abs(r.strike - callWall) < 1e-6;
              const isPutWall = putWall != null && Math.abs(r.strike - putWall) < 1e-6;

              return (
                <div key={r.strike}>
                  {showSpotDivider && (
                    <div
                      className="grid border-y border-[var(--border-mid)]"
                      style={{ ...matrixGridStyle, background: 'rgba(248,248,255,0.06)' }}
                    >
                      <div className="px-1.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--text-primary)]">
                        Spot
                      </div>
                      <div
                        className="slayer-num flex items-center px-1.5 py-1 text-[10px] font-bold text-[var(--text-primary)]"
                        style={{ gridColumn: `span ${shownGroups.length * 3}` }}
                      >
                        {fmtLevel(spot)}
                      </div>
                    </div>
                  )}
                  <div
                    className="grid items-center border-b border-[var(--border-subtle)]"
                    style={{ ...matrixGridStyle, background: rowTint(isPin, isCallWall, isPutWall) }}
                  >
                    <div className="flex min-w-0 items-center gap-1 overflow-hidden px-1.5 py-0.5">
                      <span className="slayer-num text-[9.5px] font-bold text-[var(--text-secondary)]">
                        {fmtLevel(r.strike)}
                      </span>
                      {isPin && <span className="text-[6.5px] font-bold tracking-wide text-[var(--pin)]">PIN</span>}
                      {isCallWall && <span className="text-[6.5px] font-bold tracking-wide text-[var(--call)]">CW</span>}
                      {isPutWall && <span className="text-[6.5px] font-bold tracking-wide text-[var(--negative-ink)]">PW</span>}
                    </div>
                    {shownGroups.map((g) => {
                      const cells =
                        g.key === 'gex' ? ([r.putGex, r.callGex, r.netGex, matrixMax.gex] as const)
                        : g.key === 'dex' ? ([r.putDex, r.callDex, r.netDex, matrixMax.dex] as const)
                        : ([r.putVex, r.callVex, r.netVex, matrixMax.vex] as const);
                      return (
                        <div key={g.key} className="col-span-3 grid grid-cols-3 border-l border-[var(--border-subtle)]">
                          <MatrixCell value={cells[0]} max={cells[3]} side="put" />
                          <MatrixCell value={cells[1]} max={cells[3]} side="call" />
                          <MatrixCell value={cells[2]} max={cells[3]} side="net" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sheet footer — window + unit legend in one quiet line */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-1 text-[9px] tracking-wide text-[var(--text-muted)]">
          <span className="slayer-num truncate">
            Strikes {fmtLevel(loStrike)}–{fmtLevel(hiStrike)} · Interval {interval || '—'} · Expiry {expiry} · All Dates
          </span>
          <span className="flex flex-wrap gap-x-3">
            <span>GEX: $ per 1% move</span>
            <span>DEX: $ per 1σ spot move</span>
            <span>VEX: $ per 1% vol shift</span>
          </span>
        </div>
      </TerminalPanel>

      {/* ── DEALER POSITIONING MAP — same component + props, right column ── */}
      <div className="min-w-0 xl:h-full [&>section]:h-full">
        <DealerPositioningMap
          rows={matrixDesc.map((r) => ({ strike: r.strike, value: r.netGex ?? 0 }))}
          spot={spot ?? undefined}
          callWall={callWall ?? undefined}
          putWall={putWall ?? undefined}
          pinLevel={magnet ?? undefined}
          actions={expiryReadout}
          footer={
            hasFriction ? (
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--warning)]">
                Friction Zone {fmtLevel(frictionLo)}–{fmtLevel(frictionHi)}
              </span>
            ) : undefined
          }
        />
      </div>
      </div>

      {/* ─────────────── 3. BOTTOM SUMMARY STRIP + POSITIONING INSIGHT ─────────────── */}
      <div className="grid grid-cols-1 gap-[var(--gap)] xl:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
        <MetricStrip metrics={summaryMetrics} columns={8} className="self-start" />
        <TerminalPanel
          title="Positioning Insight"
          subtitle="Synthesized dealer read"
          className="min-w-0"
          bodyClassName="flex flex-col gap-1.5"
        >
          <ul className="flex flex-col gap-1.5">
            {insights.map((it) => (
              <li key={it.key} className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className="mt-[5px] h-1 w-1 shrink-0 rounded-full"
                  style={{ background: toneDot[it.tone] }}
                />
                <span className="text-[10.5px] leading-snug text-[var(--text-secondary)]">{it.text}</span>
              </li>
            ))}
          </ul>
        </TerminalPanel>
      </div>

      {/* ─────────────── 4. STATUS FOOTER ─────────────── */}
      <div className="slayer-panel flex flex-col items-center justify-between gap-1 px-3 py-2 text-[9px] tracking-wide text-[var(--text-muted)] sm:flex-row">
        <span>Disclaimer: For informational purposes only. Not investment advice.</span>
        <span className="slayer-num">Data as of {nowLabel}</span>
        <span className="font-bold tracking-[0.16em] text-[var(--text-secondary)]">REAL-SLAYER</span>
      </div>
    </div>
  );
}

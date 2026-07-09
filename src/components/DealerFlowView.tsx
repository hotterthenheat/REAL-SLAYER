/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DEALER FLOW — gamma exposure profile, dealer buying pressure, and the
 * Displacement Zones × Volatility Engine. Every figure on this page is
 * computed server-side from the live Tradier chain + real candles (or the
 * clearly-labeled deterministic model when offline).
 */

import { useMemo, useState, useEffect, lazy, Suspense } from 'react';
import { motion } from 'motion/react';
import { useContractStore } from '../lib/store';
import { ToggleGroup } from './ui/ToggleGroup';
import { IntradayTargetsView } from './IntradayTargetsView';
import PinpointTerminal from './PinpointTerminal';
import { DealerFlowMap } from './DealerFlowMap';
import { Popover } from './ui/Popover';
import { Sheet } from './ui/Sheet';
import { Badge } from './ui/Badge';
import { Switch } from './ui/Switch';
import { LiveValue } from './ui/LiveValue';
import { TerminalReadCard } from './TerminalReadCard';
import { PanelSkeleton } from './PanelSkeleton';
import { PinpointTrackButton } from './PinpointTrackButton';
import { DataStateBadge } from './ui/DataStateBadge';
import { TerminalPanel } from './ui/terminal/TerminalPanel';
import { type Metric } from './ui/terminal/MetricStrip';
import { DataTable, type DataColumn } from './ui/terminal/DataTable';
import { StatusBadge } from './ui/terminal/StatusBadge';
import {
  Waves,
  Layers,
  Zap,
  ShieldAlert,
  Target,
  Search,
  ChevronDown,
  Check,
  CalendarClock,
  Activity
} from 'lucide-react';
import { ASSET_LIST } from '../data';
import { fmtNum } from '../lib/format';
import type { TimeframeVal } from '../types';

// Row chrome for the expiry-ladder popover — a selected row glows accent, others hover.
const expiryRowCls = (active: boolean) =>
  `flex items-center justify-between gap-2 rounded-[7px] border px-2.5 py-2 text-left transition-colors cursor-pointer ${
    active
      ? 'bg-[var(--accent-color)]/10 border-[var(--accent-color)]/40'
      : 'border-transparent hover:bg-[var(--surface-3)]'
  }`;

// ── Slayer-terminal formatting atoms (presentation only — no data synthesis) ──
/** Level price with thousands separators, no decimals; "—" when absent. */
const fmtLevel = (v?: number | null) =>
  v == null || !isFinite(v) ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: 0 });
/** Bare compact magnitude (colour encodes sign elsewhere): 1.3B / 212M / 4.1K / 70. */
const fmtMag = (v?: number | null): string => {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return `${(a / 1e9).toFixed(a / 1e9 >= 100 ? 0 : 1)}B`;
  if (a >= 1e6) return `${(a / 1e6).toFixed(0)}M`;
  if (a >= 1e3) return `${(a / 1e3).toFixed(0)}K`;
  return a.toFixed(0);
};
/** HH:MM:SS stamp for the notes rail. */
const fmtNoteTime = (ts: number) =>
  new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Timeframes offered on the Dealer Flow chart header (all map to the real store timeframe). */
const CHART_TIMEFRAMES: TimeframeVal[] = ['1m', '5m', '15m', '1h', '1D'];

const NOTE_TONE_TEXT: Record<'neutral' | 'positive' | 'negative' | 'warning', string> = {
  neutral: 'text-[var(--text-secondary)]',
  positive: 'text-[var(--positive-ink)]',
  negative: 'text-[var(--negative-ink)]',
  warning: 'text-[var(--warning)]',
};

const LEVEL_TONE_COLOR: Record<string, string> = {
  call: 'var(--call)',
  negative: 'var(--negative-ink)',
  pin: 'var(--pin)',
  warning: 'var(--warning)',
  neutral: 'var(--text-primary)',
};
const fmtGreek = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1e9) {
    return `${v >= 0 ? '+' : '−'}$${(abs / 1e9).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}B`;
  }
  return `${v >= 0 ? '+' : '−'}$${(abs / 1e6).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
};

// Tone → text colour for the supporting-metric cells in the dealer-gamma header.
const SUPPORT_TONE_TEXT: Record<NonNullable<Metric['tone']>, string> = {
  neutral: 'text-[var(--text-primary)]',
  positive: 'text-[var(--positive-ink)]',
  negative: 'text-[var(--negative-ink)]',
  warning: 'text-[var(--warning)]',
  call: 'text-[var(--call)]',
  pin: 'text-[var(--pin)]',
};

function FeedChip({ feed }: { feed?: string }) {
  const live = feed === 'LIVE_TRADIER' || feed === 'LIVE_POLYGON';
  // Unified onto the canonical DataStateBadge (MODEL MODE now reads blue like everywhere else);
  // provider detail is preserved via the label override when a real feed is live.
  return <DataStateBadge state={live ? 'live' : 'model'} label={live ? (feed === 'LIVE_TRADIER' ? 'Live Tradier' : 'Live Polygon') : undefined} />;
}

// ----------------------------------------------------------------
// Exposure profile chart (strikegex-style horizontal bars for GEX/DEX/VEX)
// ----------------------------------------------------------------
function ExposureProfileChart({ profile, decimals, type }: { profile: any; decimals: number; type: 'gex' | 'vex' | 'dex' }) {
  const themeMode = useContractStore(s => s.themeMode);
  const isLight = themeMode === 'light';

  const rows = useMemo(() => {
    const strikes: any[] = profile?.strikes || [];
    const mapped = strikes.map(s => {
      let callValue = 0, putValue = 0, netValue = 0;
      if (type === 'gex') {
        callValue = s.callGex;
        putValue = s.putGex;
        netValue = s.netGex;
      } else if (type === 'dex') {
        callValue = s.callDex || 0;
        putValue = s.putDex || 0;
        netValue = s.netDex || 0;
      } else if (type === 'vex') {
        callValue = s.callVex || 0;
        putValue = s.putVex || 0;
        netValue = s.netVex || 0;
      }
      return {
        strike: s.strike,
        callValue,
        putValue,
        netValue,
        callOi: s.callOi,
        putOi: s.putOi,
        callVolume: s.callVolume,
        putVolume: s.putVolume
      };
    });

    // Render at most 21 strikes centered around spot for readability.
    if (mapped.length <= 21) return mapped;
    const sorted = [...mapped].sort((a, b) => a.strike - b.strike);
    let centerIdx = 0;
    let best = Infinity;
    sorted.forEach((r, i) => {
      const d = Math.abs(r.strike - profile.spot);
      if (d < best) {
        best = d;
        centerIdx = i;
      }
    });
    const lo = Math.max(0, centerIdx - 10);
    return sorted.slice(lo, lo + 21);
  }, [profile, type]);

  // NOTE: declared before the early return below so hook order stays stable
  // across renders (rows can transition between empty and populated).
  const spotLine = useMemo(() => {
    if (!profile?.spot || rows.length === 0) return null;
    const strikes = rows.map((r: any) => r.strike);
    const maxStrike = Math.max(...strikes);
    const minStrike = Math.min(...strikes);
    const strikeRange = maxStrike - minStrike;

    const clampedSpot = Math.max(minStrike, Math.min(maxStrike, profile.spot));
    const pct = strikeRange > 0 ? (maxStrike - clampedSpot) / strikeRange : 0.5;

    // Each row is h-6 (24px) + space-y-[3px] (3px) = 27px.
    // The header is roughly 23px high.
    // The center of the i-th row is at: 23px + 12px + i * 27px.
    const spotY = 23 + 12 + pct * (rows.length - 1) * 27;
    return { spotY };
  }, [rows, profile?.spot]);

  if (!rows || rows.length === 0) {
    return (
      <div className="text-center py-8 text-[var(--text-tertiary)] font-mono text-[11px]">
        Awaiting options chain data to calculate {type.toUpperCase()} profile...
      </div>
    );
  }

  const maxAbs = Math.max(...rows.map((r: any) => Math.max(Math.abs(r.callValue), Math.abs(r.putValue), Math.abs(r.netValue))), 1);
  const sortedDesc = [...rows].sort((a, b) => b.strike - a.strike);

  // Find the strike with max values for walls/pins dynamically for this exposure type
  const maxCallValStrike = rows.reduce((max, cur) => Math.abs(cur.callValue) > Math.abs(max.callValue) ? cur : max, rows[0])?.strike;
  const maxPutValStrike = rows.reduce((max, cur) => Math.abs(cur.putValue) > Math.abs(max.putValue) ? cur : max, rows[0])?.strike;

  const typeUpper = type.toUpperCase();
  const putColorStr = type === 'gex' ? 'rose' : type === 'dex' ? 'amber' : 'fuchsia';

  return (
    <div className="space-y-[3px] relative tabular-data">
      {/* Axis header */}
      <div className={`flex items-center text-[9px] font-semibold tracking-widest uppercase pb-1.5 border-b mb-1.5 ${
        isLight ? 'text-zinc-500 border-[var(--border)]' : 'text-zinc-600 border-[var(--border)]'
      }`}>
        <div className="w-[58px] sm:w-[72px] shrink-0">Strike</div>
        <div className="flex-1 flex">
          <div className={`flex-1 text-right pr-2 ${
            type === 'gex' ? 'text-[var(--danger)]/70' : type === 'dex' ? 'text-amber-400/70' : 'text-fuchsia-400/70'
          }`}>← Put {typeUpper}</div>
          <div className={`w-px ${isLight ? 'bg-[var(--border)]' : 'bg-[var(--border)]'}`} />
          <div className={`flex-1 pl-2 ${
            type === 'gex' ? 'text-[var(--success)]/70' : type === 'dex' ? 'text-sky-400/70' : 'text-indigo-400/70'
          }`}>Call {typeUpper} →</div>
        </div>
        <div className="w-[56px] sm:w-[64px] text-right shrink-0">Net</div>
      </div>

      {sortedDesc.map((r: any) => {
        const callW = Math.min(100, (Math.abs(r.callValue) / maxAbs) * 100);
        const putW = Math.min(100, (Math.abs(r.putValue) / maxAbs) * 100);

        // Highlight max strikes
        const isCallMax = r.strike === maxCallValStrike;
        const isPutMax = r.strike === maxPutValStrike;
        const isSpot = Math.abs(r.strike - profile.spot) < 0.001; // exact match check or close to spot
        
        // Find if spot is between this strike and next
        const idx = sortedDesc.findIndex(row => row.strike === r.strike);
        const nextRow = sortedDesc[idx + 1];
        const flipBetween = nextRow && profile.gammaFlip > nextRow.strike && profile.gammaFlip <= r.strike;

        return (
          <div key={r.strike} className={`flex items-center text-[9.5px] tabular-nums tracking-widest h-6 border-b border-[var(--border)] ${
            isSpot ? (isLight ? 'bg-black' : 'bg-white/[0.03]') : ''
          }`}>
            {/* Strike column */}
            <div className={`w-[58px] sm:w-[72px] shrink-0 text-[10.5px] font-semibold tracking-[0.06em] font-mono pl-1 ${
              isSpot ? (isLight ? 'text-zinc-900 font-bold' : 'text-[#E5E5E5]') : isLight ? 'text-zinc-550' : 'text-zinc-400'
            }`}>
              {fmtNum(r.strike)}
              {isCallMax && (() => {
                const isFailing = r.strike < profile.spot;
                const isTesting = Math.abs(r.strike - profile.spot) / profile.spot < 0.005;
                const status = isFailing ? 'FAILING' : isTesting ? 'TESTING' : 'HOLDING';
                const sColor = isFailing ? 'text-[var(--danger)] bg-rose-500/10 border-rose-500/30' : isTesting ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' : 'text-[var(--success)] bg-[var(--success)]/10 border-black';
                return <span className={`ml-1.5 px-1 py-[1px] rounded-[2px] text-[9px] align-middle font-semibold border tracking-widest ${sColor}`}>{status}</span>;
              })()}
              {isPutMax && (() => {
                const isFailing = r.strike > profile.spot;
                const isTesting = Math.abs(r.strike - profile.spot) / profile.spot < 0.005;
                const status = isFailing ? 'FAILING' : isTesting ? 'TESTING' : 'HOLDING';
                const sColor = isFailing ? 'text-[var(--danger)] bg-rose-500/10 border-rose-500/30' : isTesting ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' : 'text-sky-400 bg-sky-500/10 border-sky-500/30';
                return <span className={`ml-1.5 px-1 py-[1px] rounded-[2px] text-[9px] align-middle font-semibold border tracking-widest ${sColor}`}>{status}</span>;
              })()}
            </div>

            <div className="flex-1 flex items-center h-full">
              {/* Put side */}
              <div
                tabIndex={0}
                role="button"
                aria-label={`Strike ${fmtNum(r.strike)} put — ${typeUpper} ${fmtGreek(r.putValue)}, Open Interest ${(r.putOi ?? 0).toLocaleString()}, Volume ${(r.putVolume ?? 0).toLocaleString()}`}
                className="relative group/put flex-1 flex justify-end items-center h-full pr-[1px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)]"
              >
                <div
                  className={`h-[11px] rounded-l-[2px] ${
                    isPutMax
                      ? type === 'gex' ? 'bg-rose-500' : type === 'dex' ? 'bg-amber-500' : 'bg-fuchsia-500'
                      : type === 'gex' ? 'bg-rose-500/55' : type === 'dex' ? 'bg-amber-500/55' : 'bg-fuchsia-500/55'
                  } cursor-help`}
                  style={{ width: `${putW}%` }}
                />
                
                {/* Left Hover details for Put */}
                <div className={`absolute left-0 top-full mt-0.5 z-30 hidden group-hover/put:block group-focus-within/put:block border rounded-[4px] p-2 text-[9px] font-mono whitespace-nowrap shadow-2xl backdrop-blur-md pointer-events-none ring-1 ${
                  isLight 
                    ? `bg-white text-zinc-650 ${type === 'gex' ? 'border-rose-200/80 ring-rose-500/5' : type === 'dex' ? 'border-amber-200/80 ring-amber-500/5' : 'border-fuchsia-200/80 ring-fuchsia-500/5'}` 
                    : `bg-black/95 text-[var(--success)] ${type === 'gex' ? 'border-rose-500/35 ring-rose-500/10' : type === 'dex' ? 'border-amber-500/35 ring-amber-500/10' : 'border-fuchsia-500/35 ring-fuchsia-500/10'}`
                }`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                      type === 'gex' ? 'bg-rose-400' : type === 'dex' ? 'bg-amber-400' : 'bg-fuchsia-400'
                    }`} />
                    <span className={`font-semibold tracking-widest uppercase text-[8px] ${
                      isLight 
                        ? type === 'gex' ? 'text-rose-600' : type === 'dex' ? 'text-amber-600' : 'text-fuchsia-600'
                        : type === 'gex' ? 'text-[var(--danger)]' : type === 'dex' ? 'text-amber-400' : 'text-fuchsia-400'
                    }`}>PUT {typeUpper} OVERLAY</span>
                    <span className={isLight ? 'text-[var(--success)]' : 'text-zinc-650'}>|</span>
                    <span className={`font-bold ${isLight ? 'text-zinc-900' : 'text-[#E5E5E5]'}`}>STRIKE {fmtNum(r.strike)}</span>
                  </div>
                  <div className="space-y-0.5 text-left">
                    <div>{typeUpper}: <span className={`font-bold ${
                      isLight 
                        ? type === 'gex' ? 'text-rose-600' : type === 'dex' ? 'text-amber-600' : 'text-fuchsia-600'
                        : type === 'gex' ? 'text-[var(--danger)]' : type === 'dex' ? 'text-amber-300' : 'text-fuchsia-300'
                    }`}>{fmtGreek(r.putValue)}</span></div>
                    <div>Open Interest: <span className={`font-bold ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}>{(r.putOi ?? 0).toLocaleString()}</span></div>
                    <div>Volume: <span className={`font-bold ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}>{(r.putVolume ?? 0).toLocaleString()}</span></div>
                  </div>
                </div>
              </div>

              <div className={`w-px self-stretch ${isLight ? 'bg-[var(--border)]' : 'bg-[var(--border)]'}`} />

              {/* Call side */}
              <div
                tabIndex={0}
                role="button"
                aria-label={`Strike ${fmtNum(r.strike)} call — ${typeUpper} ${fmtGreek(r.callValue)}, Open Interest ${(r.callOi ?? 0).toLocaleString()}, Volume ${(r.callVolume ?? 0).toLocaleString()}`}
                className="relative group/call flex-1 flex justify-start items-center h-full pl-[1px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)]"
              >
                <div
                  className={`h-[11px] rounded-r-[2px] ${
                    isCallMax
                      ? type === 'gex' ? 'bg-[var(--success)]' : type === 'dex' ? 'bg-sky-500' : 'bg-indigo-500'
                      : type === 'gex' ? 'bg-[var(--success)]/55' : type === 'dex' ? 'bg-sky-500/55' : 'bg-indigo-500/55'
                  } cursor-help`}
                  style={{ width: `${callW}%` }}
                />

                {/* Right Hover details for Call */}
                <div className={`absolute right-0 top-full mt-0.5 z-30 hidden group-hover/call:block group-focus-within/call:block border rounded-[4px] p-2 text-[9px] font-mono whitespace-nowrap shadow-2xl backdrop-blur-md pointer-events-none ring-1 ${
                  isLight 
                    ? 'bg-white border-black ring-zinc-550/5 text-zinc-650' 
                    : 'bg-black/95 border-black ring-zinc-850 text-[var(--success)]'
                }`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                      type === 'gex' ? 'bg-[var(--success)]' : type === 'dex' ? 'bg-sky-400' : 'bg-indigo-400'
                    }`} />
                    <span className={`font-semibold tracking-widest uppercase text-[8px] ${
                      isLight
                        ? type === 'gex' ? 'text-[var(--success)]' : type === 'dex' ? 'text-sky-600' : 'text-indigo-600'
                        : type === 'gex' ? 'text-[var(--success)]' : type === 'dex' ? 'text-sky-400' : 'text-indigo-400'
                    }`}>CALL {typeUpper} OVERLAY</span>
                    <span className={isLight ? 'text-[var(--success)]' : 'text-zinc-650'}>|</span>
                    <span className={`font-bold ${isLight ? 'text-zinc-900' : 'text-[#E5E5E5]'}`}>STRIKE {fmtNum(r.strike)}</span>
                  </div>
                  <div className="space-y-0.5 text-left">
                    <div>{typeUpper}: <span className={`font-bold ${
                      isLight
                        ? type === 'gex' ? 'text-[var(--success)]' : type === 'dex' ? 'text-sky-600' : 'text-indigo-600'
                        : type === 'gex' ? 'text-[var(--success)]' : type === 'dex' ? 'text-sky-300' : 'text-indigo-300'
                    }`}>{fmtGreek(r.callValue)}</span></div>
                    <div>Open Interest: <span className={`font-bold ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}>{(r.callOi ?? 0).toLocaleString()}</span></div>
                    <div>Volume: <span className={`font-bold ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}>{(r.callVolume ?? 0).toLocaleString()}</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Net Column */}
            <div className={`w-[56px] sm:w-[64px] shrink-0 text-right text-[10px] font-bold tracking-[0.06em] tabular-nums pr-1 ${
              r.netValue >= 0 
                ? type === 'gex' ? 'text-[var(--success)]' : type === 'dex' ? 'text-sky-400/90' : 'text-indigo-400/90' 
                : type === 'gex' ? 'text-[var(--danger)]/90' : type === 'dex' ? 'text-amber-400/90' : 'text-fuchsia-400/90'
            }`}>
              {fmtGreek(r.netValue)}
            </div>
          </div>
        );
      })}

      {/* Spot marker footer removed to avoid dual readouts */}

      {/* SPOT MARKER — single static marker + a thin hairline reference */}
      {spotLine && (
        <motion.div
          className="absolute left-0 right-0 z-20 pointer-events-none"
          style={{ top: 0, originY: 0.5 }}
          animate={{
            y: spotLine.spotY
          }}
          transition={{
            type: "spring",
            stiffness: 90,
            damping: 18
          }}
        >
          <div className="relative flex items-center">
            {/* Static spot marker dot */}
            <div className={`absolute -left-1.5 w-2.5 h-2.5 bg-white rounded-full border ${
              type === 'gex'
                ? 'border-black'
                : type === 'dex'
                  ? 'border-sky-400'
                  : 'border-indigo-400'
            }`} />

            {/* Thin hairline reference line across the row */}
            <div className={`w-full h-[1px] ${
              type === 'gex'
                ? 'bg-[var(--success)]/40'
                : type === 'dex'
                  ? 'bg-sky-400/40'
                  : 'bg-indigo-400/40'
            }`} />

            {/* Centered coordinates tag (static) */}
            <div className={`absolute left-1/2 -translate-x-1/2 -top-3 px-2 py-0.5 rounded-xs font-mono font-semibold text-[9px] uppercase shadow-sm flex items-center gap-1 border z-30 ${
              isLight
                ? 'bg-white text-zinc-900 border-black'
                : 'bg-black/90 text-[#E5E5E5] border-black'
            }`}>
              <span>SPOT: {profile.spot.toFixed(2)}</span>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------
// Main view
// ----------------------------------------------------------------
export function DealerFlowView() {
  const selectedAsset = useContractStore(s => s.selectedAsset);
  const setSelectedAsset = useContractStore(s => s.setSelectedAsset);
  const selectedTimeframe = useContractStore(s => s.selectedTimeframe);
  const setSelectedTimeframe = useContractStore(s => s.setSelectedTimeframe);
  // Gate the streamed server state to the asset currently in view so switching
  // tickers doesn't briefly render the previous ticker's dealer data.
  const rawServerState = useContractStore(s => s.serverState);
  const serverState = useMemo(() => {
    if (!rawServerState) return null;
    const ticker = rawServerState.contract?.replace('-', ' ').split(' ')[0];
    if (ticker !== selectedAsset.ticker) return null;
    return rawServerState;
  }, [rawServerState, selectedAsset.ticker]);
  // 'physics' (Dealer Mechanics) now lives on the Quant Lab page — see QuantSuiteView.
  const [activeEngineView, setActiveEngineView] = useState<'profile' | 'targets' | 'terminal'>('profile');

  // Deep-link from the sidebar flyout: apply a `pinpoint:<sub>` intent once, then clear.
  const subTabIntent = useContractStore(s => s.subTabIntent);
  const setSubTabIntent = useContractStore(s => s.setSubTabIntent);
  useEffect(() => {
    if (!subTabIntent?.startsWith('pinpoint:')) return;
    const sub = subTabIntent.split(':')[1] as 'profile' | 'targets' | 'terminal';
    if (['profile', 'targets', 'terminal'].includes(sub)) setActiveEngineView(sub);
    setSubTabIntent(null);
  }, [subTabIntent, setSubTabIntent]);

  // Trader Intent Expirations
  const [expiryTab, setExpiryTab] = useState<'aggregated' | 'mon' | 'tue' | 'wed' | 'thu' | 'weekly' | 'custom' | 'weekly-front' | 'weekly-2' | 'weekly-3' | 'monthly' | 'fomc-weekly' | 'leaps' | 'custom-fomc' | 'custom-cpi' | 'custom-monthly'>('aggregated');
  const [isMultiExpiry, setIsMultiExpiry] = useState<boolean>(false);
  const [activeExpiries, setActiveExpiries] = useState<string[]>(['mon']);
  const [selectedCustomExpiry, setSelectedCustomExpiry] = useState<string>('Jul 17 (Monthly Expiry)');
  const [showCustomDropdown, setShowCustomDropdown] = useState<boolean>(false);
  // Expiry selector surface: a Popover on desktop, a bottom Sheet on phones (a 300px
  // popover is too cramped to scan the ladder on a small screen).
  const [expirySheetOpen, setExpirySheetOpen] = useState(false);
  const [isNarrowExpiry, setIsNarrowExpiry] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 640px)');
    const sync = () => setIsNarrowExpiry(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Unified Exposure Controls
  const [exposureMetric, setExposureMetric] = useState<'gex' | 'dex' | 'vex'>('gex');
  const [showOverlayWeights, setShowOverlayWeights] = useState<boolean>(true);

  // Search Bar State
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // Load contract selector parameters to map Call/Put styles (or white-glass defaults)
  const selectedOptionType = useContractStore(s => s.selectedOptionType);
  const selectedStrike = useContractStore(s => s.selectedStrike);
  const isContractLocked = useContractStore(s => s.isContractLocked);
  const activeTab = useContractStore(s => s.activeTab);
  const themeMode = useContractStore(s => s.themeMode);
  const isLight = themeMode === 'light';

  const isConSelected = isContractLocked && activeTab === 'skyvision';
  const isCall = selectedOptionType === 'C';

  // Dynamic Theme Styling Object (Neutral Glass-White vs calls green vs puts red)
  const theme = useMemo(() => {
    if (isLight) {
      if (!isConSelected) {
        return {
          accent: 'black',
          text: 'text-zinc-650',
          border: 'border-black hover:border-black',
          cardBg: 'bg-white border border-black shadow-[0_4px_24px_rgba(0,0,0,0.02)]',
          chipBg: 'bg-black border border-black text-zinc-650',
          iconColor: 'text-zinc-550',
          headerIconBg: 'bg-black border border-black',
          glow: 'rgba(0, 0, 0, 0.01)',
          primaryText: 'text-zinc-900',
          buttonActive: 'bg-black border border-black text-[#E5E5E5] shadow-sm',
          buttonInactive: 'bg-zinc-50 border border-black text-zinc-500 hover:text-zinc-800 hover:border-black',
          gexNetPlus: 'text-[var(--success)] font-bold',
          gexNetMinus: 'text-rose-600',
          themeSuffix: 'neutral',
          headerColor: 'text-zinc-900',
        };
      }
      
      if (isCall) {
        return {
          accent: 'emerald',
          text: 'text-emerald-700',
          border: 'border-emerald-200 hover:border-emerald-300',
          cardBg: 'bg-[#e6fcf0] border border-emerald-200/80 shadow-[0_4px_24px_rgba(16,185,129,0.03)]',
          chipBg: 'bg-emerald-100 border border-emerald-200 text-emerald-800',
          iconColor: 'text-emerald-600',
          headerIconBg: 'bg-emerald-100 border border-emerald-200',
          glow: 'rgba(16, 185, 129, 0.04)',
          primaryText: 'text-emerald-950',
          buttonActive: 'bg-emerald-600 border border-emerald-700 text-[#E5E5E5] shadow-sm',
          buttonInactive: 'bg-emerald-50 border border-emerald-200 text-emerald-600 hover:bg-emerald-100',
          gexNetPlus: 'text-emerald-700 font-bold',
          gexNetMinus: 'text-rose-600',
          themeSuffix: 'call',
          headerColor: 'text-emerald-950',
        };
      } else {
        return {
          accent: 'rose',
          text: 'text-rose-700',
          border: 'border-rose-200 hover:border-rose-300',
          cardBg: 'bg-[#fdf2f2] border border-rose-200/80 shadow-[0_4px_24px_rgba(244,63,94,0.03)]',
          chipBg: 'bg-rose-100 border border-rose-200 text-rose-800',
          iconColor: 'text-rose-600',
          headerIconBg: 'bg-rose-100 border border-rose-200',
          glow: 'rgba(244, 63, 94, 0.04)',
          primaryText: 'text-rose-950',
          buttonActive: 'bg-rose-600 border border-rose-700 text-[#E5E5E5] shadow-sm',
          buttonInactive: 'bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100',
          gexNetPlus: 'text-[var(--success)] font-bold',
          gexNetMinus: 'text-rose-600',
          themeSuffix: 'put',
          headerColor: 'text-rose-950',
        };
      }
    }

    if (!isConSelected) {
      return {
        accent: 'white',
        text: 'text-zinc-300',
        border: 'border-white/10 hover:border-white/15',
        cardBg: 'bg-white/[0.03] backdrop-blur-md border border-white/10 shadow-[0_8px_32px_0_rgba(255,255,255,0.01)]',
        chipBg: 'bg-white/5 border border-white/10 text-[var(--success)]',
        iconColor: 'text-zinc-400',
        headerIconBg: 'bg-white/[0.04] border border-white/10',
        glow: 'rgba(255, 255, 255, 0.05)',
        primaryText: 'text-[#E5E5E5]',
        buttonActive: 'bg-white/10 border border-white/20 text-[#E5E5E5] shadow-[0_0_12px_rgba(255,255,255,0.06)]',
        buttonInactive: 'bg-black/45 border border-black text-zinc-500 hover:text-[var(--success)] hover:border-black',
        gexNetPlus: 'text-zinc-200 font-bold',
        gexNetMinus: 'text-zinc-400',
        themeSuffix: 'neutral',
        headerColor: 'text-[#E5E5E5]',
      };
    }
    
    if (isCall) {
      return {
        accent: 'emerald',
        text: 'text-[var(--success)]',
        border: 'border-[var(--success)]/40 hover:border-[var(--success)]',
        cardBg: 'bg-[var(--success)]/[0.08] backdrop-blur-md border border-[var(--success)]/20 shadow-[0_8px_32px_0_rgba(16,185,129,0.01)]',
        chipBg: 'bg-[var(--success)]/10 border border-[var(--success)]/20 text-[var(--success)]',
        iconColor: 'text-[var(--success)]',
        headerIconBg: 'bg-[var(--success)]/10 border border-[var(--success)]/30',
        glow: 'rgba(16, 185, 129, 0.06)',
        primaryText: 'text-[var(--success)]',
        buttonActive: 'bg-[var(--success)]/20 border border-[var(--success)] text-[#E5E5E5] shadow-[0_0_12px_rgba(16,185,129,0.12)]',
        buttonInactive: 'bg-black/45 border border-black text-zinc-500 hover:text-[var(--success)] hover:border-black',
        gexNetPlus: 'text-[var(--success)] font-bold',
        gexNetMinus: 'text-[var(--danger)]/90',
        themeSuffix: 'call',
        headerColor: 'text-[var(--success)]',
      };
    } else {
      return {
        accent: 'rose',
        text: 'text-[var(--danger)]',
        border: 'border-rose-500/20 hover:border-rose-500/35',
        cardBg: 'bg-rose-950/[0.08] backdrop-blur-md border border-rose-500/15 shadow-[0_8px_32px_0_rgba(244,63,94,0.01)]',
        chipBg: 'bg-rose-500/10 border border-rose-500/20 text-[var(--danger)]',
        iconColor: 'text-[var(--danger)]',
        headerIconBg: 'bg-rose-500/10 border border-rose-500/20',
        glow: 'rgba(244, 63, 94, 0.06)',
        primaryText: 'text-rose-400',
        buttonActive: 'bg-rose-500/10 border border-rose-500 text-[#E5E5E5] shadow-[0_0_12px_rgba(244,63,94,0.12)]',
        buttonInactive: 'bg-black/45 border border-black text-zinc-500 hover:text-[var(--success)] hover:border-black',
        gexNetPlus: 'text-[var(--success)] font-bold',
        gexNetMinus: 'text-[var(--danger)]/90',
        themeSuffix: 'put',
        headerColor: 'text-[var(--danger)]',
      };
    }
  }, [isConSelected, isCall]);

  const profile = serverState?.gex_profile;

  // Dynanmic list of expirations per ticker (daily vs weekly options style)
  const tickerExpirations = useMemo(() => {
    const isDaily = selectedAsset.optionsStyle === 'daily' || selectedAsset.type === 'INDEXES' || selectedAsset.ticker === 'QQQ' || selectedAsset.ticker === 'SPY' || selectedAsset.ticker === 'IWM';

    // Builds the real options-expiry calendar for this ticker (daily 0DTE series
    // for indices/broad ETFs, weekly-front for single names) — dates only, no
    // fabricated per-expiry flow figures.
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86400000);
    const getThirdFriday = (year: number, month: number) => {
        let firstDay = new Date(year, month, 1);
        // JS getDay(): 0 is Sunday, 5 is Friday
        let dayOffset = 5 - firstDay.getDay();
        if (dayOffset < 0) dayOffset += 7;
        return new Date(year, month, 1 + dayOffset + 14);
    };

    // If today is weekend, jump to Monday to start standard daily series cleanly
    let baseDate = new Date(today);
    if (baseDate.getDay() === 6) baseDate = addDays(baseDate, 2);
    if (baseDate.getDay() === 0) baseDate = addDays(baseDate, 1);

    const dates: { dateObj: Date, labelMod: string }[] = [];

    if (isDaily) {
        let temp = new Date(baseDate);
        for (let i = 0; i < 28; i++) {
            dates.push({ dateObj: new Date(temp), labelMod: '' });
            temp = addDays(temp, temp.getDay() === 5 ? 3 : 1);
        }
        for (let i = 2; i < 6; i++) {
            const thirdFri = getThirdFriday(today.getFullYear(), today.getMonth() + i);
            if (thirdFri > temp) {
                dates.push({ dateObj: thirdFri, labelMod: 'MONTHLY' });
            }
        }
        dates.push({ dateObj: getThirdFriday(today.getFullYear() + 1, 0), labelMod: 'LEAPS' });
    } else {
        let temp = new Date(baseDate);
        let offset = 5 - temp.getDay();
        if (offset < 0) offset += 7;
        let nextFri = addDays(temp, offset);
        
        for (let i = 0; i < 8; i++) {
            dates.push({ dateObj: new Date(nextFri), labelMod: 'WEEKLY' });
            nextFri = addDays(nextFri, 7);
        }
        for (let i = 2; i < 12; i++) {
            const thirdFri = getThirdFriday(today.getFullYear(), today.getMonth() + i);
            if (thirdFri > addDays(baseDate, 60)) {
                dates.push({ dateObj: thirdFri, labelMod: 'MONTHLY' });
            }
        }
        dates.push({ dateObj: getThirdFriday(today.getFullYear() + 1, 0), labelMod: 'LEAPS' });
        dates.push({ dateObj: getThirdFriday(today.getFullYear() + 2, 0), labelMod: 'LEAPS' });
    }

    dates.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
    const uniqueDates: { dateObj: Date, labelMod: string }[] = [];
    const seen = new Set<string>();
    
    for (const d of dates) {
        const dStr = d.dateObj.toISOString().split('T')[0];
        if (!seen.has(dStr)) {
            seen.add(dStr);
            uniqueDates.push(d);
        }
    }

    return uniqueDates.map((item, idx) => {
        const dStr = item.dateObj.toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' });
        const dName = item.dateObj.toLocaleDateString('en-US', { weekday: 'short' });

        const diffDays = Math.max(0, Math.round((item.dateObj.getTime() - today.getTime()) / 86400000));
        let label = `${diffDays}DTE ${item.labelMod}`.trim();

        if (idx === 0 && diffDays <= 1) label = `0DTE FOCUS`;

        // NOTE: per-expiry GEX/OI/VOL/Gravity numbers are intentionally NOT
        // produced here. The server delivers a single aggregated chain profile,
        // not a per-expiration breakdown, so inventing per-tile figures would be
        // a fabrication. Tiles expose only the real calendar date + DTE label.
        return {
            id: `exp-${idx}`,
            date: `${dStr} (${dName})`,
            label,
            dteDays: diffDays,
        };
    });
  }, [selectedAsset]);

  // Real-time client-side options mathematics representing Trader Intent Expirations
  const filteredProfile = useMemo(() => {
    if (!profile) return null;
    if (!isMultiExpiry && expiryTab === 'aggregated') return profile;

    const spot = profile.spot;
    const sigma = Math.max(0.01, selectedAsset.volatility || 0.15); // annualized IV

    // Resolve the active expiry tabs to their real DTEs. If the selection doesn't
    // map to any known tile, fall back to the real aggregate rather than invent.
    const activeIds = isMultiExpiry ? activeExpiries : [expiryTab];
    const allTiles = tickerExpirations;
    const activeTiles = allTiles.filter((t) => activeIds.includes(t.id));
    if (!activeTiles.length || !allTiles.length) return profile;

    // Per-expiry gamma TERM STRUCTURE — a defensible MODEL, not a feed (the server
    // ships one aggregated chain). We attribute each strike's aggregate exposure
    // across expiries by how dealer gamma actually concentrates with tenor:
    //   • amplitude  a(d) ∝ 1/√d                 — near-dated options carry more γ
    //   • shape      g(s,d) = exp(-½·z² / EM(d)²) — z = (strike-spot)/spot,
    //                EM(d) = σ·√(d/365): near expiries peak tightly at spot, far
    //                expiries spread out (the real gamma-by-tenor profile)
    // Weights are normalized across ALL tiles per strike, so selecting every expiry
    // reconstructs the aggregate exactly. Replaces the prior sin(strike·hash) split.
    const emOf = (d: number) => Math.max(0.002, sigma * Math.sqrt(Math.max(d, 0.5) / 365));
    const rawWeight = (strike: number, d: number) => {
      const z = (strike - spot) / (spot || 1);
      const em = emOf(d);
      return (1 / Math.sqrt(Math.max(d, 0.5))) * Math.exp(-(z * z) / (2 * em * em));
    };

    const strikes = profile.strikes.map((s: any) => {
      let denom = 0;
      for (const t of allTiles) denom += rawWeight(s.strike, t.dteDays);
      let numer = 0;
      for (const t of activeTiles) numer += rawWeight(s.strike, t.dteDays);
      const w = denom > 0 ? numer / denom : 0;

      return {
        ...s,
        callGex: (s.callGex || 0) * w,
        putGex: (s.putGex || 0) * w,
        netGex: (s.netGex || 0) * w,
        callDex: (s.callDex || 0) * w,
        putDex: (s.putDex || 0) * w,
        netDex: (s.netDex || 0) * w,
        callVex: (s.callVex || 0) * w,
        putVex: (s.putVex || 0) * w,
        netVex: (s.netVex || 0) * w,
      };
    });

    const callWallStrike = strikes.reduce((max, cur) => cur.callGex > max.callGex ? cur : max, strikes[0])?.strike || profile.callWall;
    const putWallStrike = strikes.reduce((max, cur) => Math.abs(cur.putGex) > Math.abs(max.putGex) ? cur : max, strikes[0])?.strike || profile.putWall;

    const sortedStrikes = [...strikes].sort((a, b) => a.strike - b.strike);
    let gammaFlipStrike = profile.gammaFlip;
    for (let i = 0; i < sortedStrikes.length - 1; i++) {
      if (
        (sortedStrikes[i].netGex < 0 && sortedStrikes[i + 1].netGex >= 0) ||
        (sortedStrikes[i].netGex >= 0 && sortedStrikes[i + 1].netGex < 0)
      ) {
        gammaFlipStrike = sortedStrikes[i].strike;
        break;
      }
    }

    const magnetStrike = strikes.reduce((max, cur) => Math.abs(cur.netGex) > Math.abs(max.netGex) ? cur : max, strikes[0])?.strike || profile.magnet;
    const totalNetGex = strikes.reduce((sum, s) => sum + s.netGex, 0);

    return {
      ...profile,
      strikes,
      netGex: totalNetGex,
      callWall: callWallStrike,
      putWall: putWallStrike,
      gammaFlip: gammaFlipStrike,
      magnet: magnetStrike,
    };
  }, [profile, expiryTab, isMultiExpiry, activeExpiries, selectedAsset, tickerExpirations]);
  const gauge = serverState?.dealer_flow;
  const disp = serverState?.displacement;

  // GEX-page header analytics — derived entirely from the real (filtered) GEX
  // profile. Previously these were five hardcoded constants ("POSITIVE GAMMA",
  // "84%", "LOW", "HIGH", "92/100") that never changed. Now: regime from the
  // net-gamma sign, pin-risk from how tightly spot is clamped to the pin magnet,
  // vol/dealer-control from the gamma regime, and a composite control score.
  const headerAnalytics = useMemo(() => {
    const p = filteredProfile || profile;
    if (!p || p.spot == null) return null;

    const netGex = p.netGex ?? 0;
    const positiveGamma = netGex >= 0;

    // Pin risk: closeness of spot to the pin magnet, scaled by the chain's
    // expected move (tighter clamp + positive gamma ⇒ higher pinning risk).
    const pin = p.magnet ?? p.gammaFlip;
    const em = (p.expectedMovePct ?? 0) || 0.01; // fraction; guard div-by-zero
    let pinRiskPct: number | null = null;
    if (pin != null && p.spot) {
      const distFrac = Math.abs(p.spot - pin) / p.spot;
      // 0 distance ⇒ ~95%, distance == expected move ⇒ ~30%.
      const raw = 95 - (distFrac / em) * 65;
      pinRiskPct = Math.max(5, Math.min(95, Math.round(raw)));
    }

    const regime = positiveGamma ? 'POSITIVE GAMMA' : 'NEGATIVE GAMMA';
    const volRisk = positiveGamma ? 'LOW' : 'HIGH';        // +γ dampens vol
    const dealerControl = positiveGamma ? 'HIGH' : 'LOW';  // +γ ⇒ dealers stabilize

    // Composite 0–100 control score from real signals: gamma regime,
    // pin tightness, and expected-move calmness.
    const gammaPts = positiveGamma ? 55 : 25;
    const pinPts = pinRiskPct != null ? (pinRiskPct / 100) * 30 : 15;
    const calmPts = Math.max(0, 15 - Math.min(15, em * 100 * 3)); // smaller EM ⇒ more control
    const controlScore = Math.max(0, Math.min(100, Math.round(gammaPts + pinPts + calmPts)));

    return { regime, positiveGamma, pinRiskPct, volRisk, dealerControl, controlScore };
  }, [filteredProfile, profile]);

  // Memoize array props for InteractiveChart so they keep a stable reference when the
  // underlying data is unchanged. The inline `|| []` + optional chaining otherwise create
  // a fresh array every render, forcing the chart effect to tear down & rebuild all series.
  const chartCandles = useMemo(() => serverState?.candles || [], [serverState?.candles]);
  const chartDisplacementZones = useMemo(() => disp?.zones || [], [disp?.zones]);
  const chartFvgs = useMemo(() => disp?.fvgs || [], [disp?.fvgs]);
  const chartLiquidityEvents = useMemo(() => disp?.sweeps || [], [disp?.sweeps]);
  const chartTape = useMemo(() => serverState?.tape || [], [serverState?.tape]);

  // ────────────────────────────────────────────────────────────────────────
  // Mock-parity presentation data — every value below is a re-aggregation of
  // fields the page already streams (profile strikes, dealer gauge, candles,
  // option chain, live spots). Nothing here is fabricated.
  // ────────────────────────────────────────────────────────────────────────

  // Spot change over the loaded candle window (real candles only).
  const spotChange = useMemo(() => {
    const spot = (filteredProfile || profile)?.spot;
    const first = chartCandles[0];
    if (spot == null || !first || !isFinite(first.open) || first.open === 0) return null;
    const chg = spot - first.open;
    return { chg, pct: (chg / first.open) * 100 };
  }, [chartCandles, filteredProfile, profile]);

  // DEALER PRESSURE MATRIX rows — the real per-strike chain profile, sorted
  // top-down, with the nearest real strike flagged for SPOT / PIN / FLIP.
  const matrixData = useMemo(() => {
    const p: any = filteredProfile || profile;
    const strikes: any[] = p?.strikes || [];
    if (!strikes.length) return { rows: [] as any[], pinStrike: null as number | null, flipStrike: null as number | null, spotStrike: null as number | null };
    const sorted = [...strikes].sort((a, b) => b.strike - a.strike);
    const nearest = (level?: number | null): number | null => {
      if (level == null || !isFinite(level)) return null;
      let bestStrike: number | null = null;
      let best = Infinity;
      for (const s of sorted) {
        const d = Math.abs(s.strike - level);
        if (d < best) { best = d; bestStrike = s.strike; }
      }
      return bestStrike;
    };
    return {
      rows: sorted,
      pinStrike: nearest(p?.magnet),
      flipStrike: nearest(p?.gammaFlip),
      spotStrike: nearest(p?.spot),
    };
  }, [filteredProfile, profile]);

  // KEY LEVELS RAIL — real levels from the profile; per-level "pressure" is
  // |netGex| at the nearest real strike (no interpolation, no invention).
  const keyLevels = useMemo(() => {
    const p: any = filteredProfile || profile;
    if (!p || p.spot == null) return [];
    const strikes: any[] = p.strikes || [];
    const pressureAt = (level: number): number | null => {
      if (!strikes.length) return null;
      let best = Infinity;
      let hit: any = null;
      for (const s of strikes) {
        const d = Math.abs(s.strike - level);
        if (d < best) { best = d; hit = s; }
      }
      return hit ? Math.abs(hit.netGex || 0) : null;
    };
    return ([
      { id: 'callWall', label: 'CALL WALL', price: p.callWall, tone: 'call' },
      { id: 'spot', label: 'SPOT', price: p.spot, tone: 'neutral' },
      { id: 'pin', label: 'PIN', price: p.magnet, tone: 'pin' },
      { id: 'flip', label: 'FLIP', price: p.gammaFlip, tone: 'warning' },
      { id: 'putWall', label: 'PUT WALL', price: p.putWall, tone: 'negative' },
    ] as { id: string; label: string; price?: number; tone: string }[])
      .filter((d) => d.price != null && isFinite(d.price))
      .map((d) => ({
        ...d,
        price: d.price as number,
        dist: (d.price as number) - p.spot,
        distPct: p.spot ? (((d.price as number) - p.spot) / p.spot) * 100 : 0,
        pressure: pressureAt(d.price as number),
      }))
      .sort((a, b) => b.price - a.price);
  }, [filteredProfile, profile]);

  // OPTIONS CHAIN — only the near-the-money chain the server actually streamed
  // (bid/ask/Δ/OI per side; this feed carries no last-trade field). Volume is
  // joined from the same real per-strike profile.
  const chainView = useMemo(() => {
    const chain = serverState?.option_chain;
    const p: any = filteredProfile || profile;
    const spot = p?.spot;
    if (!chain || chain.length === 0 || spot == null) return { rows: [] as any[], atmStrike: null as number | null };
    const byStrike = new Map<number, { strike: number; call?: any; put?: any }>();
    for (const c of chain) {
      const row = byStrike.get(c.strike) || { strike: c.strike };
      if (c.type === 'call') row.call = c; else row.put = c;
      byStrike.set(c.strike, row);
    }
    const volByStrike = new Map<number, any>((p?.strikes || []).map((s: any) => [s.strike, s]));
    const nearSpot = [...byStrike.values()]
      .map((r) => ({ ...r, vols: volByStrike.get(r.strike) }))
      .sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))
      .slice(0, 15);
    const atmStrike = nearSpot.length ? nearSpot[0].strike : null;
    return { rows: nearSpot.sort((a, b) => b.strike - a.strike), atmStrike };
  }, [serverState?.option_chain, filteredProfile, profile]);

  // ORDER FLOW — cumulative delta summed from the real streamed tape only.
  const cumulativeDelta = useMemo(() => {
    if (!chartTape.length) return null;
    return chartTape.reduce(
      (acc: number, t: any) => acc + (t.direction === 'sell' ? -1 : 1) * Math.abs(t.size ?? t.qty ?? t.volume ?? 1),
      0,
    );
  }, [chartTape]);

  // Multi-ticker live spots (real engine feed). The panel renders only when the
  // server truly streams more than one ticker.
  const multiTickerRows = useMemo(() => {
    const prices = serverState?.liveSpotPrices;
    if (!prices) return [];
    return Object.entries(prices)
      .filter(([, v]) => typeof v === 'number' && isFinite(v as number))
      .map(([ticker, price]) => ({ ticker, price: price as number }))
      .sort((a, b) => a.ticker.localeCompare(b.ticker));
  }, [serverState?.liveSpotPrices]);

  // MARKET NOTES — timestamped strings the engine already derives from real
  // numbers (gex_summary text, dealer-flow headline, header analytics).
  const frameTs = useMemo(() => {
    const last = chartCandles[chartCandles.length - 1];
    const t = last?.timestamp;
    if (!t || !isFinite(t)) return Date.now();
    return t > 1e12 ? t : t * 1000;
  }, [chartCandles]);

  const derivedNotes = useMemo(() => {
    const out: { ts: number; text: string; tone: 'neutral' | 'positive' | 'negative' | 'warning' }[] = [];
    const p: any = filteredProfile || profile;
    const summary = serverState?.gex_summary;
    if (summary?.text) out.push({ ts: summary.generatedAt || frameTs, text: summary.text, tone: 'neutral' });
    if (gauge?.headline) {
      out.push({
        ts: frameTs,
        text: `${gauge.bias ? `[${gauge.bias}] ` : ''}${gauge.headline}`,
        tone: (gauge.pressure ?? 0) >= 0 ? 'positive' : 'negative',
      });
    }
    if (headerAnalytics) {
      out.push({
        ts: frameTs,
        text: `${headerAnalytics.regime} · pin risk ${headerAnalytics.pinRiskPct != null ? `${headerAnalytics.pinRiskPct}%` : '—'} · dealer control ${headerAnalytics.dealerControl} · control score ${headerAnalytics.controlScore}/100`,
        tone: headerAnalytics.positiveGamma ? 'positive' : 'warning',
      });
    }
    if (p?.spot != null && p?.gammaFlip != null && isFinite(p.gammaFlip)) {
      const d = p.spot - p.gammaFlip;
      out.push({
        ts: frameTs,
        text: `Spot ${p.spot.toFixed(selectedAsset.decimals)} trades ${Math.abs(d).toFixed(1)} pts ${d >= 0 ? 'above' : 'below'} the γ-flip (${fmtLevel(p.gammaFlip)}).`,
        tone: d >= 0 ? 'positive' : 'negative',
      });
    }
    return out;
  }, [filteredProfile, profile, serverState?.gex_summary, gauge, headerAnalytics, frameTs, selectedAsset.decimals]);

  // Trader notes — persisted per ticker to localStorage.
  const notesKey = `slayer-dealerflow-notes:${selectedAsset.ticker}`;
  const [userNotes, setUserNotes] = useState<{ ts: number; text: string }[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(notesKey);
      setUserNotes(raw ? JSON.parse(raw) : []);
    } catch {
      setUserNotes([]);
    }
  }, [notesKey]);
  const persistUserNotes = (next: { ts: number; text: string }[]) => {
    setUserNotes(next);
    try { window.localStorage.setItem(notesKey, JSON.stringify(next)); } catch { /* storage unavailable */ }
  };
  const addUserNote = () => {
    const text = noteDraft.trim();
    if (!text) return;
    persistUserNotes([{ ts: Date.now(), text }, ...userNotes].slice(0, 50));
    setNoteDraft('');
  };

  if (!serverState || !profile || !profile.strikes || !gauge || !disp) {
    return (
      <div className="slayer-terminal w-full p-3 sm:p-4">
        <div
          className="slayer-panel w-full p-6 space-y-5"
          id="dealerflow-data-pending"
          role="status"
          aria-busy="true"
          aria-label="Loading dealer flow data"
        >
          <div className="flex items-baseline justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
            <div className="min-w-0">
              <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                Dealer Flow · {selectedAsset.ticker}
              </div>
              <p className="mt-1 text-[12px] leading-snug text-[var(--text-secondary)]">
                Hedging profile, order flow and displacement zones — waiting on the first data frame.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--warning)] animate-pulse" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                No feed
              </span>
            </div>
          </div>

          {/* Skeleton mirroring the GEX / DEX / VEX 3-column profile layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-[var(--gap)]">
            <PanelSkeleton label="Gamma Exposure (GEX)" rows={5} />
            <PanelSkeleton label="Delta Exposure (DEX)" rows={5} />
            <PanelSkeleton label="Vega Exposure (VEX)" rows={5} />
          </div>
        </div>
      </div>
    );
  }

  // Shared expiry-selector chrome — rendered inside a desktop Popover or a mobile Sheet.
  const expiryTriggerInner = (
    <>
      <CalendarClock className="w-3.5 h-3.5 text-[var(--accent-color)] shrink-0" />
      <div className="flex flex-col leading-none gap-0.5 min-w-0">
        <span className="text-[7.5px] font-semibold uppercase tracking-widest text-[var(--text-tertiary)]">Selected Expiry</span>
        <span className="text-[11px] font-semibold tabular-nums text-[var(--text-primary)] truncate">
          {isMultiExpiry
            ? `${activeExpiries.length} ${activeExpiries.length === 1 ? 'expiry' : 'expiries'}`
            : expiryTab === 'aggregated'
              ? 'All Dates'
              : (() => { const t = tickerExpirations.find(x => x.id === expiryTab); return t ? `${t.date} · ${t.dteDays}DTE` : 'Select Expiry'; })()}
        </span>
      </div>
      <ChevronDown className="w-3.5 h-3.5 text-[var(--text-tertiary)] shrink-0" />
    </>
  );
  const expiryTriggerCls = 'slayer-control flex items-center gap-2 text-left cursor-pointer hover:border-[var(--border-strong)]';

  const expiryLadder = (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2.5">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-[var(--text-secondary)]">Expiry Ladder</span>
        <Switch
          size="sm"
          tone="success"
          label="Multi"
          checked={isMultiExpiry}
          onChange={(v) => {
            setIsMultiExpiry(v);
            if (v) {
              if (expiryTab !== 'custom' && expiryTab !== 'aggregated') setActiveExpiries([expiryTab]);
              else setActiveExpiries([tickerExpirations[0].id]);
            } else {
              setExpiryTab((activeExpiries[0] as any) || 'mon');
            }
          }}
        />
      </div>

      <div className="max-h-[340px] overflow-y-auto p-1.5 flex flex-col gap-1">
        {!isMultiExpiry && (
          <button onClick={() => setExpiryTab('aggregated')} className={expiryRowCls(expiryTab === 'aggregated')}>
            <span className="flex items-center gap-2.5 min-w-0">
              <span className={`w-1 h-4 rounded-[1px] shrink-0 ${expiryTab === 'aggregated' ? 'bg-[var(--success)]' : 'bg-[var(--text-tertiary)]'}`} />
              <span className="flex flex-col leading-none gap-0.5 text-left">
                <span className="text-[11px] font-semibold text-[var(--text-primary)]">All Dates</span>
                <span className="text-[7.5px] font-semibold uppercase tracking-widest text-[var(--text-tertiary)]">Master profile · total gravity</span>
              </span>
            </span>
            {expiryTab === 'aggregated' && <Check className="w-3.5 h-3.5 text-[var(--success)] shrink-0" />}
          </button>
        )}

        {tickerExpirations.map((item) => {
          const isActive = isMultiExpiry ? activeExpiries.includes(item.id) : expiryTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                if (isMultiExpiry) {
                  if (activeExpiries.includes(item.id)) {
                    if (activeExpiries.length > 1) setActiveExpiries(activeExpiries.filter(x => x !== item.id));
                  } else {
                    setActiveExpiries([...activeExpiries, item.id]);
                  }
                } else {
                  setExpiryTab(item.id as any);
                }
              }}
              className={expiryRowCls(isActive)}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                {isMultiExpiry && (
                  <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${isActive ? 'border-[var(--accent-color)] bg-[var(--accent-color)]/15' : 'border-[var(--border-strong)]'}`}>
                    {isActive && <Check className="w-2.5 h-2.5 text-[var(--accent-color)]" />}
                  </span>
                )}
                <span className="text-[12px] font-semibold tabular-nums text-[var(--text-primary)]">{item.date}</span>
                <span className="text-[8px] font-semibold uppercase text-[var(--text-tertiary)] bg-[var(--surface-2)] px-1 rounded">{item.label}</span>
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-mono font-bold tabular-nums text-[var(--text-secondary)]">{item.dteDays}DTE</span>
                {!isMultiExpiry && isActive && <Check className="w-3.5 h-3.5 text-[var(--accent-color)]" />}
              </span>
            </button>
          );
        })}
      </div>

      {expiryTab !== 'aggregated' && !isMultiExpiry && (
        <div className="flex items-start gap-1.5 border-t border-[var(--border)] px-3 py-2 text-[9.5px] font-medium text-[var(--warning)]">
          <ShieldAlert className="w-3 h-3 shrink-0 mt-px" aria-hidden="true" />
          Single-expiry breakdown is a deterministic model, not a per-expiration feed.
        </div>
      )}
    </div>
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Render-time view models (post-guard: serverState/profile/gauge/disp exist).
  // Purely presentational re-reads of the real fields above — "—" when absent.
  // ──────────────────────────────────────────────────────────────────────────
  const view: any = filteredProfile || profile;
  const dec = selectedAsset.decimals;

  const distSub = (level?: number | null): string | undefined => {
    if (level == null || !isFinite(level) || view.spot == null) return undefined;
    const d = (level as number) - view.spot;
    return `${d >= 0 ? '+' : ''}${d.toFixed(1)} vs spot`;
  };

  const biasTone: Metric['tone'] = (gauge.pressure ?? 0) > 0 ? 'positive' : (gauge.pressure ?? 0) < 0 ? 'negative' : 'neutral';

  const supportMetrics: Metric[] = [
    {
      label: 'Spot',
      value: (
        <LiveValue
          value={view.spot}
          format={(v) => (v as number).toLocaleString('en-US', { minimumFractionDigits: Math.min(2, dec), maximumFractionDigits: 2 })}
        />
      ),
      sub: spotChange ? (
        <span className={`slayer-num ${spotChange.chg >= 0 ? 'text-[var(--positive-ink)]' : 'text-[var(--negative-ink)]'}`}>
          {`${spotChange.chg >= 0 ? '+' : ''}${spotChange.chg.toFixed(2)} (${spotChange.pct >= 0 ? '+' : ''}${spotChange.pct.toFixed(2)}%) · window`}
        </span>
      ) : '—',
      tone: 'neutral',
    },
    { label: 'Call Wall', value: fmtLevel(view.callWall), sub: distSub(view.callWall), tone: 'call' },
    { label: 'Put Wall', value: fmtLevel(view.putWall), sub: distSub(view.putWall), tone: 'negative' },
    { label: 'Pin Level', value: fmtLevel(view.magnet), sub: distSub(view.magnet), tone: 'pin' },
    {
      label: 'Dealer Bias',
      value: <span className="text-[15px] leading-tight">{(gauge.bias || '—').toUpperCase()}</span>,
      sub: gauge.pressure != null ? `pressure ${gauge.pressure > 0 ? '+' : ''}${Math.round(gauge.pressure)}` : undefined,
      tone: biasTone,
    },
    {
      label: 'Expected Move',
      value: view.expectedMovePct != null ? `±${(view.expectedMovePct * 100).toFixed(2)}%` : '—',
      sub:
        view.expectedMovePct != null && view.spot != null
          ? `±${(view.expectedMovePct * view.spot).toFixed(Math.min(dec, 1))} pts · chain-implied`
          : undefined,
      tone: 'warning',
    },
    {
      label: 'Flip',
      value: fmtLevel(view.gammaFlip),
      sub:
        view.gammaFlip != null
          ? `${distSub(view.gammaFlip) ?? ''}${view.gammaFlipConfident === false ? ' · est' : ''}`
          : undefined,
      tone: 'warning',
    },
    {
      label: 'Net DEX',
      value: view.netDex != null && isFinite(view.netDex) ? fmtGreek(view.netDex) : '—',
      sub:
        view.netDex != null && isFinite(view.netDex)
          ? view.netDex >= 0 ? 'dealers long delta' : 'dealers short delta'
          : 'no chain data',
      tone: view.netDex != null && isFinite(view.netDex) ? (view.netDex >= 0 ? 'positive' : 'negative') : 'neutral',
    },
  ];

  // Cell atoms for the pressure matrix / chain: red negative, info-blue positive.
  const pressCell = (v?: number | null) => (
    <span
      className={`slayer-num text-[11px] font-medium whitespace-nowrap ${
        v == null || !isFinite(v) ? 'text-[var(--text-faint)]' : v < 0 ? 'text-[var(--negative-ink)]' : 'text-[var(--info)]'
      }`}
    >
      {v == null || !isFinite(v) ? '—' : fmtGreek(v)}
    </span>
  );
  const countCell = (v?: number | null) => (
    <span className="slayer-num text-[11px] whitespace-nowrap text-[var(--text-secondary)]">
      {v == null || !isFinite(v) ? '—' : Math.round(v).toLocaleString('en-US')}
    </span>
  );
  const chainNum = (v?: number, digits = 2) => (v == null || !isFinite(v) ? '—' : v.toFixed(digits));

  const matrixColumns: DataColumn<any>[] = [
    {
      id: 'strike',
      title: 'STRIKE',
      align: 'left',
      className: 'whitespace-nowrap',
      render: (r) => (
        <span className="flex items-center gap-1.5">
          <span className="slayer-num text-[11px] font-semibold text-[var(--text-primary)]">{fmtNum(r.strike)}</span>
          {r.strike === matrixData.spotStrike && (
            <span className="rounded-[4px] border border-[var(--border-strong)] px-1 py-px text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">SPOT</span>
          )}
          {r.strike === matrixData.pinStrike && (
            <span className="rounded-[4px] border border-[color-mix(in_srgb,var(--pin)_55%,transparent)] bg-[color-mix(in_srgb,var(--pin)_16%,transparent)] px-1 py-px text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--pin)]">PIN</span>
          )}
          {r.strike === matrixData.flipStrike && (
            <span className="rounded-[4px] border border-[color-mix(in_srgb,var(--warning)_50%,transparent)] bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] px-1 py-px text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--warning)]">FLIP</span>
          )}
        </span>
      ),
    },
    { id: 'cPress', title: <span className="text-[var(--call)]">C PRESS</span>, align: 'right', render: (r) => pressCell(r.callGex) },
    { id: 'cOi', title: <span className="text-[var(--call)]">C OI</span>, align: 'right', render: (r) => countCell(r.callOi) },
    { id: 'cVol', title: <span className="text-[var(--call)]">C VOL</span>, align: 'right', render: (r) => countCell(r.callVolume) },
    { id: 'pPress', title: <span className="text-[var(--negative-ink)]">P PRESS</span>, align: 'right', render: (r) => pressCell(r.putGex) },
    { id: 'pOi', title: <span className="text-[var(--negative-ink)]">P OI</span>, align: 'right', render: (r) => countCell(r.putOi) },
    { id: 'pVol', title: <span className="text-[var(--negative-ink)]">P VOL</span>, align: 'right', render: (r) => countCell(r.putVolume) },
    { id: 'net', title: 'NET', align: 'right', render: (r) => pressCell(r.netGex) },
  ];

  const keyLevelColumns: DataColumn<any>[] = [
    {
      id: 'level',
      title: 'LEVEL',
      align: 'left',
      render: (r) => (
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: LEVEL_TONE_COLOR[r.tone] }} />
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: LEVEL_TONE_COLOR[r.tone] }}>{r.label}</span>
        </span>
      ),
    },
    {
      id: 'price',
      title: 'PRICE',
      align: 'right',
      render: (r) => (
        <span className="slayer-num text-[11.5px] font-semibold text-[var(--text-primary)]">
          {(r.price as number).toLocaleString('en-US', { maximumFractionDigits: dec })}
        </span>
      ),
    },
    {
      id: 'dist',
      title: 'DIST',
      align: 'right',
      render: (r) =>
        r.id === 'spot' ? (
          <span className="slayer-num text-[11px] text-[var(--text-muted)]">—</span>
        ) : (
          <span className={`slayer-num text-[11px] ${r.dist >= 0 ? 'text-[var(--positive-ink)]' : 'text-[var(--negative-ink)]'}`}>
            {`${r.dist >= 0 ? '+' : ''}${r.dist.toFixed(1)} (${r.distPct >= 0 ? '+' : ''}${r.distPct.toFixed(2)}%)`}
          </span>
        ),
    },
    {
      id: 'pressure',
      title: 'PRESSURE',
      align: 'right',
      render: (r) => (
        <span className="slayer-num text-[11px] text-[var(--text-primary)]">{r.pressure != null ? `$${fmtMag(r.pressure)}` : '—'}</span>
      ),
    },
  ];

  const chainColumns: DataColumn<any>[] = [
    { id: 'cBid', title: <span className="text-[var(--call)]">BID</span>, align: 'right', render: (r) => <span className="slayer-num text-[10.5px] text-[var(--text-secondary)]">{chainNum(r.call?.bid)}</span> },
    { id: 'cAsk', title: <span className="text-[var(--call)]">ASK</span>, align: 'right', render: (r) => <span className="slayer-num text-[10.5px] text-[var(--text-secondary)]">{chainNum(r.call?.ask)}</span> },
    { id: 'cDelta', title: <span className="text-[var(--call)]">Δ</span>, align: 'right', render: (r) => <span className="slayer-num text-[10.5px] text-[var(--info)]">{chainNum(r.call?.delta)}</span> },
    { id: 'cVol', title: <span className="text-[var(--call)]">VOL</span>, align: 'right', render: (r) => countCell(r.vols?.callVolume) },
    { id: 'cOi', title: <span className="text-[var(--call)]">OI</span>, align: 'right', render: (r) => countCell(r.call?.openInterest) },
    {
      id: 'strike',
      title: 'STRIKE',
      align: 'center',
      className: 'whitespace-nowrap',
      render: (r) => <span className="slayer-num text-[11px] font-semibold text-[var(--text-primary)]">{fmtNum(r.strike)}</span>,
    },
    { id: 'pBid', title: <span className="text-[var(--negative-ink)]">BID</span>, align: 'right', render: (r) => <span className="slayer-num text-[10.5px] text-[var(--text-secondary)]">{chainNum(r.put?.bid)}</span> },
    { id: 'pAsk', title: <span className="text-[var(--negative-ink)]">ASK</span>, align: 'right', render: (r) => <span className="slayer-num text-[10.5px] text-[var(--text-secondary)]">{chainNum(r.put?.ask)}</span> },
    { id: 'pDelta', title: <span className="text-[var(--negative-ink)]">Δ</span>, align: 'right', render: (r) => <span className="slayer-num text-[10.5px] text-[var(--negative-ink)]">{chainNum(r.put?.delta)}</span> },
    { id: 'pVol', title: <span className="text-[var(--negative-ink)]">VOL</span>, align: 'right', render: (r) => countCell(r.vols?.putVolume) },
    { id: 'pOi', title: <span className="text-[var(--negative-ink)]">OI</span>, align: 'right', render: (r) => countCell(r.put?.openInterest) },
  ];

  const multiTickerColumns: DataColumn<any>[] = [
    {
      id: 'ticker',
      title: 'TICKER',
      align: 'left',
      render: (r) => (
        <span className="flex items-center gap-2">
          <span className="slayer-num text-[11px] font-semibold text-[var(--text-primary)]">{r.ticker}</span>
          {r.ticker === selectedAsset.ticker && (
            <span className="rounded-[4px] border border-[color-mix(in_srgb,var(--pin)_55%,transparent)] bg-[color-mix(in_srgb,var(--pin)_16%,transparent)] px-1 py-px text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--pin)]">IN VIEW</span>
          )}
        </span>
      ),
    },
    {
      id: 'last',
      title: 'LAST',
      align: 'right',
      render: (r) => (
        <span className="slayer-num text-[11.5px] text-[var(--text-primary)]">
          <LiveValue value={r.price} format={(v) => (v as number).toLocaleString('en-US', { maximumFractionDigits: 2 })} />
        </span>
      ),
    },
  ];

  // Expiry selector (desktop Popover / phone Sheet) — mounted in the matrix panel actions.
  const expirySelector = isNarrowExpiry ? (
    <>
      <button id="expiry-selector-trigger" onClick={() => setExpirySheetOpen(true)} className={expiryTriggerCls}>
        {expiryTriggerInner}
      </button>
      <Sheet open={expirySheetOpen} onClose={() => setExpirySheetOpen(false)} side="bottom" title="Select Expiry" size="72vh">
        {expiryLadder}
      </Sheet>
    </>
  ) : (
    <Popover
      align="end"
      width={300}
      trigger={<button id="expiry-selector-trigger" className={expiryTriggerCls}>{expiryTriggerInner}</button>}
    >
      {expiryLadder}
    </Popover>
  );

  const expiryStatus = isMultiExpiry
    ? `${activeExpiries.length} ${activeExpiries.length === 1 ? 'expiry' : 'expiries'} · model split`
    : expiryTab === 'aggregated'
      ? 'all dates · aggregate profile'
      : (() => {
          const t = tickerExpirations.find((x) => x.id === expiryTab);
          return t ? `${t.date} · ${t.dteDays}DTE · model split` : 'select expiry';
        })();
  const isModelSplit = isMultiExpiry || expiryTab !== 'aggregated';

  return (
    <div className="w-full space-y-[var(--gap)]" id="dealerflow-main-workspace-view">
      {/* ============== DEALER-GAMMA HEADER — one dominant figure (Net GEX) leads,
           supporting reads run off it, hairline-separated (no uniform tile wall) ============== */}
      <div className="slayer-panel flex flex-col overflow-hidden xl:flex-row">
        <div className="shrink-0 border-b border-[var(--border-subtle)] px-4 py-3 xl:w-[256px] xl:border-b-0 xl:border-r">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Net GEX</span>
            {headerAnalytics && (
              <span
                className="rounded-[4px] px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.12em] tabular-nums"
                style={{
                  color: headerAnalytics.positiveGamma ? 'var(--positive-ink)' : 'var(--negative-ink)',
                  background: `color-mix(in srgb, ${headerAnalytics.positiveGamma ? 'var(--positive-ink)' : 'var(--negative-ink)'} 14%, transparent)`,
                }}
              >
                {headerAnalytics.positiveGamma ? '+γ' : '−γ'}
              </span>
            )}
          </div>
          <div
            className={`mt-1.5 slayer-num text-[26px] font-bold leading-none ${
              view.netGex == null || !isFinite(view.netGex)
                ? 'text-[var(--text-faint)]'
                : view.netGex >= 0
                  ? 'text-[var(--positive-ink)]'
                  : 'text-[var(--negative-ink)]'
            }`}
          >
            {view.netGex != null && isFinite(view.netGex) ? fmtGreek(view.netGex) : '—'}
          </div>
          <div className="mt-1.5 text-[11px] leading-tight text-[var(--text-secondary)]">
            {headerAnalytics
              ? `${headerAnalytics.positiveGamma ? 'Dealers stabilize · vol dampened' : 'Dealers amplify · vol expands'} · control ${headerAnalytics.controlScore}/100`
              : 'awaiting chain'}
          </div>
        </div>
        <div className="grid flex-1 grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
          {supportMetrics.map((m, i) => (
            <div
              key={`${m.label}-${i}`}
              className={`min-w-0 border-[var(--border-subtle)] px-4 py-3 ${i !== 0 ? 'border-l' : ''}`}
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{m.label}</div>
              <div className={`mt-1.5 slayer-num text-[17px] font-semibold leading-[1.1] [overflow-wrap:normal] [word-break:keep-all] ${SUPPORT_TONE_TEXT[m.tone || 'neutral']}`}>
                {m.value}
              </div>
              {m.sub ? <div className="mt-1 text-[11px] leading-tight text-[var(--text-secondary)]">{m.sub}</div> : null}
            </div>
          ))}
        </div>
      </div>

      {/* ============== ENGINE-VIEW SUB-TABS — the restored "other pages" ============== */}
      <ToggleGroup<'profile' | 'targets' | 'terminal'>
        ariaLabel="Engine view"
        size="sm"
        value={activeEngineView}
        onChange={setActiveEngineView}
        options={[
          { value: 'profile', label: 'Hedging Profile' },
          { value: 'targets', label: 'Ranked Targets' },
          { value: 'terminal', label: 'Live Terminal Flow' },
        ]}
      />

      {activeEngineView === 'profile' && (
      <div className="space-y-[var(--gap)]">
      {/* ============== ROW 1 — dealer net gamma map + dealer pressure matrix ============== */}
      {/* items-start: each panel sizes to its own content so a short matrix never
          stretches into an empty black interior next to the fixed-height gamma map. */}
      <div className="grid grid-cols-1 items-start gap-[var(--gap)] xl:grid-cols-12">
        <TerminalPanel
          className="xl:col-span-7"
          title={`Dealer Net Gamma Map · ${selectedAsset.ticker}`}
          subtitle="net dealer inventory & pin levels by strike"
          actions={<FeedChip feed={filteredProfile?.feed || profile?.feed} />}
        >
          <DealerFlowMap profile={filteredProfile || profile} decimals={selectedAsset.decimals} />
        </TerminalPanel>
        <TerminalPanel
          className="xl:col-span-5"
          title="Dealer Pressure Matrix"
          subtitle={expiryStatus}
          actions={expirySelector}
          padded={false}
        >
          <DataTable
            columns={matrixColumns}
            rows={matrixData.rows}
            rowKey={(r) => r.strike}
            className="max-h-[420px] border-0"
            rowClassName={(r) => (r.strike === matrixData.spotStrike ? 'bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)]' : undefined)}
            emptyState="Chain profile pending."
          />
        </TerminalPanel>
      </div>

      {/* ============== ROW 2 — order flow + key levels rail + options chain ============== */}
      {/* items-start: the short Order Flow and Key Levels Rail panels size to their
          own content instead of stretching to match the tall Options Chain table,
          eliminating the ~430px / ~290px empty interiors below their content. */}
      <div className="grid grid-cols-1 items-start gap-[var(--gap)] xl:grid-cols-12">
        <TerminalPanel className="xl:col-span-4" title="Order Flow" subtitle="cumulative tape delta · live regime">
          <div className="space-y-3">
            <div>
              <div className="slayer-subtitle">Cumulative Δ · session tape</div>
              <div
                className={`mt-1 slayer-num text-[26px] font-semibold leading-none ${
                  cumulativeDelta == null
                    ? 'text-[var(--text-faint)]'
                    : cumulativeDelta >= 0
                      ? 'text-[var(--positive-ink)]'
                      : 'text-[var(--negative-ink)]'
                }`}
              >
                {cumulativeDelta == null
                  ? 'No tape'
                  : `${cumulativeDelta >= 0 ? '+' : ''}${Math.round(cumulativeDelta).toLocaleString('en-US')}`}
              </div>
              <div className="mt-1 text-[11px] slayer-muted">
                {chartTape.length
                  ? `${chartTape.length.toLocaleString('en-US')} prints in window`
                  : 'streaming tape unavailable for this feed'}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="slayer-panel px-3 py-2">
                <div className="slayer-subtitle">Dealer Bias</div>
                <div
                  className={`mt-0.5 slayer-num text-[14px] font-semibold ${
                    biasTone === 'positive'
                      ? 'text-[var(--positive-ink)]'
                      : biasTone === 'negative'
                        ? 'text-[var(--negative-ink)]'
                        : 'text-[var(--text-primary)]'
                  }`}
                >
                  {(gauge.bias || '—').toUpperCase()}
                </div>
              </div>
              <div className="slayer-panel px-3 py-2">
                <div className="slayer-subtitle">Pressure</div>
                <div className="mt-0.5 slayer-num text-[14px] font-semibold text-[var(--text-primary)]">
                  {gauge.pressure != null ? `${gauge.pressure > 0 ? '+' : ''}${Math.round(gauge.pressure)}` : '—'}
                </div>
              </div>
            </div>
          </div>
        </TerminalPanel>

        <TerminalPanel className="xl:col-span-3" title="Key Levels Rail" subtitle="dealer levels vs spot" padded={false}>
          <DataTable
            columns={keyLevelColumns}
            rows={keyLevels}
            rowKey={(r) => r.id}
            className="border-0"
            emptyState="No dealer levels resolved yet."
          />
        </TerminalPanel>

        <TerminalPanel
          className="xl:col-span-5"
          title="Options Chain"
          subtitle={chainView.atmStrike != null ? `near-the-money · ATM ${fmtNum(chainView.atmStrike)}` : 'near-the-money'}
          padded={false}
        >
          <DataTable
            columns={chainColumns}
            rows={chainView.rows}
            rowKey={(r) => r.strike}
            className="border-0"
            rowClassName={(r) => (r.strike === chainView.atmStrike ? 'bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)]' : undefined)}
            emptyState={`This feed does not stream a per-contract chain for ${selectedAsset.ticker}.`}
          />
        </TerminalPanel>
      </div>

      {/* ============== ROW 3 — real-time multi-ticker flow + market notes ============== */}
      {/* items-start: Market Notes sizes to its small form + list instead of
          stretching to match a long multi-ticker Real-Time Flow list (was ~990px
          of empty interior). The Real-Time Flow table is capped + scrolls below. */}
      <div className="grid grid-cols-1 items-start gap-[var(--gap)] xl:grid-cols-12">
        <TerminalPanel className="xl:col-span-7" title="Real-Time Flow" subtitle="multi-ticker · live spots" padded={false}>
          <DataTable
            columns={multiTickerColumns}
            rows={multiTickerRows}
            rowKey={(r) => r.ticker}
            className="max-h-[420px] border-0"
            emptyState="Only one ticker is streaming right now."
          />
        </TerminalPanel>
        <TerminalPanel className="xl:col-span-5" title="Market Notes" subtitle="your session read">
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addUserNote(); }}
                placeholder="Add note…"
                className="slayer-control flex-1 text-[12px]"
                aria-label="Add a market note"
              />
              <button
                type="button"
                onClick={addUserNote}
                className="slayer-control cursor-pointer text-[11px] font-semibold uppercase tracking-[0.12em]"
              >
                Add
              </button>
            </div>
            {userNotes.length ? (
              <div className="max-h-[220px] space-y-2 overflow-y-auto">
                {userNotes.map((n, i) => (
                  <div key={i} className="flex gap-2 text-[12px]">
                    <span className="slayer-num shrink-0 text-[var(--text-muted)]">
                      {new Date(n.ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-[var(--text-secondary)]">{n.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[12px] slayer-muted">No notes yet — add your read on the flow.</div>
            )}
          </div>
        </TerminalPanel>
      </div>
      </div>
      )}

      {activeEngineView === 'targets' && (
        <IntradayTargetsView profile={filteredProfile || profile} ticker={selectedAsset.ticker} decimals={selectedAsset.decimals} />
      )}
      {activeEngineView === 'terminal' && (
        <PinpointTerminal ticker={selectedAsset.ticker} />
      )}
    </div>
  );
}

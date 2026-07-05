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
import PinpointChart from './PinpointChart';
import { Term } from './ui/Tooltip';
import { ToggleGroup } from './ui/ToggleGroup';
import { Popover } from './ui/Popover';
import { Sheet } from './ui/Sheet';
import { Badge } from './ui/Badge';
import { Switch } from './ui/Switch';
import { LiveValue } from './ui/LiveValue';
import { IntradayTargetsView } from './IntradayTargetsView';
import { DealerDynamicsPanel } from './DealerDynamicsPanel';
import { GexReadCard } from './GexReadCard';
import { TerminalReadCard } from './TerminalReadCard';
import { EdgeTrackRecord } from './EdgeTrackRecord';
import { LevelAlerts } from './LevelAlerts';
import { ZeroDtePanel } from './ZeroDtePanel';
import PinpointTerminal from './PinpointTerminal';
import { DealerFlowMap } from './DealerFlowMap';
import { PanelSkeleton } from './PanelSkeleton';
import { PinpointTrackButton } from './PinpointTrackButton';
import { SearchInput } from './ui/SearchInput';
import { DataStateBadge } from './ui/DataStateBadge';
import {
  Waves,
  Crosshair,
  Magnet,
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

// Row chrome for the expiry-ladder popover — a selected row glows accent, others hover.
const expiryRowCls = (active: boolean) =>
  `flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left transition-colors cursor-pointer ${
    active
      ? 'bg-[var(--accent-color)]/10 border-[var(--accent-color)]/40'
      : 'border-transparent hover:bg-[var(--surface-3)]'
  }`;

const fmtBn = (v: number) => `${v >= 0 ? '+' : '−'}$${(Math.abs(v / 1e9)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}B`;
const fmtGreek = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1e9) {
    return `${v >= 0 ? '+' : '−'}$${(abs / 1e9).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}B`;
  }
  return `${v >= 0 ? '+' : '−'}$${(abs / 1e6).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
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
      <div className={`flex items-center text-[9px] font-black tracking-widest uppercase pb-1.5 border-b mb-1.5 ${
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
            <div className={`w-[58px] sm:w-[72px] shrink-0 text-[10.5px] font-black tracking-[0.06em] font-mono pl-1 ${
              isSpot ? (isLight ? 'text-zinc-900 font-extrabold' : 'text-[#E5E5E5]') : isLight ? 'text-zinc-550' : 'text-zinc-400'
            }`}>
              {fmtNum(r.strike)}
              {isCallMax && (() => {
                const isFailing = r.strike < profile.spot;
                const isTesting = Math.abs(r.strike - profile.spot) / profile.spot < 0.005;
                const status = isFailing ? 'FAILING' : isTesting ? 'TESTING' : 'HOLDING';
                const sColor = isFailing ? 'text-[var(--danger)] bg-rose-500/10 border-rose-500/30' : isTesting ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' : 'text-[var(--success)] bg-[var(--success)]/10 border-black';
                return <span className={`ml-1.5 px-1 py-[1px] rounded-[2px] text-[9px] align-middle font-black border tracking-widest ${sColor}`}>{status}</span>;
              })()}
              {isPutMax && (() => {
                const isFailing = r.strike > profile.spot;
                const isTesting = Math.abs(r.strike - profile.spot) / profile.spot < 0.005;
                const status = isFailing ? 'FAILING' : isTesting ? 'TESTING' : 'HOLDING';
                const sColor = isFailing ? 'text-[var(--danger)] bg-rose-500/10 border-rose-500/30' : isTesting ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' : 'text-sky-400 bg-sky-500/10 border-sky-500/30';
                return <span className={`ml-1.5 px-1 py-[1px] rounded-[2px] text-[9px] align-middle font-black border tracking-widest ${sColor}`}>{status}</span>;
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
                    <span className={`font-black tracking-widest uppercase text-[8px] ${
                      isLight 
                        ? type === 'gex' ? 'text-rose-600' : type === 'dex' ? 'text-amber-600' : 'text-fuchsia-600'
                        : type === 'gex' ? 'text-[var(--danger)]' : type === 'dex' ? 'text-amber-400' : 'text-fuchsia-400'
                    }`}>PUT {typeUpper} OVERLAY</span>
                    <span className={isLight ? 'text-[var(--success)]' : 'text-zinc-650'}>|</span>
                    <span className={`font-bold ${isLight ? 'text-zinc-900' : 'text-[#E5E5E5]'}`}>STRIKE {fmtNum(r.strike)}</span>
                  </div>
                  <div className="space-y-0.5 text-left">
                    <div>{typeUpper}: <span className={`font-extrabold ${
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
                    <span className={`font-black tracking-widest uppercase text-[8px] ${
                      isLight
                        ? type === 'gex' ? 'text-[var(--success)]' : type === 'dex' ? 'text-sky-600' : 'text-indigo-600'
                        : type === 'gex' ? 'text-[var(--success)]' : type === 'dex' ? 'text-sky-400' : 'text-indigo-400'
                    }`}>CALL {typeUpper} OVERLAY</span>
                    <span className={isLight ? 'text-[var(--success)]' : 'text-zinc-650'}>|</span>
                    <span className={`font-bold ${isLight ? 'text-zinc-900' : 'text-[#E5E5E5]'}`}>STRIKE {fmtNum(r.strike)}</span>
                  </div>
                  <div className="space-y-0.5 text-left">
                    <div>{typeUpper}: <span className={`font-extrabold ${
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
            <div className={`absolute left-1/2 -translate-x-1/2 -top-3 px-2 py-0.5 rounded-xs font-mono font-black text-[9px] uppercase shadow-sm flex items-center gap-1 border z-30 ${
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

  if (!serverState || !profile || !profile.strikes || !gauge || !disp) {
    return (
      <div
        className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 space-y-5"
        id="dealerflow-data-pending"
        role="status"
        aria-busy="true"
        aria-label="Loading dealer flow data"
      >
        <div className="flex flex-col items-center justify-center text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center">
            <Waves className="w-6 h-6 text-[var(--success)]" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-[11px] font-black tracking-widest text-[var(--text-primary)] uppercase font-sans">
              LOADING DEALER FLOW DATA
            </h2>
            <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-widest leading-relaxed max-w-sm mx-auto">
              Loading hedging profiles, order flow, and price zones. Select any strike or option type to start the feed.
            </p>
          </div>
          <div className="flex items-center gap-2 justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning)] inline-block animate-pulse" />
            <span className="text-[8px] font-mono tracking-widest text-[var(--text-tertiary)] font-bold uppercase">
              AWAITING FIRST DATA FRAME...
            </span>
          </div>
        </div>

        {/* Skeleton mirroring the GEX / DEX / VEX 3-column profile layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <PanelSkeleton label="Gamma Exposure (GEX)" rows={5} />
          <PanelSkeleton label="Delta Exposure (DEX)" rows={5} />
          <PanelSkeleton label="Vega Exposure (VEX)" rows={5} />
        </div>
      </div>
    );
  }

  // Shared expiry-selector chrome — rendered inside a desktop Popover or a mobile Sheet.
  const expiryTriggerInner = (
    <>
      <CalendarClock className="w-3.5 h-3.5 text-[var(--accent-color)] shrink-0" />
      <div className="flex flex-col leading-none gap-0.5 min-w-0">
        <span className="text-[7.5px] font-black uppercase tracking-widest text-[var(--text-tertiary)]">Selected Expiry</span>
        <span className="text-[11px] font-black tabular-nums text-[var(--text-primary)] truncate">
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
  const expiryTriggerCls = 'flex items-center gap-2.5 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-3)] px-3 py-2 text-left transition-colors hover:border-[var(--accent-color)]/50 hover:bg-[var(--surface-2)] cursor-pointer';

  const expiryLadder = (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2.5">
        <span className="font-mono text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Expiry Ladder</span>
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
              <span className={`w-1 h-4 rounded-full shrink-0 ${expiryTab === 'aggregated' ? 'bg-[var(--success)]' : 'bg-[var(--text-tertiary)]'}`} />
              <span className="flex flex-col leading-none gap-0.5 text-left">
                <span className="text-[11px] font-black text-[var(--text-primary)]">All Dates</span>
                <span className="text-[7.5px] font-black uppercase tracking-widest text-[var(--text-tertiary)]">Master profile · total gravity</span>
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
                <span className="text-[12px] font-black tabular-nums text-[var(--text-primary)]">{item.date}</span>
                <span className="text-[8px] font-black uppercase text-[var(--text-tertiary)] bg-[var(--surface-2)] px-1 rounded">{item.label}</span>
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

  return (
    <div className={`w-full tabular-data ${activeEngineView === 'terminal' ? 'h-full flex flex-col min-h-0' : 'space-y-6'}`} id="dealerflow-main-workspace-view">
      {/* ============== HEADER STRIP ============== */}
      <div className={`${theme.cardBg} rounded-lg px-3 py-3 sm:px-5 sm:py-4 flex flex-col gap-3`} id="dealerflow-header-strip">
        {/* Row 1: identity + Track. flex-wrap so the data-state badge and the Track control
            never collide (they overlapped on mobile in the single-row layout). */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${theme.headerIconBg}`}>
              <Waves className={`w-4.5 h-4.5 ${theme.iconColor}`} />
            </div>
            <h1 className="text-sm font-black tracking-widest text-[var(--text-primary)] uppercase font-sans truncate">
              Pinpoint GEX · {selectedAsset.ticker}
            </h1>
            <FeedChip feed={filteredProfile?.feed || profile?.feed} />
            <span className="hidden sm:inline text-[9px] font-mono font-black text-[var(--text-tertiary)] uppercase tracking-widest shrink-0">{selectedTimeframe}</span>
          </div>
          <PinpointTrackButton
            spot={filteredProfile?.spot}
            gammaFlip={filteredProfile?.gammaFlip}
            feedLive={(filteredProfile?.feed || profile?.feed) === 'LIVE_TRADIER' || (filteredProfile?.feed || profile?.feed) === 'LIVE_POLYGON'}
          />
        </div>

        {/* Row 2: dealer-level metric rail */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {([
            { label: 'Net GEX', value: filteredProfile ? fmtBn(filteredProfile.netGex) : '—', raw: filteredProfile?.netGex, mode: 'directional', tone: (filteredProfile?.netGex ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)', term: 'netGex' },
            { label: 'Call Wall', value: filteredProfile?.callWall?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? '—', raw: filteredProfile?.callWall, mode: 'neutral', tone: 'var(--success)', term: 'callWall' },
            { label: 'Put Wall', value: filteredProfile?.putWall?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? '—', raw: filteredProfile?.putWall, mode: 'neutral', tone: 'var(--danger)', term: 'putWall' },
            { label: 'γ-Flip', value: filteredProfile?.gammaFlip?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? '—', raw: filteredProfile?.gammaFlip, mode: 'neutral', tone: 'var(--warning)', term: 'gammaFlip' },
            { label: 'Pin Magnet', value: filteredProfile?.magnet?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? '—', raw: filteredProfile?.magnet, mode: 'neutral', tone: 'var(--info)', def: 'Strike acting as the strongest price magnet/pin into expiration.' },
            { label: 'Dist to Flip', value: filteredProfile?.gammaFlip ? `${Math.abs(filteredProfile.spot - filteredProfile.gammaFlip).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}` : '—', raw: filteredProfile?.gammaFlip ? Math.abs(filteredProfile.spot - filteredProfile.gammaFlip) : undefined, mode: 'neutral', tone: 'var(--text-primary)', def: 'Distance from spot to the gamma-flip level — how far price must travel to change the dealer-hedging regime.' },
          ] as Array<{ label: string; value: string; raw?: number; mode: 'directional' | 'neutral'; tone: string; term?: string; def?: string }>).map(card => (
            <div key={card.label} className="relative overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] rounded-md pl-3 pr-3 py-1.5 min-w-0 lg:min-w-[88px] shrink-0" id={`card-${card.label.toLowerCase().replace(/\s+/g, '-')}`}>
              {/* tone spine — each level carries its semantic colour as a left rail (instrument-panel read) */}
              <span className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: card.tone, opacity: 0.75 }} />
              <div className="text-[8px] font-black tracking-widest text-[var(--text-tertiary)] uppercase truncate">
                {card.term ? <Term id={card.term as any}>{card.label}</Term> : card.def ? <Term def={card.def}>{card.label}</Term> : card.label}
              </div>
              <div className="text-[13px] sm:text-[14px] font-mono font-bold tabular-nums truncate leading-tight" style={{ color: card.tone }}>
                {card.raw != null
                  ? <LiveValue value={card.raw} mode={card.mode} format={() => card.value} />
                  : card.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ============== SUB-TABS & SEARCH ============== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-0.5" id="dealerflow-subtabs-bar">
        <div className="flex flex-nowrap overflow-x-auto scrollbar-none gap-2.5 justify-start items-center">
          <ToggleGroup<'profile' | 'targets' | 'terminal'>
            ariaLabel="Engine view"
            size="sm"
            value={activeEngineView}
            onChange={setActiveEngineView}
            options={[
              { value: 'profile', label: 'Hedging Profile', icon: <Layers className="text-[var(--accent-color)]" /> },
              { value: 'targets', label: 'Ranked Targets', icon: <Target className="text-[var(--danger)]" /> },
              { value: 'terminal', label: 'Live Terminal Flow', icon: <Activity className="text-[var(--accent-color)]" /> },
            ]}
          />
        </div>

        {/* Global Market Search */}
        <div className="relative w-full sm:w-[360px] shrink-0 group">
          <SearchInput
            ariaLabel="Search ticker or company"
            value={searchQuery}
            onChange={(v) => { setSearchQuery(v); setShowSearch(true); }}
            onFocus={() => setShowSearch(true)}
            onClick={() => setShowSearch(true)}
            onClear={() => { setSearchQuery(''); setShowSearch(false); }}
            onKeyDown={(e) => { if (e.key === 'Escape') { setShowSearch(false); (e.target as HTMLInputElement).blur(); } }}
            placeholder="Search ticker or company…"
            variant="accent"
            pulseDot
            className="w-full cursor-text"
          />

          {showSearch && (
            <>
              <div 
                className="fixed inset-0 z-[55]"
                onClick={() => setShowSearch(false)}
              />
              <div role="listbox" aria-label="Search securities" className="absolute top-full mt-2 left-0 sm:left-auto right-0 w-full sm:w-[480px] max-w-[calc(100vw-1.5rem)] bg-[var(--surface)] border border-[var(--accent-color)]/40 shadow-[0_0_30px_rgba(0,0,0,0.9)] z-[60] max-h-[440px] overflow-y-auto python-scrollbar origin-top-right animate-in fade-in zoom-in-95 duration-150">
                <div className="sticky top-0 bg-[var(--surface)]/95 backdrop-blur-sm border-b border-[var(--accent-color)]/20 px-3 py-2 z-10 flex justify-between items-center">
                  <span className="text-[9px] font-mono text-[var(--accent-color)] tracking-widest uppercase opacity-80">Search securities</span>
                </div>
                {(() => {
                  const query = searchQuery.toLowerCase().trim();
                  
                  if (!query) {
                    const categories = [
                      { name: 'INDEXES & MACRO', filter: (a: any) => ['SPX','QQQ','NDX','DJX','SOX','XSP','VIX','RUT'].includes(a.ticker) },
                      { name: 'ETFS & FUNDS', filter: (a: any) => a.type === 'ETFS' && !['SPX','QQQ'].includes(a.ticker) },
                      { name: 'BIG TECH & AI', filter: (a: any) => ['AAPL','MSFT','GOOGL','AMZN','META','TSLA','NVDA','AMD','AVGO','PLTR', 'TSM', 'ASML', 'ARM'].includes(a.ticker) },
                      { name: 'SOFTWARE & CLOUD', filter: (a: any) => ['SNOW','CRWD','PANW','CRM','NOW','SHOP','MSTR'].includes(a.ticker) },
                      { name: 'MEDICINE & HEALTH', filter: (a: any) => ['LLY','NVO','JNJ','UNH'].includes(a.ticker) },
                      { name: 'FINANCE & BANKING', filter: (a: any) => ['JPM','BAC','WFC','V','PYPL','SQ','HOOD'].includes(a.ticker) }
                    ];

                    return (
                      <div className="pb-2">
                        {categories.map(cat => {
                          const assets = ASSET_LIST.filter(cat.filter);
                          if (!assets.length) return null;
                          return (
                            <div key={cat.name} className="mb-0">
                               <div className="px-3 py-1.5 bg-[var(--accent-color)]/5 border-y border-[var(--accent-color)]/10 mt-2 first:mt-0">
                                 <span className="text-[10px] font-mono text-[var(--accent-color)] tracking-widest font-bold">{cat.name}</span>
                               </div>
                               <div className="px-2 py-1.5 grid grid-cols-2 gap-1.5">
                                 {assets.map(asset => (
                                    <div
                                       key={asset.ticker}
                                       onClick={() => { 
                                         setSelectedAsset(asset);
                                         setSearchQuery('');
                                         setShowSearch(false);
                                       }}
                                       className="px-2 py-2 hover:bg-[var(--accent-color)]/10 cursor-pointer border border-[var(--accent-color)]/5 hover:border-[var(--accent-color)]/30 transition-colors flex flex-col group rounded-sm"
                                    >
                                        <div className="flex justify-between items-center mb-0.5">
                                          <span className="text-[11px] font-mono font-bold text-zinc-300 group-hover:text-[var(--accent-color)] transition-colors">{asset.ticker}</span>
                                          <span className="text-[8px] font-mono text-[var(--accent-color)]/40 group-hover:text-[var(--accent-color)]/70 transition-colors">{asset.type}</span>
                                        </div>
                                        <span className="text-[9px] text-zinc-500 truncate font-sans">{asset.name}</span>
                                    </div>
                                 ))}
                               </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }

                  const filtered = ASSET_LIST.filter(a => a.ticker.toLowerCase().includes(query) || a.name.toLowerCase().includes(query));
                  const exactMatch = ASSET_LIST.find(a => a.ticker.toLowerCase() === query);
                  
                  return (
                    <div className="py-1">
                      {filtered.map(asset => (
                        <div
                          key={asset.ticker}
                          className="flex items-center justify-between px-3 py-2.5 hover:bg-[var(--accent-color)]/10 cursor-pointer transition-colors border-b border-[var(--accent-color)]/5"
                          onClick={() => {
                            setSelectedAsset(asset);
                            setSearchQuery('');
                            setShowSearch(false);
                          }}
                        >
                          <div className="flex flex-col">
                            <span className="text-[12px] font-mono font-bold text-[var(--accent-color)]">{asset.ticker}</span>
                            <span className="text-[10px] font-sans text-zinc-500">{asset.name}</span>
                          </div>
                          <span className="text-[8px] font-mono tracking-widest text-[var(--accent-color)]/70">
                            {asset.type}
                          </span>
                        </div>
                      ))}
                      
                      {query && !exactMatch && (
                        <div
                          className="flex items-center justify-between px-3 py-2.5 hover:bg-[var(--accent-color)]/20 cursor-pointer transition-colors border-b border-[var(--accent-color)]/10"
                          onClick={() => {
                            const t = query.toUpperCase();
                            const newAsset = {
                              key: t,
                              ticker: t,
                              name: `${t} Asset`,
                              type: 'STOCKS',
                              defaultPrice: 150.00,
                              decimals: 2,
                              spread: 0.05,
                              volatility: 1.0,
                              unit: 'USD',
                              forecastScale: 0.15,
                              stabilityMax: 0.06,
                              optionsStyle: 'weekly'
                            };
                            setSelectedAsset(newAsset as any);
                            setSearchQuery('');
                            setShowSearch(false);
                          }}
                        >
                          <div className="flex flex-col">
                            <span className="text-[12px] font-mono font-bold text-[var(--accent-color)]">OPEN [ {query.toUpperCase()} ]</span>
                            <span className="text-[10px] font-sans text-[var(--accent-color)]/70">Model profile — resolves to live chain if your feed covers this symbol</span>
                          </div>
                          <span className="text-[8px] font-mono tracking-widest text-[var(--info)] border border-[var(--info)]/40 bg-[var(--info)]/10 px-1 py-0.5">
                            Model
                          </span>
                        </div>
                      )}
                      
                      {filtered.length === 0 && (
                        <div className="px-4 py-6 text-center">
                          <Search className="w-5 h-5 text-[var(--accent-color)]/50 mx-auto mb-2" />
                          <div className="text-[10px] uppercase font-mono tracking-widest text-[var(--accent-color)]/50">Type a ticker to search</div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      </div>

      {activeEngineView === 'profile' ? (
        <>
          {/* ============== PRE-CALCULATED READ (the conclusion, up top) ============== */}
          {(filteredProfile || profile) && (
            <TerminalReadCard
              profile={filteredProfile || profile}
              candles={chartCandles}
              ticker={selectedAsset.ticker}
              decimals={selectedAsset.decimals}
              isLive={!!serverState?.data_source && serverState.data_source !== 'SANDBOX_SYNTHETIC'}
            />
          )}

          {/* Edge track record (proves the dealer read's historical hit-rate; self-hides until
              outcomes resolve) + level-cross alerts — both live off the same GEX profile + spot. */}
          {(filteredProfile || profile) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
              <EdgeTrackRecord
                profile={filteredProfile || profile}
                candles={chartCandles}
                ticker={selectedAsset.ticker}
                provenance={serverState?.data_source && serverState.data_source !== 'SANDBOX_SYNTHETIC' ? 'live' : 'model'}
              />
              <LevelAlerts
                ticker={selectedAsset.ticker}
                decimals={selectedAsset.decimals}
                spot={(filteredProfile || profile)?.spot}
                callWall={(filteredProfile || profile)?.callWall}
                putWall={(filteredProfile || profile)?.putWall}
                gammaFlip={(filteredProfile || profile)?.gammaFlip}
                magnet={(filteredProfile || profile)?.magnet}
              />
            </div>
          )}

          {/* ============== GEX PAGE HEADER (derived from real GEX profile) ============== */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-2 font-mono">
            <div className="flex flex-col p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] justify-center">
              <span className="text-[10px] uppercase tracking-widest text-[var(--text-tertiary)] font-bold mb-1">Asset</span>
              <span className="text-sm font-black text-[var(--text-primary)] tabular-nums">{selectedAsset.ticker} <span className="text-[var(--text-tertiary)] font-medium">(<LiveValue value={profile?.spot} format={(v) => (v as number).toLocaleString(undefined, { maximumFractionDigits: 0 })} />)</span></span>
            </div>
            <div className="flex flex-col p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] justify-center">
              <span className="text-[10px] uppercase tracking-widest text-[var(--text-tertiary)] font-bold mb-1">Regime</span>
              <span className={`text-sm font-black ${headerAnalytics?.positiveGamma ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>{headerAnalytics?.regime ?? '—'}</span>
            </div>
            <div className="flex flex-col p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] justify-center">
              <span className="text-[10px] uppercase tracking-widest text-[var(--text-tertiary)] font-bold mb-1">Pin Risk</span>
              <span className="text-sm font-black text-[var(--warning)] tabular-nums">{headerAnalytics?.pinRiskPct != null ? `${headerAnalytics.pinRiskPct}%` : '—'}</span>
            </div>
            <div className="flex flex-col p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] justify-center">
              <span className="text-[10px] uppercase tracking-widest text-[var(--text-tertiary)] font-bold mb-1">Vol Risk</span>
              <span className={`text-sm font-black ${headerAnalytics?.volRisk === 'LOW' ? 'text-[var(--info)]' : 'text-[var(--danger)]'}`}>{headerAnalytics?.volRisk ?? '—'}</span>
            </div>
            <div className="flex flex-col p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] justify-center">
              <span className="text-[10px] uppercase tracking-widest text-[var(--text-tertiary)] font-bold mb-1">Dealer Control</span>
              <span className={`text-sm font-black ${headerAnalytics?.dealerControl === 'HIGH' ? 'text-[var(--success)]' : 'text-[var(--warning)]'}`}>{headerAnalytics?.dealerControl ?? '—'}</span>
            </div>
            {/* Market Control Score */}
            <div className="flex flex-col p-3 rounded-lg border border-[var(--accent-color)]/30 bg-[var(--accent-color)]/10 justify-center">
              <span className="text-[10px] uppercase tracking-widest text-[var(--accent-color)] font-bold mb-1">Market Control</span>
              <div className="flex items-end gap-2">
                <span className="text-sm font-black text-[var(--text-primary)] tabular-nums"><LiveValue value={headerAnalytics?.controlScore} />{<span className="text-[10px] text-[var(--text-tertiary)] font-medium">/100</span>}</span>
              </div>
            </div>
          </div>

          {/* ============== TRADER INTENT EXPIRY CONTROLLER ============== */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg" id="trader-intent-expiries-panel">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-[10px] font-black uppercase text-[var(--text-secondary)] tracking-widest leading-none flex items-center gap-2 flex-wrap">
                Expiry
                <Badge tone="success" size="sm">{selectedAsset.ticker} PIPELINE</Badge>
                {isMultiExpiry ? (
                  <Badge tone="accent" size="sm" dot pulse>{activeExpiries.length} {activeExpiries.length === 1 ? 'EXPIRY' : 'EXPIRIES'}</Badge>
                ) : expiryTab !== 'aggregated' ? (
                  <Badge tone="warning" size="sm" title="Server delivers one aggregated chain; the per-expiry split shown when a single expiry is selected is a deterministic model, not a per-expiration feed.">MODEL SPLIT</Badge>
                ) : null}
              </span>
              <span className="text-[11px] font-medium text-[var(--text-tertiary)]">Calendar is real; per-expiry hedging split is modeled from the aggregated chain (use All Dates for the live profile)</span>
            </div>

            {/* Compact expiry selector — full ladder + multi-expiry aggregation lives in a Popover
                on desktop, a bottom Sheet on phones (a 300px popover is too cramped to scan there). */}
            {isNarrowExpiry ? (
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
            )}
          </div>

          {/* ============== DEALER FLOW MAP (Hero Chart) ============== */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-sm p-3 sm:p-5 shadow-sm" id="dealerflow-map-panel">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[var(--success)] opacity-80" />
                <div className="flex flex-col leading-none">
                  <span className="text-[11px] font-bold tracking-[0.15em] uppercase text-[var(--text-primary)]">
                    Dealer Net Gamma Map
                  </span>
                  <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.2em] block mt-1.5 font-semibold">
                    inventory & pin levels by strike
                  </span>
                </div>
              </div>

              {/* Read-only "what's shown" status — the expiry Popover/Sheet up top is the single
                  control; this only reflects the current selection so the chart header has context. */}
              <div className="flex items-center gap-2" id="gamma-map-expiry-status">
                <span className="text-[8px] font-black uppercase tracking-widest text-[var(--text-tertiary)] hidden md:inline">Showing</span>
                <Badge tone={isMultiExpiry ? 'accent' : expiryTab === 'aggregated' ? 'success' : 'warning'} size="sm">
                  {isMultiExpiry
                    ? `${activeExpiries.length} ${activeExpiries.length === 1 ? 'EXPIRY' : 'EXPIRIES'}`
                    : expiryTab === 'aggregated'
                      ? 'ALL DATES'
                      : (() => { const t = tickerExpirations.find(x => x.id === expiryTab); return t ? `${t.date} · ${t.dteDays}DTE` : 'SELECT'; })()}
                </Badge>
              </div>
            </div>
            <DealerFlowMap profile={filteredProfile || profile} decimals={selectedAsset.decimals} />
          </div>

          {/* ============== MAIN GRID (THE CHOSEN ORIGINAL 3-COLUMN LAYOUT) ============== */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5" id="dealerflow-main-grid">
            
            {/* GEX PROFILE */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 sm:p-5 flex flex-col justify-between" id="gex-profile-chart-panel">
              <div>
                <div className="flex items-center gap-2 text-[9px] font-black tracking-widest uppercase mb-4 text-[var(--success)]">
                  <Layers className="w-3.5 h-3.5" />
                  <span className="text-[var(--text-secondary)]">Gamma Exposure (GEX)</span>
                  <span className="text-[var(--text-tertiary)] font-normal normal-case tracking-normal">· $ per 1% move</span>
                </div>
                <ExposureProfileChart profile={filteredProfile || profile} decimals={selectedAsset.decimals} type="gex" />
              </div>

              {/* GEX footer */}
              {(filteredProfile || profile) && (
                <div className="mt-4 pt-3 border-t border-[var(--border)] grid grid-cols-3 gap-2 text-center text-[10px] font-mono leading-none border-dashed border-[var(--border)]" id="gex-profile-chart-oi-footer">
                  <div>
                    <div className="text-[8px] text-[var(--text-tertiary)] font-black uppercase tracking-widest mb-1">Call GEX</div>
                    <div className="text-[10px] font-mono text-[var(--success)] font-bold">
                      {fmtGreek((filteredProfile || profile).strikes.map((cur: any) => cur.callGex || 0).reduce((acc: number, v: number) => acc + v, 0))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[8px] text-[var(--text-tertiary)] font-black uppercase tracking-widest mb-1">Put GEX</div>
                    <div className="text-[10px] font-mono text-[var(--danger)] font-bold">
                      {fmtGreek((filteredProfile || profile).strikes.map((cur: any) => cur.putGex || 0).reduce((acc: number, v: number) => acc + v, 0))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[8px] text-[var(--text-tertiary)] font-black uppercase tracking-widest mb-1">Net GEX</div>
                    <div className="text-[10px] font-mono text-[var(--text-primary)] font-bold">
                      {fmtGreek((filteredProfile || profile).netGex)}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* DEX PROFILE */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 sm:p-5 flex flex-col justify-between" id="dex-profile-chart-panel">
              <div>
                <div className="flex items-center gap-2 text-[9px] font-black tracking-widest uppercase mb-4 text-[var(--accent-color)]">
                  <Waves className="w-3.5 h-3.5" />
                  <span className="text-[var(--text-secondary)]">Delta Exposure (DEX)</span>
                  <span className="text-[var(--text-tertiary)] font-normal normal-case tracking-normal">· $ per 1% spot move</span>
                </div>
                <ExposureProfileChart profile={filteredProfile || profile} decimals={selectedAsset.decimals} type="dex" />
              </div>

              {/* DEX footer */}
              {(filteredProfile || profile) && (
                <div className="mt-4 pt-3 border-t border-[var(--border)] grid grid-cols-3 gap-2 text-center text-[10px] font-mono leading-none border-dashed border-[var(--border)]" id="dex-profile-chart-footer">
                  <div>
                    <div className="text-[8px] text-[var(--text-tertiary)] font-black uppercase tracking-widest mb-1">Call DEX</div>
                    <div className="text-[10px] font-mono text-sky-400 font-bold">
                      {fmtGreek((filteredProfile || profile).strikes.map((cur: any) => cur.callDex || 0).reduce((acc: number, v: number) => acc + v, 0))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[8px] text-[var(--text-tertiary)] font-black uppercase tracking-widest mb-1">Put DEX</div>
                    <div className="text-[10px] font-mono text-[var(--danger)] font-bold">
                      {fmtGreek((filteredProfile || profile).strikes.map((cur: any) => cur.putDex || 0).reduce((acc: number, v: number) => acc + v, 0))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[8px] text-[var(--text-tertiary)] font-black uppercase tracking-widest mb-1">Net DEX</div>
                    <div className="text-[10px] font-mono text-[var(--text-primary)] font-bold">
                      {fmtGreek((filteredProfile || profile).strikes.map((cur: any) => (cur.callDex || 0) + (cur.putDex || 0)).reduce((acc: number, v: number) => acc + v, 0))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* VEX PROFILE */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 sm:p-5 flex flex-col justify-between" id="vex-profile-chart-panel">
              <div>
                <div className="flex items-center gap-2 text-[9px] font-black tracking-widest uppercase mb-4 text-[var(--accent-color)]">
                  <Zap className="w-3.5 h-3.5" />
                  <span className="text-[var(--text-secondary)]">Vega Exposure (VEX)</span>
                  <span className="text-[var(--text-tertiary)] font-normal normal-case tracking-normal">· $ per 1% vol shift</span>
                </div>
                <ExposureProfileChart profile={filteredProfile || profile} decimals={selectedAsset.decimals} type="vex" />
              </div>

              {/* VEX footer */}
              {(filteredProfile || profile) && (
                <div className="mt-4 pt-3 border-t border-[var(--border)] grid grid-cols-3 gap-2 text-center text-[10px] font-mono leading-none border-dashed border-[var(--border)]" id="vex-profile-chart-footer">
                  <div>
                    <div className="text-[8px] text-[var(--text-tertiary)] font-black uppercase tracking-widest mb-1">Call VEX</div>
                    <div className="text-[10px] font-mono text-indigo-400 font-bold">
                      {fmtGreek((filteredProfile || profile).strikes.map((cur: any) => cur.callVex || 0).reduce((acc: number, v: number) => acc + v, 0))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[8px] text-[var(--text-tertiary)] font-black uppercase tracking-widest mb-1">Put VEX</div>
                    <div className="text-[10px] font-mono text-[var(--danger)] font-bold">
                      {fmtGreek((filteredProfile || profile).strikes.map((cur: any) => cur.putVex || 0).reduce((acc: number, v: number) => acc + v, 0))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[8px] text-[var(--text-tertiary)] font-black uppercase tracking-widest mb-1">Net VEX</div>
                    <div className="text-[10px] font-mono text-[var(--text-primary)] font-bold">
                      {fmtGreek((filteredProfile || profile).strikes.map((cur: any) => (cur.callVex || 0) + (cur.putVex || 0)).reduce((acc: number, v: number) => acc + v, 0))}
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Supportive Side-Insights Row containing GexReadCard and ZeroDtePanel placed beautifully beneath the profiles */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5" id="hedging-side-insights">
            <GexReadCard />
            <ZeroDtePanel />
          </div>

          {/* ============== DEALER DYNAMICS (Supplementary details for profile view) ============== */}
          <DealerDynamicsPanel />

          {/* ============== FULL WIDTH CHART AT BOTTOM ============== */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 sm:p-5 flex flex-col w-full overflow-hidden" id="displacement-overlay-chart-panel" style={{ minHeight: '380px' }}>
            <div className="flex items-center justify-between mb-3 shrink-0">
              <div className="flex items-center gap-2 text-[9px] font-black tracking-widest text-[var(--text-secondary)] uppercase">
                <ShieldAlert className="w-3.5 h-3.5 text-[var(--danger)]" />
                Price Action — Supply/Demand & Imbalance Overlay
              </div>
              <FeedChip feed={serverState?.candle_feed} />
            </div>
            <div className="flex-1 w-full h-[320px]">
              <PinpointChart ticker={selectedAsset.ticker} timeframe={selectedTimeframe as any} height={300} />
            </div>
          </div>
        </>
      ) : activeEngineView === 'targets' ? (
        <IntradayTargetsView profile={filteredProfile || profile} ticker={selectedAsset.ticker} decimals={selectedAsset.decimals} />
      ) : (
        <PinpointTerminal ticker={selectedAsset.ticker} />
      )}
    </div>
  );
}

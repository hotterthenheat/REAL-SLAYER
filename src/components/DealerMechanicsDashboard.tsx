import { lazy, Suspense, useMemo, useState } from 'react';
import { useContractStore } from '../lib/store';
import { Boxes, Waves, Wind, Timer, Layers, RefreshCw, Zap } from 'lucide-react';
import { LiveValue } from './ui/LiveValue';
import { exposureSurfaceGrid, ivSurfaceGrid, strikeDomain, ivStrikeDomain, tenorDomainDays, type ExposureField, type SurfaceProfile } from './quant/dealerSurfaces';
import type { SurfaceMarker, DataState } from './quant/QuantSurface3D';

// Directive-08 renderer is lazy so three.js stays off the initial bundle and only one
// WebGL context is ever live (the active surface).
const QuantSurface3D = lazy(() => import('./quant/QuantSurface3D'));

interface Props {
  profile?: SurfaceProfile;
  ticker?: string;
  decimals?: number;
  /** Encodes the current expiry selection so the surfaces recompute when it changes. */
  selectionKey?: string;
  /** True when the profile is the live streamed chain (drives the LIVE/MODEL data pill). */
  live?: boolean;
}

type SurfaceKey = 'gamma' | 'vanna' | 'charm' | 'iv';

// Every surface is a real per-strike dealer exposure (or the IV surface) — no decorative
// or duplicated renders. `field` names the real chain column the exposure surfaces plot.
const SURFACES: { key: SurfaceKey; label: string; icon: typeof Boxes; field?: ExposureField; axes: [string, string, string]; ramp: 'diverging' | 'sequential'; blurb: string }[] = [
  { key: 'gamma', label: 'Gamma', icon: Boxes, field: 'netGex', axes: ['strike', 'tenor', 'net γ'], ramp: 'diverging', blurb: 'Net dealer gamma by strike × expiry (real netGex). Red = short-gamma (dealers amplify moves); green = long-gamma (dealers dampen). The slate saddle is the γ-flip.' },
  { key: 'vanna', label: 'Vanna', icon: Wind, field: 'netVex', axes: ['strike', 'tenor', 'net vanna'], ramp: 'diverging', blurb: 'Net dealer vanna by strike × expiry (real netVex; term structure modelled √t). Where a vol move forces delta re-hedging — the ridge is where a vol spike moves price hardest.' },
  { key: 'charm', label: 'Charm', icon: Timer, field: 'charmEx', axes: ['strike', 'tenor', 'net charm'], ramp: 'diverging', blurb: 'Net dealer charm by strike × expiry (real charmEx; accelerates near-dated). Delta decay per day — where dealer hedges drift as time passes, strongest into expiry.' },
  { key: 'iv', label: 'Vol Surface', icon: Layers, axes: ['moneyness', 'tenor', 'IV'], ramp: 'sequential', blurb: 'Implied vol by moneyness × tenor. Blue = calm, red = stressed. Put-side lift is skew; the U across strikes is the smile.' },
];

function fmtGamma(v: number | undefined): string {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}

/**
 * Dealer Mechanics — brutalist WebGL exposure geometry (Directive 08). One live GPU
 * context fronting a switch across four real surfaces — dealer Gamma, Vanna, and Charm
 * (each a real per-strike exposure by strike × tenor) plus the IV surface — over a clean,
 * responsive strip of the live dealer-physics scalars. Every surface is mathematically
 * defined from chain data; nothing is decorative. Raw plot on the data-status palette.
 */
export function DealerMechanicsDashboard({ profile: external, ticker, decimals = 2, selectionKey = '', live = false }: Props) {
  const serverState = useContractStore((s) => s.serverState);
  const selectedAsset = useContractStore((s) => s.selectedAsset);
  const tkr = ticker ?? selectedAsset?.ticker ?? '—';
  // Honor the profile the parent hands us (it has already resolved expiry-filtered vs
  // aggregate) — falling back to the store only when no prop is supplied. Re-reading the
  // store's unfiltered aggregate here would make these tiles contradict the rest of the
  // page the moment a single expiry is selected.
  const profile: SurfaceProfile | undefined = external ?? (serverState?.gex_profile as SurfaceProfile);

  const [surface, setSurface] = useState<SurfaceKey>('gamma');
  const [refreshKey, setRefreshKey] = useState(0);
  const active = SURFACES.find((s) => s.key === surface)!;

  // Structural snapshots — recomputed only on ticker / manual refresh / when the chain
  // first becomes ready, NEVER every tick, so the WebGL scene is not torn down and
  // rebuilt at 1Hz. `dataReady` flips false→true once (when gex_profile lands), which
  // triggers exactly one recompute off the live data, then stays stable.
  const dataReady = !!(profile?.spot && profile.spot > 0 && (profile.strikes?.length ?? 0) >= 4);
  // The active exposure grid (gamma/vanna/charm) or the IV grid — computed only for the
  // surface on screen, snapshot-stable so the WebGL scene isn't rebuilt every tick.
  const grid = useMemo(
    () => (active.field ? exposureSurfaceGrid(profile, active.field) : ivSurfaceGrid(profile)),
    [tkr, refreshKey, dataReady, selectionKey, surface], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── Spatial context handed to the renderer: real strike/tenor domains, market walls,
  // ATM/front reference slices, per-surface value format, and a clean data-state pill. ──
  const isIv = !active.field;
  const xDomain = isIv ? ivStrikeDomain(profile) : strikeDomain(profile);
  const zDomain = isIv ? undefined : tenorDomainDays(profile, active.field!);
  const cols = grid[0]?.length ?? 0;
  const rows = grid.length;
  const spot = profile?.spot;
  const sliceCol = xDomain && spot && cols > 0
    ? Math.max(0, Math.min(cols - 1, Math.round(((spot - xDomain[0]) / (xDomain[1] - xDomain[0])) * (cols - 1))))
    : null;
  const sliceRow = rows > 0 ? 0 : null; // front-tenor smile
  const markers: SurfaceMarker[] = [
    spot != null ? { at: spot, kind: 'spot' as const, label: 'Spot' } : null,
    profile?.gammaFlip != null ? { at: profile.gammaFlip, kind: 'flip' as const, label: 'γ-Flip' } : null,
    profile?.callWall != null ? { at: profile.callWall, kind: 'callWall' as const, label: 'Call Wall' } : null,
    profile?.putWall != null ? { at: profile.putWall, kind: 'putWall' as const, label: 'Put Wall' } : null,
  ].filter(Boolean) as SurfaceMarker[];
  const valueFormat = isIv ? (v: number) => `${(v * 100).toFixed(1)}%` : (v: number) => fmtGamma(v);
  const xFormat = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  const zFormat = (v: number) => `${Math.round(v)}d`;
  const dataState: DataState = grid.length === 0 ? 'required' : live ? 'live' : 'model';

  const netGex = profile?.netGex;
  const metrics: { label: string; raw?: number; render: () => string; tone: string; signed?: boolean }[] = [
    { label: 'Net Gamma', raw: netGex, render: () => fmtGamma(netGex), tone: (netGex ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)', signed: true },
    // When the aggregate isn't on the chain (some feeds omit net vanna/charm), a bare dash
    // reads as broken next to a rendering surface — say why it's absent instead.
    { label: 'Net Vanna', raw: profile?.netVex, render: () => (profile?.netVex != null ? fmtGamma(profile.netVex) : 'model'), tone: 'var(--accent-color)' },
    { label: 'Net Charm', raw: profile?.charmEx, render: () => (profile?.charmEx != null ? fmtGamma(profile.charmEx) : 'model'), tone: 'var(--warning)' },
    { label: 'γ-Flip', raw: profile?.gammaFlip, render: () => (profile?.gammaFlip != null ? profile.gammaFlip.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'), tone: 'var(--text-primary)' },
    { label: 'Exp. Move', raw: profile?.expectedMovePct, render: () => (profile?.expectedMovePct != null ? `±${profile.expectedMovePct.toFixed(2)}%` : '—'), tone: 'var(--info)' },
    { label: 'Spot', raw: profile?.spot, render: () => (profile?.spot != null ? profile.spot.toLocaleString(undefined, { maximumFractionDigits: decimals }) : '—'), tone: 'var(--text-primary)' },
  ];

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4">
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-[var(--warning)]" />
          <span className="font-mono text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)]">Dealer Mechanics · {tkr}</span>
          <span className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[8px] font-black uppercase tracking-widest text-[var(--text-tertiary)]">3D · WebGL</span>
        </div>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-color)]"
        >
          <RefreshCw className="h-3 w-3" /> Recompute
        </button>
      </div>

      {/* Surface switch */}
      <div role="tablist" aria-label="3D surface" className="mb-2 flex flex-wrap gap-1.5">
        {SURFACES.map((s) => {
          const on = s.key === surface;
          const Icon = s.icon;
          return (
            <button
              key={s.key}
              role="tab"
              aria-selected={on}
              onClick={() => setSurface(s.key)}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-color)] ${
                on ? 'border-[var(--accent-color)]/50 bg-[var(--accent-color)]/10 text-[var(--text-primary)]' : 'border-[var(--border)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {s.label}
            </button>
          );
        })}
      </div>

      {/* The brutalist surface */}
      <div className="overflow-hidden rounded-md border border-[var(--border)] bg-[#0a0a0b]">
        <Suspense fallback={<div className="h-[460px] w-full animate-pulse bg-[var(--surface-2)]" />}>
          <QuantSurface3D
            grid={grid}
            ramp={active.ramp}
            height={460}
            axisLabels={active.axes}
            xDomain={xDomain}
            zDomain={zDomain}
            xFormat={xFormat}
            zFormat={zFormat}
            valueFormat={valueFormat}
            markers={markers}
            floorHeatmap
            legend
            dataState={dataState}
            sliceCol={sliceCol}
            sliceRow={sliceRow}
          />
        </Suspense>
      </div>

      {/* What am I looking at */}
      <div className="mt-2 flex items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)]/50 px-3 py-2">
        <Waves className="mt-0.5 h-3 w-3 shrink-0 text-[var(--accent-color)]" />
        <p className="font-mono text-[10px] leading-relaxed text-[var(--text-tertiary)]">{active.blurb}</p>
      </div>

      {/* Live dealer-physics scalars */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {metrics.map((m) => (
          <div key={m.label} className="relative overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2">
            <span className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: m.tone, opacity: 0.7 }} />
            <div className="truncate font-mono text-[8px] font-black uppercase tracking-widest text-[var(--text-tertiary)]">{m.label}</div>
            <div className="mt-0.5 font-mono text-[13px] font-bold tabular-nums leading-tight" style={{ color: m.tone }}>
              {m.raw != null
                ? <LiveValue value={m.raw} mode={m.signed ? 'directional' : 'neutral'} format={() => m.render()} />
                : m.render()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default DealerMechanicsDashboard;

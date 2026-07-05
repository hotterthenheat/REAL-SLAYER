import { lazy, Suspense, useMemo, useState } from 'react';
import { useContractStore } from '../lib/store';
import { Boxes, Layers, Activity, Waves, RefreshCw, Zap } from 'lucide-react';
import { LiveValue } from './ui/LiveValue';
import { gammaSurfaceGrid, ivSurfaceGrid, monteCarloCloud, type SurfaceProfile } from './quant/dealerSurfaces';

// Directive-08 renderer is lazy so three.js stays off the initial bundle and only one
// WebGL context is ever live (the active surface).
const QuantSurface3D = lazy(() => import('./quant/QuantSurface3D'));

interface Props {
  profile?: SurfaceProfile;
  ticker?: string;
  decimals?: number;
}

type SurfaceKey = 'gamma' | 'iv' | 'montecarlo';

const SURFACES: { key: SurfaceKey; label: string; icon: typeof Boxes; axes: [string, string, string]; ramp: 'diverging' | 'sequential'; blurb: string }[] = [
  { key: 'gamma', label: 'Dealer Gamma', icon: Boxes, axes: ['strike', 'tenor', 'net γ'], ramp: 'diverging', blurb: 'Net dealer gamma by strike × expiry. Red = short-gamma (dealers amplify moves); green = long-gamma (dealers dampen). The slate saddle is the flip.' },
  { key: 'iv', label: 'Vol Surface', icon: Layers, axes: ['moneyness', 'tenor', 'IV'], ramp: 'sequential', blurb: 'Implied vol by moneyness × tenor. Blue = calm, red = stressed. Put-side lift is skew; the U across strikes is the smile.' },
  { key: 'montecarlo', label: 'Monte Carlo', icon: Activity, axes: ['time', 'path', 'price'], ramp: 'diverging', blurb: 'GBM price-path cloud fanned over the session. Green finishes above spot, red below — the width is the risk-neutral cone.' },
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
 * Dealer Mechanics — rebuilt to Directive 08. One brutalist WebGL surface (the active
 * one only, so a single GPU context is live) fronting a switch across the three
 * whitelist targets — dealer gamma matrix, IV surface, Monte-Carlo cloud — over a clean,
 * responsive strip of the live dealer-physics scalars. No cinematic lighting, no gray
 * blob; the surface reads as a raw mathematical plot on the data-status palette.
 */
export function DealerMechanicsDashboard({ profile: external, ticker, decimals = 2 }: Props) {
  const serverState = useContractStore((s) => s.serverState);
  const selectedAsset = useContractStore((s) => s.selectedAsset);
  const tkr = ticker ?? selectedAsset?.ticker ?? '—';
  const profile: SurfaceProfile | undefined = (serverState?.gex_profile as SurfaceProfile) ?? external;

  const [surface, setSurface] = useState<SurfaceKey>('gamma');
  const [refreshKey, setRefreshKey] = useState(0);
  const active = SURFACES.find((s) => s.key === surface)!;

  // Structural snapshots — recomputed only on ticker / manual refresh / when the chain
  // first becomes ready, NEVER every tick, so the WebGL scene is not torn down and
  // rebuilt at 1Hz. `dataReady` flips false→true once (when gex_profile lands), which
  // triggers exactly one recompute off the live data, then stays stable.
  const dataReady = !!(profile?.spot && profile.spot > 0 && (profile.strikes?.length ?? 0) >= 4);
  const gammaGrid = useMemo(() => gammaSurfaceGrid(profile), [tkr, refreshKey, dataReady]); // eslint-disable-line react-hooks/exhaustive-deps
  const ivGrid = useMemo(() => ivSurfaceGrid(profile), [tkr, refreshKey, dataReady]); // eslint-disable-line react-hooks/exhaustive-deps
  const mcCloud = useMemo(() => monteCarloCloud(profile), [tkr, refreshKey, dataReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const netGex = profile?.netGex;
  const metrics: { label: string; raw?: number; render: () => string; tone: string; signed?: boolean }[] = [
    { label: 'Net Gamma', raw: netGex, render: () => fmtGamma(netGex), tone: (netGex ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)', signed: true },
    { label: 'Net Vanna', raw: profile?.netVex, render: () => fmtGamma(profile?.netVex), tone: 'var(--accent-color)' },
    { label: 'Net Charm', raw: profile?.charmEx, render: () => fmtGamma(profile?.charmEx), tone: 'var(--warning)' },
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
        <Suspense fallback={<div className="h-[380px] w-full animate-pulse bg-[var(--surface-2)]" />}>
          {surface === 'montecarlo' ? (
            <QuantSurface3D points={mcCloud} ramp={active.ramp} height={380} axisLabels={active.axes} />
          ) : (
            <QuantSurface3D grid={surface === 'gamma' ? gammaGrid : ivGrid} ramp={active.ramp} height={380} axisLabels={active.axes} />
          )}
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

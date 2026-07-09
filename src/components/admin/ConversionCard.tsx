import { lazy, Suspense, useMemo } from 'react';
import { tierConversionOption, type TierBar } from '../quant/echartOptions';
import { TerminalPanel } from '../ui/terminal/TerminalPanel';

const EChart = lazy(() => import('../ui/EChart'));

/**
 * ConversionCard — an HONEST visitors-vs-buyers snapshot for the Admin Overview.
 *
 * The user store has no signup / last-seen timestamp, so a time series would be
 * fabricated. Instead this reads the real access_tier counts the overview endpoint
 * now returns (total_users, paid_users, tier_breakdown): a "buyer" is any account
 * whose tier is not the free 'guest' default. Conversion rate is the headline; the
 * horizontal bar breaks the population down by tier — guest (visitors who haven't
 * bought) in a muted tone, each paid tier in a blue step.
 */

// Ordered tier ladder + display labels. Any tier the server reports that isn't
// listed here still renders (appended, blue) so the chart never silently drops data.
const TIER_ORDER = ['guest', 'discord', 'pinpoint', 'intraday', 'skyvision', 'quant', 'enterprise', 'lifetime'];
const TIER_LABEL: Record<string, string> = {
  guest: 'Guest', discord: 'Discord', pinpoint: 'Pinpoint', intraday: 'Intraday',
  skyvision: 'SkyVision', quant: 'Quant', enterprise: 'Enterprise', lifetime: 'Lifetime',
};

// Light→dark blue ordinal ramp for the paid ladder (ordinal steps clear 2:1 on
// their surface); guest uses a muted neutral so it reads as "not converted".
const DARK = { blue: ['#93C5FD', '#60A5FA', '#3B82F6', '#2563EB', '#1D4ED8', '#1E40AF', '#1E3A8A'], guest: '#52525B' };
const LIGHT = { blue: ['#3B82F6', '#2563EB', '#1D4ED8', '#1E40AF', '#1E3A8A', '#172554', '#0F172A'], guest: '#A1A1AA' };

function readVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// Rough luminance test on the surface token → which mode's ramp to use.
function isLightSurface(): boolean {
  const s = readVar('--surface', '#141414');
  const m = s.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 140;
}

export function ConversionCard({ overview }: { overview: any }) {
  const total: number | null = typeof overview?.total_users === 'number' ? overview.total_users : null;
  const paid: number = typeof overview?.paid_users === 'number' ? overview.paid_users : 0;
  const online: number = typeof overview?.live_connections === 'number' ? overview.live_connections : 0;
  const breakdown: Record<string, number> = overview?.tier_breakdown || {};
  const rate = total && total > 0 ? paid / total : 0;

  const bars: TierBar[] = useMemo(() => {
    const light = isLightSurface();
    const ramp = light ? LIGHT.blue : DARK.blue;
    const guestColor = light ? LIGHT.guest : DARK.guest;
    const keys = Object.keys(breakdown);
    const ordered = [
      ...TIER_ORDER.filter(t => keys.includes(t)),
      ...keys.filter(k => !TIER_ORDER.includes(k)),
    ];
    let paidIdx = 0;
    return ordered.map((k) => {
      const isGuest = k === 'guest';
      const color = isGuest ? guestColor : ramp[Math.min(paidIdx++, ramp.length - 1)];
      return { label: TIER_LABEL[k] || k.replace(/_/g, ' '), count: breakdown[k] || 0, color };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview?.tier_breakdown]);

  const chartColors = {
    text: readVar('--text-tertiary', '#A3A3A3'),
    axis: readVar('--border', 'rgba(255,255,255,0.10)'),
    grid: readVar('--border', 'rgba(255,255,255,0.06)'),
  };

  if (total == null) {
    return (
      <TerminalPanel title="Visitors vs Buyers" subtitle="Conversion by access tier">
        <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">Waiting on user counts…</div>
      </TerminalPanel>
    );
  }

  if (total === 0) {
    return (
      <TerminalPanel title="Visitors vs Buyers" subtitle="Conversion by access tier">
        <div className="text-[11px] leading-relaxed text-[var(--text-muted)]">No users yet. Once accounts exist, this shows how many visitors convert to a paid tier.</div>
      </TerminalPanel>
    );
  }

  const chartHeight = Math.max(90, bars.length * 30 + 30);

  return (
    <TerminalPanel title="Visitors vs Buyers" subtitle="Conversion by access tier">
      {/* Focal conversion rate, supporting counts stepped down and hairline-split */}
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Conversion Rate</div>
          <div className="mt-1 slayer-num text-[28px] font-bold leading-none text-[var(--info)]">{(rate * 100).toFixed(rate >= 0.1 ? 0 : 1)}%</div>
        </div>
        <div className="flex items-end gap-6 border-l border-[var(--border-subtle)] pl-6">
          <Stat label="Buyers" value={paid} color="text-[var(--info)]" />
          <Stat label="Visitors" value={total - paid} color="text-[var(--text-secondary)]" />
          <Stat label="Online" value={online} color="text-[var(--success)]" />
        </div>
      </div>

      {/* Real tier breakdown */}
      <div style={{ height: chartHeight }} className="mt-4 w-full">
        <Suspense fallback={<div className="h-full w-full animate-pulse bg-[var(--surface-2)]" />}>
          <EChart option={() => tierConversionOption(bars, chartColors)} />
        </Suspense>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
        Snapshot from current access tiers — a buyer is any non-guest account. No time axis: the user store keeps no signup history to chart honestly.
      </p>
    </TerminalPanel>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{label}</div>
      <div className={`slayer-num text-[17px] font-semibold leading-none ${color}`}>{value}</div>
    </div>
  );
}

export default ConversionCard;

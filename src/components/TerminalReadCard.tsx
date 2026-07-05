import { useMemo } from 'react';
import type { GexProfileData, Candle } from '../types';
import { computeTerminalRead } from '../lib/terminalRead';
import { Badge } from './ui/Badge';
import { Term } from './ui/Tooltip';
import { Crosshair, Target, ShieldAlert, TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';

/**
 * TerminalReadCard — the pre-calculated CONCLUSION for the dealer book. It turns the raw
 * GEX profile into a plain-English verdict a trader can act on without doing the math:
 * regime + directional bias + confidence, THE PLAY, a coherent entry / target / stop
 * bracket with its reward:risk, a single position-strength score, the driving signals,
 * and the live narrative. Pure synthesis of the shown numbers (computeTerminalRead) — every
 * input is on the page, so it reads as an auditable read, not a black box. Honest by
 * construction: labelled MODEL unless a live provider is connected; a no-clean-bracket
 * state reads as STAND DOWN, never a fake setup.
 */

const nfmt = (v: number | undefined, d: number) =>
  typeof v === 'number' ? v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';

export function TerminalReadCard({
  profile, candles, ticker, decimals = 0, isLive = false,
}: {
  profile: GexProfileData;
  candles: Candle[];
  ticker: string;
  decimals?: number;
  isLive?: boolean;
}) {
  const read = useMemo(
    () => computeTerminalRead(profile, (candles || []).slice(-20).map(c => c.close)),
    [profile, candles],
  );

  const spot = profile.spot || 0;
  const rr = read.target != null && read.stop != null && spot
    ? Math.abs(read.target - spot) / Math.max(1e-6, Math.abs(spot - read.stop))
    : null;

  const biasTone = read.bias === 'LONG' ? 'success' : read.bias === 'SHORT' ? 'danger' : 'neutral';
  const BiasIcon = read.bias === 'LONG' ? TrendingUp : read.bias === 'SHORT' ? TrendingDown : Minus;
  const confTone = read.confidence >= 66 ? 'success' : read.confidence >= 45 ? 'warning' : 'neutral';
  const psColor = read.positionStrength >= 66 ? 'var(--success)' : read.positionStrength >= 40 ? 'var(--warning)' : 'var(--danger)';
  const rrTone = rr == null ? 'var(--text-tertiary)' : rr >= 2 ? 'var(--success)' : rr >= 1 ? 'var(--warning)' : 'var(--danger)';

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4" id="terminal-read-card">
      {/* Header: what the book is saying, at a glance */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-[var(--border)] pb-3">
        <Crosshair className="h-4 w-4 text-[var(--accent-color)]" />
        <span className="font-mono text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)]">Terminal Read · {ticker}</span>
        <Badge tone={isLive ? 'success' : 'warning'} size="sm" dot pulse={isLive}>{isLive ? 'LIVE CHAIN' : 'MODEL MODE'}</Badge>
        <span className="mx-1 h-3.5 w-px bg-[var(--border-strong)]" />
        <Badge tone={read.regime === 'PIN' ? 'info' : 'warning'} size="sm">
          <Term id={read.regime === 'PIN' ? 'netGex' : 'gammaFlip'}>{read.regimeLabel}</Term>
        </Badge>
        <Badge tone={biasTone as any} size="sm"><BiasIcon className="mr-1 h-2.5 w-2.5" />{read.bias}</Badge>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--text-tertiary)]">Confidence</span>
          <Badge tone={confTone as any} size="sm">{read.confidenceLabel} · {Math.round(read.confidence)}%</Badge>
        </span>
      </div>

      {/* THE PLAY — the star: the conclusion in plain English */}
      <div className="flex items-start gap-2">
        <span className="mt-0.5 font-mono text-[9px] font-black uppercase tracking-widest text-[var(--accent-color)]">Play</span>
        <p className="flex-1 text-[13px] font-medium leading-relaxed text-[var(--text-primary)]">{read.play}</p>
      </div>

      {/* Entry / Target / Stop bracket + reward:risk — or an honest stand-down */}
      {read.noTrade || read.bias === 'NEUTRAL' ? (
        <div className="flex items-center gap-2 rounded-md border border-[var(--warning)]/25 bg-[var(--warning)]/5 px-3 py-2">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-[var(--warning)]" />
          <span className="font-mono text-[11px] font-bold text-[var(--warning)]">No trade · {read.entry}</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ReadStat label="Entry" value={read.entry} span2 />
          <ReadStat label="Target" value={nfmt(read.target, decimals)} icon={<Target className="h-3 w-3 text-[var(--success)]" />} valueColor="var(--success)" />
          <ReadStat label="Stop" value={nfmt(read.stop, decimals)} icon={<ShieldAlert className="h-3 w-3 text-[var(--danger)]" />} valueColor="var(--danger)" />
          <ReadStat label={<Term def="Reward-to-risk: distance to target ÷ distance to stop. ≥ 2 is a clean setup.">Reward : Risk</Term>} value={rr != null ? `${rr.toFixed(2)} : 1` : '—'} valueColor={rrTone} />
          <ReadStat label="Spot" value={nfmt(spot, decimals)} />
          <ReadStat label={<Term def="A single 0–100 conviction score for this read — directional confluence × signal agreement × regime clarity.">Position Strength</Term>} value={String(read.positionStrength)} valueColor={psColor} span2 meter={read.positionStrength} meterColor={psColor} />
        </div>
      )}

      {/* Driving signals — why the read says what it says */}
      {read.signals.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] pt-3">
          <span className="font-mono text-[8.5px] font-black uppercase tracking-widest text-[var(--text-tertiary)]">Signals</span>
          {read.signals.slice(0, 6).map(s => (
            <span
              key={s.key}
              title={s.detail}
              className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wide"
              style={{
                color: s.dir > 0 ? 'var(--success)' : s.dir < 0 ? 'var(--danger)' : 'var(--text-secondary)',
                borderColor: 'var(--border)',
                background: 'var(--surface-3)',
              }}
            >
              {s.dir > 0 ? '▲' : s.dir < 0 ? '▼' : '•'} {s.label}
            </span>
          ))}
        </div>
      )}

      {/* Live narrative — the running read of where price sits vs the book */}
      {read.events.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-[var(--border)] pt-3">
          <span className="flex items-center gap-1 font-mono text-[8.5px] font-black uppercase tracking-widest text-[var(--text-tertiary)]"><Activity className="h-3 w-3" /> Live Read</span>
          <ul className="flex flex-col gap-1">
            {read.events.slice(0, 5).map((e, i) => (
              <li key={i} className="flex items-center gap-1.5 text-[10.5px] font-medium leading-tight">
                <span className="h-1 w-1 shrink-0 rounded-full" style={{ background: e.tone === 'pos' ? 'var(--success)' : e.tone === 'neg' ? 'var(--danger)' : 'var(--text-tertiary)' }} />
                <span style={{ color: e.tone === 'pos' ? 'var(--success)' : e.tone === 'neg' ? 'var(--danger)' : 'var(--text-secondary)' }}>{e.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ReadStat({
  label, value, icon, valueColor, span2, meter, meterColor,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: React.ReactNode;
  valueColor?: string;
  span2?: boolean;
  meter?: number;
  meterColor?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 ${span2 ? 'col-span-2' : ''}`}>
      <span className="font-mono text-[8px] font-black uppercase tracking-widest text-[var(--text-tertiary)]">{label}</span>
      <span className="flex items-center gap-1 font-mono text-[12px] font-bold tabular-nums leading-none" style={{ color: valueColor ?? 'var(--text-primary)' }}>
        {icon}{value}
      </span>
      {meter != null && (
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(2, Math.min(100, meter))}%`, background: meterColor ?? 'var(--accent-color)' }} />
        </div>
      )}
    </div>
  );
}

export default TerminalReadCard;

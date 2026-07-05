import { useMemo } from 'react';
import type { BreedenLitzenbergerResult } from '../lib/quantSuite';
import { useCrosshair } from './quant/chartInteraction';

/**
 * TAIL RISK MAP — the risk read of the market's own forward distribution. Everything here
 * is computed off the already-solved Breeden-Litzenberger risk-neutral density (no new
 * assumptions beyond √t vol scaling for the horizon grid), so it is a true reading of what
 * the option chain is pricing, not a decorative overlay:
 *
 *   • Expected-move bands — ±1σ / ±2σ around the RND mean, shaded over the density.
 *   • Tail probability map — P(S_T > K) and P(S_T < K) across the whole strike axis.
 *   • Probability above / below the dealer walls, γ-flip and spot, read off the CDF.
 *   • Downside / upside tail imbalance — the mass beyond ±2σ on each side, and the skew.
 *   • Scenario heatmap — P(settle in a move bucket) across a horizon ladder, the implied
 *     dispersion cone widening with √t. Real math, deterministic, keyed on RND vol.
 */

interface Level { key: string; label: string; price: number; color: string }

interface Props {
  rnd: BreedenLitzenbergerResult;
  spot: number;
  dteDays: number;
  callWall?: number;
  putWall?: number;
  gammaFlip?: number;
  decimals?: number;
  ticker?: string;
  live?: boolean;
}

// Abramowitz-Stegun erf → standard-normal CDF for the horizon scenario grid.
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
const Phi = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

const HORIZONS = [1, 3, 7, 14, 30]; // calendar-day ladder for the scenario cone
const MOVE_EDGES = [-0.08, -0.06, -0.04, -0.02, -0.005, 0.005, 0.02, 0.04, 0.06, 0.08]; // return buckets

export function TailRiskMap({ rnd, spot, dteDays, callWall, putWall, gammaFlip, decimals = 0, ticker, live }: Props) {
  const m = useMemo(() => {
    const density = (rnd?.density || []).filter((d) => isFinite(d.strike) && isFinite(d.cumulativeProb));
    if (density.length < 3 || !(spot > 0) || !(rnd.stdDev > 0)) return null;
    const sorted = [...density].sort((a, b) => a.strike - b.strike);
    const minS = sorted[0].strike, maxS = sorted[sorted.length - 1].strike;
    const pdfMax = Math.max(...sorted.map((d) => d.probability)) || 1;

    const cdfAt = (K: number): number => {
      if (K <= minS) return 0;
      if (K >= maxS) return 1;
      let lo = 0, hi = sorted.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (sorted[mid].strike <= K) lo = mid; else hi = mid; }
      const a = sorted[lo], b = sorted[hi];
      const t = b.strike === a.strike ? 0 : (K - a.strike) / (b.strike - a.strike);
      return Math.max(0, Math.min(1, a.cumulativeProb + t * (b.cumulativeProb - a.cumulativeProb)));
    };

    const mean = rnd.mean, sd = rnd.stdDev;
    const bands = {
      s1: [mean - sd, mean + sd] as [number, number],
      s2: [mean - 2 * sd, mean + 2 * sd] as [number, number],
    };
    // Realised tail mass beyond ±2σ on each side (from the true density, not a normal).
    const pDownTail = cdfAt(bands.s2[0]);
    const pUpTail = 1 - cdfAt(bands.s2[1]);
    const tailTotal = pDownTail + pUpTail || 1e-9;

    const levels: Level[] = [];
    if (callWall && callWall > 0) levels.push({ key: 'cw', label: 'Call Wall', price: callWall, color: 'var(--success)' });
    if (gammaFlip && gammaFlip > 0) levels.push({ key: 'gf', label: 'γ Flip', price: gammaFlip, color: 'var(--warning)' });
    if (putWall && putWall > 0) levels.push({ key: 'pw', label: 'Put Wall', price: putWall, color: 'var(--danger)' });
    const levelStats = [{ key: 'spot', label: 'Spot', price: spot, color: 'var(--text-secondary)' }, ...levels]
      .map((l) => ({ ...l, pAbove: 1 - cdfAt(l.price), pBelow: cdfAt(l.price) }));

    // Scenario cone: annualised RND vol scaled by √t across the horizon ladder.
    const T0 = Math.max(dteDays, 0.5) / 365;
    const sigmaAnn = (sd / spot) / Math.sqrt(T0);
    const scenario = HORIZONS.map((days) => {
      const t = days / 365;
      const sigT = sigmaAnn * Math.sqrt(t); // 1σ move in return space at this horizon
      const cells = [];
      for (let i = 0; i < MOVE_EDGES.length - 1; i++) {
        const loP = Phi(MOVE_EDGES[i] / sigT), hiP = Phi(MOVE_EDGES[i + 1] / sigT);
        cells.push(hiP - loP);
      }
      // outside the outermost edges → the two extreme tails
      const belowLo = Phi(MOVE_EDGES[0] / sigT);
      const aboveHi = 1 - Phi(MOVE_EDGES[MOVE_EDGES.length - 1] / sigT);
      return { days, sigT, cells, belowLo, aboveHi };
    });
    const scenarioMax = Math.max(...scenario.flatMap((r) => r.cells)) || 1;

    return { sorted, minS, maxS, pdfMax, cdfAt, mean, sd, bands, pDownTail, pUpTail, tailTotal, levelStats, sigmaAnn, scenario, scenarioMax };
  }, [rnd, spot, dteDays, callWall, putWall, gammaFlip]);

  const { svgRef, vx, onPointerMove, onPointerLeave } = useCrosshair(1000);
  const fmt = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const pctMove = (K: number) => `${(((K / spot) - 1) * 100).toFixed(1)}%`;

  if (!m) {
    return (
      <div className="h-[220px] rounded-lg border border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-center">
        <span className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-widest">Data required — insufficient chain for tail risk</span>
      </div>
    );
  }

  // ── Tail probability map geometry ──
  const W = 1000, H = 210, x0 = 8, x1 = W - 8, y0 = 12, y1 = H - 22;
  const sx = (K: number) => x0 + ((K - m.minS) / ((m.maxS - m.minS) || 1)) * (x1 - x0);
  const syP = (p: number) => y1 - Math.max(0, Math.min(1, p)) * (y1 - y0);
  const syPdf = (v: number) => y1 - (v / m.pdfMax) * (y1 - y0);
  const pdfArea = `M${sx(m.sorted[0].strike).toFixed(1)},${y1} ` + m.sorted.map((d) => `L${sx(d.strike).toFixed(1)},${syPdf(d.probability).toFixed(1)}`).join(' ') + ` L${sx(m.sorted[m.sorted.length - 1].strike).toFixed(1)},${y1} Z`;
  const survivalUp = m.sorted.map((d, i) => `${i === 0 ? 'M' : 'L'}${sx(d.strike).toFixed(1)},${syP(1 - d.cumulativeProb).toFixed(1)}`).join(' ');
  const cdfDown = m.sorted.map((d, i) => `${i === 0 ? 'M' : 'L'}${sx(d.strike).toFixed(1)},${syP(d.cumulativeProb).toFixed(1)}`).join(' ');
  const spotX = sx(spot);

  const hoverStrike = vx != null ? m.minS + ((vx - x0) / ((x1 - x0) || 1)) * (m.maxS - m.minS) : null;
  const hoverUp = hoverStrike != null && hoverStrike >= m.minS && hoverStrike <= m.maxS ? 1 - m.cdfAt(hoverStrike) : null;

  const downShare = m.pDownTail / m.tailTotal; // 0..1 of extreme mass that is downside
  const skewTone = rnd.skewness < -0.05 ? 'var(--danger)' : rnd.skewness > 0.05 ? 'var(--success)' : 'var(--text-secondary)';

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <span className="w-[3px] h-3.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--danger) 55%, transparent)' }} />
          <span className="text-[11px] font-bold tracking-[0.14em] uppercase text-[var(--text-primary)]">Tail Risk Map{ticker ? ` · ${ticker}` : ''}</span>
        </div>
        <span
          className="text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded uppercase"
          style={live
            ? { color: 'var(--success)', background: 'color-mix(in srgb, var(--success) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)' }
            : { color: 'var(--info)', background: 'color-mix(in srgb, var(--info) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--info) 30%, transparent)' }}
        >
          {live ? 'Live Chain' : 'Model Mode'}
        </span>
      </div>

      {/* Tail probability map + expected-move bands over the density */}
      <div className="px-1 pt-2">
        <div className="flex items-center gap-3 px-3 pb-1 text-[9px] uppercase tracking-wider text-[var(--text-tertiary)]">
          <span className="flex items-center gap-1"><span className="w-2.5 h-[2px] bg-[var(--success)]" /> P(close above K)</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-[2px] bg-[var(--danger)]" /> P(close below K)</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2 rounded-sm" style={{ background: 'color-mix(in srgb, var(--accent-color) 18%, transparent)' }} /> density</span>
          <span className="ml-auto tabular-nums normal-case">±1σ&nbsp;{pctMove(m.bands.s1[1])} · ±2σ&nbsp;{pctMove(m.bands.s2[1])}</span>
        </div>
        <svg ref={svgRef} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block cursor-crosshair" preserveAspectRatio="none" style={{ maxHeight: 190 }}>
          {/* ±2σ then ±1σ expected-move bands */}
          <rect x={sx(m.bands.s2[0])} y={y0} width={Math.max(0, sx(m.bands.s2[1]) - sx(m.bands.s2[0]))} height={y1 - y0} fill="color-mix(in srgb, var(--accent-color) 5%, transparent)" />
          <rect x={sx(m.bands.s1[0])} y={y0} width={Math.max(0, sx(m.bands.s1[1]) - sx(m.bands.s1[0]))} height={y1 - y0} fill="color-mix(in srgb, var(--accent-color) 9%, transparent)" />
          {/* implied density */}
          <path d={pdfArea} fill="color-mix(in srgb, var(--accent-color) 16%, transparent)" stroke="none" />
          {/* level markers */}
          {m.levelStats.filter((l) => l.key !== 'spot').map((l) => (
            <line key={l.key} x1={sx(l.price)} y1={y0} x2={sx(l.price)} y2={y1} stroke={l.color} strokeWidth={1} opacity={0.5} strokeDasharray="2 3" />
          ))}
          {/* spot */}
          <line x1={spotX} y1={y0} x2={spotX} y2={y1} stroke="var(--text-secondary)" strokeWidth={1.25} />
          {/* survival + cdf tail curves */}
          <path d={survivalUp} fill="none" stroke="var(--success)" strokeWidth={2} />
          <path d={cdfDown} fill="none" stroke="var(--danger)" strokeWidth={2} />
          {/* crosshair */}
          {hoverStrike != null && hoverUp != null && (
            <>
              <line x1={sx(hoverStrike)} y1={y0} x2={sx(hoverStrike)} y2={y1} stroke="var(--accent-color)" strokeWidth={1} opacity={0.7} />
              <circle cx={sx(hoverStrike)} cy={syP(hoverUp)} r={3.2} fill="var(--success)" />
              <circle cx={sx(hoverStrike)} cy={syP(1 - hoverUp)} r={3.2} fill="var(--danger)" />
            </>
          )}
        </svg>
        <div className="flex justify-between px-3 pb-2 text-[9px] tabular-nums text-[var(--text-tertiary)]">
          {hoverStrike != null && hoverUp != null ? (
            <span>@ {fmt(hoverStrike)} <span className="text-[var(--text-secondary)]">({pctMove(hoverStrike)})</span> · <span style={{ color: 'var(--success)' }}>P&gt; {pct(hoverUp)}</span> · <span style={{ color: 'var(--danger)' }}>P&lt; {pct(1 - hoverUp)}</span></span>
          ) : <span>Hover the map for exact tail probabilities at any level.</span>}
          <span>μ {fmt(m.mean)} · σ {pct(m.sd / spot)}</span>
        </div>
      </div>

      {/* Probability above/below key levels */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-3 py-2 border-t border-[var(--border)]">
        {m.levelStats.map((l) => (
          <div key={l.key} className="rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-2.5 py-1.5">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: l.color }} />
              <span className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] truncate">{l.label}</span>
              <span className="ml-auto text-[9px] tabular-nums text-[var(--text-tertiary)]">{fmt(l.price)}</span>
            </div>
            <div className="mt-1 flex items-center gap-1 text-[10px] tabular-nums">
              <span className="font-bold" style={{ color: 'var(--success)' }}>{pct(l.pAbove)}</span>
              <span className="text-[var(--text-tertiary)]">above</span>
              <span className="ml-auto font-bold" style={{ color: 'var(--danger)' }}>{pct(l.pBelow)}</span>
            </div>
            {/* proportion bar */}
            <div className="mt-1 h-1 rounded-full overflow-hidden bg-[var(--danger)]/30">
              <div className="h-full" style={{ width: `${(l.pAbove * 100).toFixed(1)}%`, background: 'var(--success)' }} />
            </div>
          </div>
        ))}
      </div>

      {/* Tail imbalance + scenario heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 px-3 py-3 border-t border-[var(--border)]">
        {/* Tail imbalance */}
        <div className="lg:col-span-2 rounded-md bg-[var(--surface-2)] border border-[var(--border)] p-3 flex flex-col">
          <span className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)]">Downside / Upside Tail Imbalance (beyond ±2σ)</span>
          <div className="mt-2 flex items-end justify-between text-[11px] tabular-nums">
            <div><span className="text-[var(--danger)] font-bold text-[15px]">{pct(m.pDownTail)}</span><div className="text-[9px] text-[var(--text-tertiary)] uppercase">down tail</div></div>
            <div className="text-center"><span className="font-bold" style={{ color: skewTone }}>{rnd.skewness >= 0 ? '+' : ''}{rnd.skewness.toFixed(2)}</span><div className="text-[9px] text-[var(--text-tertiary)] uppercase">skew</div></div>
            <div className="text-right"><span className="text-[var(--success)] font-bold text-[15px]">{pct(m.pUpTail)}</span><div className="text-[9px] text-[var(--text-tertiary)] uppercase">up tail</div></div>
          </div>
          {/* diverging bar */}
          <div className="mt-2 flex h-2.5 rounded-full overflow-hidden">
            <div className="h-full bg-[var(--danger)]" style={{ width: `${(downShare * 100).toFixed(1)}%` }} />
            <div className="h-full bg-[var(--success)]" style={{ width: `${((1 - downShare) * 100).toFixed(1)}%` }} />
          </div>
          <p className="mt-2 text-[10px] leading-snug text-[var(--text-tertiary)]">
            {downShare > 0.58 ? 'Options chain implies heavier downside tail risk than upside tail risk.' : downShare < 0.42 ? 'Options chain implies heavier upside tail risk than downside tail risk.' : 'Options chain implies roughly balanced tail risk.'}
            {rnd.isFatTailed ? ' ⚠ fat-tailed (excess kurtosis high).' : ''}
          </p>
        </div>

        {/* Scenario heatmap */}
        <div className="lg:col-span-3 rounded-md bg-[var(--surface-2)] border border-[var(--border)] p-3">
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)]">Scenario Map — P(settle in move bucket) by horizon</span>
            <span className="text-[8px] uppercase tracking-wider text-[var(--text-tertiary)]/70">σ√t cone</span>
          </div>
          <div className="mt-2 overflow-x-auto">
            <div className="min-w-[420px]">
              {/* header row: bucket centers */}
              <div className="flex text-[8px] tabular-nums text-[var(--text-tertiary)] mb-0.5">
                <span className="w-8 shrink-0" />
                {MOVE_EDGES.slice(0, -1).map((e, i) => {
                  const c = ((e + MOVE_EDGES[i + 1]) / 2) * 100;
                  return <span key={i} className="flex-1 text-center">{c > 0 ? '+' : ''}{c.toFixed(0)}%</span>;
                })}
              </div>
              {m.scenario.map((row) => (
                <div key={row.days} className="flex items-center gap-0 mb-0.5">
                  <span className="w-8 shrink-0 text-[9px] tabular-nums text-[var(--text-secondary)]">{row.days === 1 ? '1D' : row.days === 7 ? '1W' : row.days === 14 ? '2W' : row.days === 30 ? '1M' : `${row.days}D`}</span>
                  {row.cells.map((p, i) => {
                    const intensity = Math.min(1, p / m.scenarioMax);
                    const center = (MOVE_EDGES[i] + MOVE_EDGES[i + 1]) / 2;
                    const hue = center < -0.001 ? 'var(--danger)' : center > 0.001 ? 'var(--success)' : 'var(--accent-color)';
                    return (
                      <span
                        key={i}
                        className="flex-1 h-6 flex items-center justify-center text-[7px] tabular-nums"
                        title={`${row.days}d · ${(center * 100).toFixed(0)}% move · P=${pct(p)}`}
                        style={{ background: `color-mix(in srgb, ${hue} ${(18 + intensity * 72).toFixed(0)}%, transparent)`, color: intensity > 0.5 ? '#0a0a0b' : 'var(--text-tertiary)' }}
                      >
                        {p >= 0.06 ? (p * 100).toFixed(0) : ''}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <p className="mt-1.5 text-[9px] leading-snug text-[var(--text-tertiary)]">Implied dispersion cone: each cell is the probability of settling within that % move by that horizon, from the RND-implied vol scaled √t. Brighter = more likely.</p>
        </div>
      </div>
    </div>
  );
}

export default TailRiskMap;

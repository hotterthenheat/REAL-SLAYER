/**
 * DealerHeatmap — a compact diverging strike heatmap for the Dealer Positioning
 * panel, rendered from real per-strike net gamma (gex_profile.strikes[].netGex).
 * The horizontal axis is NET DEALER PRESSURE (−max … +max): columns left of centre
 * read red (dealer long gamma / negative), right of centre read blue (dealer short
 * gamma / positive). Per-row saturation is scaled by that strike's |net gamma|, so
 * the walls light up and quiet strikes wash out — nothing is fabricated, colour is
 * a faithful encoding of the real values. Dotted level rules + right-edge chips
 * mark CALL WALL / SPOT / PIN / PUT WALL. Purely presentational over REAL rows.
 */
import { useMemo } from 'react';
import { fmtLevel, fmtMag } from './format';

export interface HeatRow {
  strike: number;
  net: number;
}

const CALL = 'var(--call)';
const PUT = 'var(--negative-ink)';
const PIN = 'var(--pin)';
const COLS = 30;
const WINDOW = 15; // ±strikes around spot

export function DealerHeatmap({
  strikes,
  spot,
  callWall,
  putWall,
  pin,
}: {
  strikes: HeatRow[];
  spot?: number;
  callWall?: number;
  putWall?: number;
  pin?: number;
}) {
  const rows = useMemo(() => {
    const asc = [...strikes].filter((s) => isFinite(s.strike)).sort((a, b) => a.strike - b.strike);
    if (asc.length === 0) return [];
    let center = 0;
    if (spot != null) {
      let bd = Infinity;
      asc.forEach((r, i) => {
        const d = Math.abs(r.strike - spot);
        if (d < bd) { bd = d; center = i; }
      });
    } else {
      center = Math.floor(asc.length / 2);
    }
    const lo = Math.max(0, center - WINDOW);
    const hi = Math.min(asc.length - 1, center + WINDOW);
    // descending (highest strike at top)
    return asc.slice(lo, hi + 1).reverse();
  }, [strikes, spot]);

  const maxAbs = useMemo(() => Math.max(1e-9, ...rows.map((r) => Math.abs(r.net))), [rows]);

  const nearestIdx = (level?: number): number | null => {
    if (level == null || !isFinite(level) || rows.length === 0) return null;
    let best = 0;
    for (let i = 1; i < rows.length; i++) {
      if (Math.abs(rows[i].strike - level) < Math.abs(rows[best].strike - level)) best = i;
    }
    return best;
  };
  const rowTopPct = (i: number) => ((i + 0.5) / rows.length) * 100;

  const levels = [
    { key: 'callwall', idx: nearestIdx(callWall), price: callWall, label: 'CALL WALL', color: CALL },
    { key: 'pin', idx: nearestIdx(pin), price: pin, label: 'PIN LEVEL', color: PIN },
    { key: 'putwall', idx: nearestIdx(putWall), price: putWall, label: 'PUT WALL', color: PUT },
  ].filter((l) => l.idx != null && l.price != null);
  const spotIdx = nearestIdx(spot);

  // Pressure-tick gridlines (−max … +max) as fractions across the plot width.
  const tickFracs = [0.0, 0.25, 0.5, 0.75, 1.0];

  // Which rows carry a strike label (every ~4th) to keep the gutter uncluttered.
  const labelEvery = Math.max(1, Math.round(rows.length / 8));

  if (rows.length === 0) {
    return (
      <div className="flex h-full min-h-[220px] items-center justify-center text-[10px] text-[var(--text-muted)]">
        No strike profile — awaiting feed.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Top pressure scale + gradient legend */}
      <div className="mb-1.5 shrink-0">
        <div className="mb-1 text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
          Net Dealer Pressure
        </div>
        <div
          className="h-1.5 w-full rounded-[1px]"
          style={{
            background: `linear-gradient(90deg, ${PUT} 0%, color-mix(in srgb, var(--text-faint) 22%, transparent) 50%, ${CALL} 100%)`,
          }}
        />
        <div className="mt-0.5 flex justify-between text-[8px] slayer-num text-[var(--text-faint)]">
          <span>−{fmtMag(maxAbs)}</span>
          <span>−{fmtMag(maxAbs / 2)}</span>
          <span>0</span>
          <span>+{fmtMag(maxAbs / 2)}</span>
          <span>+{fmtMag(maxAbs)}</span>
        </div>
      </div>

      {/* Body: strike gutter + heat plot */}
      <div className="flex min-h-[240px] flex-1">
        {/* strike gutter */}
        <div className="flex w-11 shrink-0 flex-col">
          {rows.map((r, i) => (
            <div
              key={`g-${r.strike}`}
              className="flex flex-1 items-center justify-end pr-1 text-[8px] slayer-num text-[var(--text-tertiary)]"
            >
              {i % labelEvery === 0 ? fmtLevel(r.strike) : ''}
            </div>
          ))}
        </div>

        {/* plot */}
        <div className="relative min-h-0 min-w-0 flex-1 border border-[var(--border-subtle)]">
          {/* heat rows */}
          <div className="absolute inset-0 flex flex-col">
            {rows.map((r) => {
              const rowInt = Math.min(1, Math.abs(r.net) / maxAbs);
              return (
                <div
                  key={`r-${r.strike}`}
                  className="grid flex-1"
                  style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
                >
                  {Array.from({ length: COLS }).map((_, ci) => {
                    const px = -maxAbs + ((ci + 0.5) / COLS) * 2 * maxAbs;
                    const dirPos = px >= 0;
                    const base = dirPos ? CALL : PUT;
                    const horiz = Math.abs(px) / maxAbs;
                    const alpha = Math.min(0.9, horiz * (0.28 + 0.72 * rowInt));
                    return (
                      <span
                        key={ci}
                        style={{ background: `color-mix(in srgb, ${base} ${Math.round(alpha * 100)}%, transparent)` }}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* vertical pressure gridlines */}
          {tickFracs.map((f, i) => (
            <div
              key={`v-${i}`}
              aria-hidden="true"
              className="absolute top-0 bottom-0 w-px"
              style={{
                left: `${f * 100}%`,
                background: f === 0.5 ? 'rgba(230,233,239,0.22)' : 'rgba(230,233,239,0.07)',
              }}
            />
          ))}

          {/* level rules + right-edge chips */}
          {levels.map((lv) => (
            <div key={lv.key} aria-hidden="true" className="absolute left-0 right-0" style={{ top: `${rowTopPct(lv.idx as number)}%` }}>
              <div className="h-0 w-full border-t border-dashed" style={{ borderColor: lv.color, opacity: 0.6 }} />
              <span
                className="absolute right-0.5 -translate-y-1/2 whitespace-nowrap rounded-[2px] border px-1 py-px text-[7.5px] font-bold uppercase tracking-[0.06em] slayer-num"
                style={{
                  top: 0,
                  color: lv.color,
                  borderColor: `color-mix(in srgb, ${lv.color} 55%, transparent)`,
                  background: 'var(--surface-2)',
                }}
              >
                {lv.label} {fmtLevel(lv.price)}
              </span>
            </div>
          ))}

          {/* spot rule + chip */}
          {spotIdx != null ? (
            <div aria-hidden="true" className="absolute left-0 right-0" style={{ top: `${rowTopPct(spotIdx)}%` }}>
              <div className="h-0 w-full border-t" style={{ borderColor: 'var(--text-primary)', opacity: 0.65 }} />
              <span
                className="absolute right-0.5 -translate-y-1/2 whitespace-nowrap rounded-[2px] border px-1 py-px text-[7.5px] font-bold uppercase tracking-[0.06em] slayer-num"
                style={{
                  top: 0,
                  color: 'var(--text-primary)',
                  borderColor: 'color-mix(in srgb, var(--text-primary) 40%, transparent)',
                  background: 'var(--surface-3)',
                }}
              >
                SPOT {spot != null ? fmtLevel(spot) : fmtLevel(rows[spotIdx].strike)}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* bottom legend */}
      <div className="mt-1.5 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1">
        <span className="flex items-center gap-1.5 text-[8.5px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          <span className="inline-block h-2 w-3 rounded-[1px]" style={{ background: PUT }} />
          Negative (Dealer Long Gamma)
        </span>
        <span className="flex items-center gap-1.5 text-[8.5px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          <span className="inline-block h-2 w-3 rounded-[1px]" style={{ background: CALL }} />
          Positive (Dealer Short Gamma)
        </span>
      </div>
    </div>
  );
}

export default DealerHeatmap;

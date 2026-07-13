/**
 * KpiStrip — the dense top row of ~10 compact metric cells, hairline-divided, that
 * opens the Home terminal. Label-over-value-over-subline (the reference command
 * board format). Scrolls horizontally on narrow widths so the page body never
 * overflows. Every value is sourced from the live GEX profile; colour is semantic.
 */
import { toneText, type Tone } from './format';

export interface KpiCell {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
  subTone?: Tone;
}

export function KpiStrip({ cells }: { cells: KpiCell[] }) {
  return (
    <div className="slayer-panel slayer-scrollbar flex min-w-0 overflow-x-auto">
      {cells.map((c, i) => (
        <div
          key={`${c.label}-${i}`}
          className={`min-w-[104px] flex-1 px-3 py-2 ${i !== 0 ? 'border-l border-[var(--border-subtle)]' : ''}`}
        >
          <div className="truncate text-[8.5px] font-semibold uppercase leading-none tracking-[0.14em] text-[var(--text-muted)]">
            {c.label}
          </div>
          <div className={`mt-1.5 slayer-num truncate text-[15px] font-bold leading-none ${toneText[c.tone ?? 'neutral']}`}>
            {c.value}
          </div>
          {c.sub !== undefined ? (
            <div className={`mt-1 slayer-num truncate text-[9px] leading-none ${c.subTone ? toneText[c.subTone] : 'text-[var(--text-tertiary)]'}`}>
              {c.sub}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default KpiStrip;

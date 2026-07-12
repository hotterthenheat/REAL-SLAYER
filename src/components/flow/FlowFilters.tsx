/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * FLOW FILTERS — the left screener rail for the dealer-flow SCREENER. A single
 * scrollable column of segmented pills, min→max numeric ranges, sentiment
 * sliders and toggle chips, matching the Flowseeker reference rail. Controlled:
 * it owns no state, it renders `value` and reports edits through `onChange`.
 *
 * Some controls (equity type, expiry picker, vol/oi, avg, %multi, ask/bid/skew,
 * chain sentiment, OPEX / OI-Growth) are honest screener controls the current
 * synthesized feed can't narrow — they render and participate in the active
 * count, and the parent wires the ones its data supports.
 */

import { useId } from 'react';

// ── State ────────────────────────────────────────────────────────────────────
export type FlowTypeFilter = 'all' | 'calls' | 'puts';
export type EquityKind = 'stocks' | 'etf' | 'indices';

export interface FlowFilterState {
  type: FlowTypeFilter;
  equity: EquityKind[];
  expiryDate: string;
  dteMin: string;
  dteMax: string;
  premMin: string;
  premMax: string;
  oiMin: string;
  oiMax: string;
  volMin: string;
  volMax: string;
  volOiMin: string;
  volOiMax: string;
  otmMin: string;
  otmMax: string;
  stockMin: string;
  stockMax: string;
  strikeMin: string;
  strikeMax: string;
  avgMin: string;
  avgMax: string;
  multiMin: string;
  multiMax: string;
  askMin: string;
  askMax: string;
  bidMin: string;
  bidMax: string;
  skewMin: string;
  skewMax: string;
  /** -100 (Bear) … 0 (All) … +100 (Bull) */
  sentContract: number;
  sentChain: number;
  excludeITM: boolean;
  exclude0DTE: boolean;
  otmOnly: boolean;
  opexOnly: boolean;
  signalOIGrowth: boolean;
}

export const DEFAULT_FLOW_FILTERS: FlowFilterState = {
  type: 'all',
  equity: [],
  expiryDate: '',
  dteMin: '',
  dteMax: '',
  premMin: '',
  premMax: '',
  oiMin: '',
  oiMax: '',
  volMin: '',
  volMax: '',
  volOiMin: '',
  volOiMax: '',
  otmMin: '',
  otmMax: '',
  stockMin: '',
  stockMax: '',
  strikeMin: '',
  strikeMax: '',
  avgMin: '',
  avgMax: '',
  multiMin: '',
  multiMax: '',
  askMin: '',
  askMax: '',
  bidMin: '',
  bidMax: '',
  skewMin: '',
  skewMax: '',
  sentContract: 0,
  sentChain: 0,
  excludeITM: false,
  exclude0DTE: false,
  otmOnly: false,
  opexOnly: false,
  signalOIGrowth: false,
};

// ── Presentation atoms ───────────────────────────────────────────────────────
const microLabel =
  'text-[9px] font-semibold uppercase tracking-[0.13em] text-[var(--text-muted)]';

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[var(--border-subtle)] px-2.5 py-2.5">
      <div className={microLabel}>{label}</div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex gap-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className="slayer-num flex-1 rounded-[3px] px-1.5 py-[3px] text-[10px] font-semibold transition-colors"
            style={
              active
                ? {
                    color: 'var(--accent-color)',
                    background: 'color-mix(in srgb, var(--accent-color) 16%, transparent)',
                    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent-color) 44%, transparent)',
                  }
                : {
                    color: 'var(--text-secondary)',
                    background: 'var(--surface-2)',
                    boxShadow: 'inset 0 0 0 1px var(--border-subtle)',
                  }
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function MultiToggle<T extends string>({
  values,
  options,
  onToggle,
}: {
  values: T[];
  options: { value: T; label: string }[];
  onToggle: (v: T) => void;
}) {
  return (
    <div className="flex gap-1">
      {options.map((o) => {
        const active = values.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(o.value)}
            className="slayer-num flex-1 rounded-[3px] px-1.5 py-[3px] text-[10px] font-semibold transition-colors"
            style={
              active
                ? {
                    color: 'var(--accent-color)',
                    background: 'color-mix(in srgb, var(--accent-color) 16%, transparent)',
                    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent-color) 44%, transparent)',
                  }
                : {
                    color: 'var(--text-secondary)',
                    background: 'var(--surface-2)',
                    boxShadow: 'inset 0 0 0 1px var(--border-subtle)',
                  }
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const inputCls =
  'slayer-num min-w-0 flex-1 rounded-[3px] bg-[var(--surface-2)] px-1.5 py-[3px] text-[10px] text-[var(--text-primary)] placeholder:text-[var(--text-faint)] outline-none focus:shadow-[inset_0_0_0_1px_var(--accent-color)]';

function Range({
  min,
  max,
  onMin,
  onMax,
  prefix,
  suffix,
  placeholderMin = 'Min',
  placeholderMax = 'Max',
}: {
  min: string;
  max: string;
  onMin: (v: string) => void;
  onMax: (v: string) => void;
  prefix?: string;
  suffix?: string;
  placeholderMin?: string;
  placeholderMax?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex flex-1 items-center gap-1 rounded-[3px] bg-[var(--surface-2)] pl-1.5">
        {prefix ? <span className="text-[10px] text-[var(--text-faint)]">{prefix}</span> : null}
        <input
          inputMode="numeric"
          value={min}
          onChange={(e) => onMin(e.target.value)}
          placeholder={placeholderMin}
          className={`${inputCls} bg-transparent focus:shadow-none`}
        />
      </div>
      <span className="shrink-0 text-[9px] text-[var(--text-faint)]">to</span>
      <div className="flex flex-1 items-center gap-1 rounded-[3px] bg-[var(--surface-2)] pl-1.5">
        {prefix ? <span className="text-[10px] text-[var(--text-faint)]">{prefix}</span> : null}
        <input
          inputMode="numeric"
          value={max}
          onChange={(e) => onMax(e.target.value)}
          placeholder={placeholderMax}
          className={`${inputCls} bg-transparent focus:shadow-none`}
        />
      </div>
      {suffix ? <span className="shrink-0 text-[9px] text-[var(--text-faint)]">{suffix}</span> : null}
    </div>
  );
}

function BiasSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const id = useId();
  const caption = value === 0 ? 'All' : value > 0 ? `Bull ${value}` : `Bear ${Math.abs(value)}`;
  return (
    <div className="mt-1.5">
      <div className={microLabel}>{label}</div>
      <div className="mt-1 flex items-center justify-between text-[9px] text-[var(--text-faint)]">
        <span>Bear</span>
        <span>Bull</span>
      </div>
      <input
        id={id}
        type="range"
        min={-100}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-0.5 h-1 w-full cursor-pointer"
        style={{ accentColor: 'var(--accent-color)' }}
        aria-label={label}
      />
      <div className="text-center text-[9px] font-semibold text-[var(--text-muted)]">{caption}</div>
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
  icon,
  full,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon?: string;
  full?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`slayer-num rounded-[3px] px-2 py-[4px] text-left text-[10px] font-semibold transition-colors ${full ? 'w-full' : ''}`}
      style={
        active
          ? {
              color: 'var(--accent-color)',
              background: 'color-mix(in srgb, var(--accent-color) 16%, transparent)',
              boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent-color) 44%, transparent)',
            }
          : {
              color: 'var(--text-secondary)',
              background: 'var(--surface-2)',
              boxShadow: 'inset 0 0 0 1px var(--border-subtle)',
            }
      }
    >
      {icon ? <span className="mr-1 opacity-70">{icon}</span> : null}
      {label}
    </button>
  );
}

// ── Main rail ────────────────────────────────────────────────────────────────
export default function FlowFilters({
  value,
  onChange,
  activeCount,
}: {
  value: FlowFilterState;
  onChange: (next: FlowFilterState) => void;
  activeCount: number;
}) {
  const set = (patch: Partial<FlowFilterState>) => onChange({ ...value, ...patch });
  const toggleEquity = (k: EquityKind) =>
    set({
      equity: value.equity.includes(k)
        ? value.equity.filter((x) => x !== k)
        : [...value.equity, k],
    });

  return (
    <div className="flex min-h-0 flex-col">
      <div className="slayer-scrollbar min-h-0 flex-1 overflow-y-auto">
        <Section label="Type">
          <Segmented
            ariaLabel="Contract type"
            value={value.type}
            onChange={(type) => set({ type })}
            options={[
              { value: 'all', label: 'All' },
              { value: 'calls', label: 'Calls' },
              { value: 'puts', label: 'Puts' },
            ]}
          />
        </Section>

        <Section label="Equity Type">
          <MultiToggle
            values={value.equity}
            onToggle={toggleEquity}
            options={[
              { value: 'stocks', label: 'Stocks' },
              { value: 'etf', label: 'ETF' },
              { value: 'indices', label: 'Indices' },
            ]}
          />
        </Section>

        <Section label="Expiry Date">
          <div className="flex items-center gap-1 rounded-[3px] bg-[var(--surface-2)] px-1.5 shadow-[inset_0_0_0_1px_var(--border-subtle)]">
            <input
              type="date"
              value={value.expiryDate}
              onChange={(e) => set({ expiryDate: e.target.value })}
              className="slayer-num min-w-0 flex-1 bg-transparent py-[4px] text-[10px] text-[var(--text-secondary)] outline-none [color-scheme:dark]"
            />
          </div>
        </Section>

        <Section label="Days to Expiry">
          <Range min={value.dteMin} max={value.dteMax} onMin={(dteMin) => set({ dteMin })} onMax={(dteMax) => set({ dteMax })} />
        </Section>

        <Section label="Premium">
          <Range min={value.premMin} max={value.premMax} onMin={(premMin) => set({ premMin })} onMax={(premMax) => set({ premMax })} prefix="$" />
        </Section>

        <Section label="Open Interest">
          <Range min={value.oiMin} max={value.oiMax} onMin={(oiMin) => set({ oiMin })} onMax={(oiMax) => set({ oiMax })} />
        </Section>

        <Section label="Volume">
          <Range min={value.volMin} max={value.volMax} onMin={(volMin) => set({ volMin })} onMax={(volMax) => set({ volMax })} />
        </Section>

        <Section label="Vol / OI Ratio">
          <Range min={value.volOiMin} max={value.volOiMax} onMin={(volOiMin) => set({ volOiMin })} onMax={(volOiMax) => set({ volOiMax })} />
        </Section>

        <Section label="% OTM">
          <Range min={value.otmMin} max={value.otmMax} onMin={(otmMin) => set({ otmMin })} onMax={(otmMax) => set({ otmMax })} placeholderMin="Min %" placeholderMax="Max %" />
          <div className="mt-1 text-[9px] text-[var(--text-faint)]">Negative = ITM</div>
        </Section>

        <Section label="Stock Price">
          <Range min={value.stockMin} max={value.stockMax} onMin={(stockMin) => set({ stockMin })} onMax={(stockMax) => set({ stockMax })} prefix="$" />
        </Section>

        <Section label="Strike Price">
          <Range min={value.strikeMin} max={value.strikeMax} onMin={(strikeMin) => set({ strikeMin })} onMax={(strikeMax) => set({ strikeMax })} prefix="$" />
        </Section>

        <Section label="Avg Price">
          <Range min={value.avgMin} max={value.avgMax} onMin={(avgMin) => set({ avgMin })} onMax={(avgMax) => set({ avgMax })} prefix="$" />
        </Section>

        <Section label="% Multi">
          <Range min={value.multiMin} max={value.multiMax} onMin={(multiMin) => set({ multiMin })} onMax={(multiMax) => set({ multiMax })} placeholderMin="Min %" placeholderMax="Max %" />
        </Section>

        <Section label="Contract Ask %">
          <Range min={value.askMin} max={value.askMax} onMin={(askMin) => set({ askMin })} onMax={(askMax) => set({ askMax })} placeholderMin="Min %" placeholderMax="Max %" />
          <div className={`${microLabel} mt-2.5`}>Bid %</div>
          <div className="mt-1.5">
            <Range min={value.bidMin} max={value.bidMax} onMin={(bidMin) => set({ bidMin })} onMax={(bidMax) => set({ bidMax })} placeholderMin="Min %" placeholderMax="Max %" />
          </div>
          <div className={`${microLabel} mt-2.5`}>Skew %</div>
          <div className="mt-1.5">
            <Range min={value.skewMin} max={value.skewMax} onMin={(skewMin) => set({ skewMin })} onMax={(skewMax) => set({ skewMax })} placeholderMin="Min %" placeholderMax="Max %" />
          </div>
        </Section>

        <Section label="Sentiment">
          <BiasSlider label="Contract" value={value.sentContract} onChange={(sentContract) => set({ sentContract })} />
          <BiasSlider label="Chain" value={value.sentChain} onChange={(sentChain) => set({ sentChain })} />
        </Section>

        <Section label="Filters">
          <div className="flex flex-col gap-1.5">
            <Chip full label="Exclude ITM" active={value.excludeITM} onClick={() => set({ excludeITM: !value.excludeITM })} />
            <Chip full label="Exclude 0DTE" active={value.exclude0DTE} onClick={() => set({ exclude0DTE: !value.exclude0DTE })} />
            <Chip full label="OTM Only" active={value.otmOnly} onClick={() => set({ otmOnly: !value.otmOnly })} />
            <Chip full label="OPEX Only" active={value.opexOnly} onClick={() => set({ opexOnly: !value.opexOnly })} />
          </div>
        </Section>

        <Section label="Signal">
          <Chip label="OI Growth" icon="↗" active={value.signalOIGrowth} onClick={() => set({ signalOIGrowth: !value.signalOIGrowth })} />
        </Section>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] px-2.5 py-2">
        <span className="slayer-num text-[9px] text-[var(--text-muted)]">
          {activeCount} active {activeCount === 1 ? 'filter' : 'filters'}
        </span>
        <span className="text-[9px] text-[var(--text-faint)]">Screener 1 — auto-saved</span>
      </div>
    </div>
  );
}

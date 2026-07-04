import React from 'react';

/**
 * Slayer terminal ToggleGroup — a compact segmented control for chart/data modes.
 * Single- or multi-select. Selected state uses a subtle raised inset, not a loud
 * fill, so it stays terminal-quiet. For overlay stacks use `type="multiple"`.
 */

export interface ToggleOption<V extends string> {
  value: V;
  label: React.ReactNode;
  icon?: React.ReactNode;
  hint?: string;
}

interface BaseProps<V extends string> {
  options: readonly ToggleOption<V>[];
  ariaLabel?: string;
  size?: 'sm' | 'md';
  className?: string;
}

interface SingleProps<V extends string> extends BaseProps<V> {
  type?: 'single';
  value: V;
  onChange: (value: V) => void;
}

interface MultiProps<V extends string> extends BaseProps<V> {
  type: 'multiple';
  value: readonly V[];
  onChange: (value: V[]) => void;
}

export function ToggleGroup<V extends string>(props: SingleProps<V> | MultiProps<V>) {
  const { options, ariaLabel, size = 'md', className = '' } = props;
  const pad = size === 'sm' ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-[11px]';

  const isActive = (v: V) =>
    props.type === 'multiple' ? props.value.includes(v) : props.value === v;

  const toggle = (v: V) => {
    if (props.type === 'multiple') {
      const set = new Set(props.value);
      set.has(v) ? set.delete(v) : set.add(v);
      props.onChange(Array.from(set));
    } else {
      props.onChange(v);
    }
  };

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-1 ${className}`}
    >
      {options.map(opt => {
        const active = isActive(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            aria-pressed={active}
            title={opt.hint}
            className={`inline-flex items-center gap-1.5 rounded-md font-mono font-medium uppercase tracking-wide transition-colors ${pad} ${
              active
                ? 'bg-[var(--surface-3)] text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--border-strong)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-3)]/50'
            }`}
          >
            {opt.icon && <span className="shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">{opt.icon}</span>}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

interface SegmentedControlProps<V extends string> {
  options: readonly { value: V; label: string; disabled?: boolean }[];
  value: V;
  onChange: (value: V) => void;
  ariaLabel?: string;
}

/** Compact segmented selector — cyan reserved for the selected state. */
const SegmentedControl = <V extends string>({ options, value, onChange, ariaLabel }: SegmentedControlProps<V>) => {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex items-center border border-borderSubtle bg-panel rounded-md overflow-hidden"
    >
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => !opt.disabled && onChange(opt.value)}
            aria-pressed={active}
            disabled={opt.disabled}
            className={`relative px-3 py-1.5 font-mono text-xs font-medium transition-colors focus-visible:outline-none focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60 ${i > 0 ? 'border-l border-borderSubtle' : ''} ${
              opt.disabled
                ? 'cursor-not-allowed text-textSecondary/40'
                : active
                ? 'bg-select/[0.08] text-select'
                : 'text-textSecondary hover:text-textPrimary hover:bg-white/[0.03]'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};

export default SegmentedControl;

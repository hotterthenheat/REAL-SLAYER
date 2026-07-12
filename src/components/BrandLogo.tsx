import React from 'react';

/**
 * Brand mark — a faithful port of the slayerterminal.com terminal logo.
 *   collapsed:  >S▌            (the icon mark)
 *   expanded:   >slayer_terminal▌   (the full wordmark)
 * Exact colors / weights / caret timing lifted from the source site:
 *   prompt ">" = #6B7177 (weight 700, .84em) · wordmark/caret = #F4F5F6 (weight 800)
 *   caret blink = `slayer-caret` (1.08s steps(1)) defined in index.css.
 *
 * Theme legibility: the HTML-exact colors are the DEFAULTS of two CSS vars —
 * var(--brand-prompt, #6B7177) / var(--brand-ink, #F4F5F6) — which .light-theme
 * overrides in index.css (ink → near-black) so the mark never disappears on
 * light surfaces. The caret + its glow follow --brand-ink via color-mix.
 */

const PROMPT = 'var(--brand-prompt, #6B7177)'; // --dim  : the ">" terminal prompt
const WHITE = 'var(--brand-ink, #F4F5F6)';     // --white : the S / wordmark / caret

export function TerminalLogo({ expanded = false }: { expanded?: boolean }) {
  const fontSize = expanded ? 18 : 24;
  return (
    <span
      className="inline-flex items-center select-none leading-none"
      style={{
        fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontWeight: 800,
        fontSize,
        lineHeight: 1,
      }}
      aria-label="Slayer Terminal"
    >
      <span
        aria-hidden="true"
        style={{ color: PROMPT, fontWeight: 700, fontSize: '0.84em', marginRight: expanded ? '0.04em' : '1px' }}
      >
        {'>'}
      </span>
      <span
        className="slayer-logo-sweep"
        style={{ color: WHITE, letterSpacing: expanded ? '-0.02em' : '-0.5px' }}
      >
        {expanded ? 'slayer_terminal' : 'S'}
      </span>
      <span
        aria-hidden="true"
        className="slayer-caret slayer-caret-accent"
        style={{
          display: 'inline-block',
          width: expanded ? '0.5em' : '0.42em',
          height: expanded ? '0.92em' : '0.88em',
          marginLeft: expanded ? '0.14em' : '0.125em',
          borderRadius: expanded ? 2 : 1,
          background: 'var(--accent-ink, #D06A8C)',
        }}
      />
    </span>
  );
}

export function BrandHeader({ expanded = false }: { expanded?: boolean }) {
  return (
    <div className="flex items-center select-none">
      <TerminalLogo expanded={expanded} />
    </div>
  );
}

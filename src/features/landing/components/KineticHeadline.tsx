import type { CSSProperties } from 'react';

/**
 * KineticHeadline — oversized statement lines, each clipped by its own
 * overflow-hidden mask with an inner `[data-kinetic-line]` span. It is purely
 * presentational: the PARENT scene's GSAP timeline selects the inner spans and
 * drives them (opposite-direction horizontal scrub, vertical reveal, block
 * wipes). Keeping the animation in the parent means one owner per node and lets
 * the same headline be reused at any major transition.
 *
 * `data-dir` on each line marks the intended travel direction (+1 / -1) so a
 * parent can move alternating lines in opposite directions without hard-coding.
 */
interface Props {
  lines: string[];
  className?: string;
  style?: CSSProperties;
  /** color of the statement text. */
  color?: string;
}

export function KineticHeadline({ lines, className = '', style, color = '#F4F4F5' }: Props) {
  return (
    <div className={className} style={style} aria-hidden="true">
      {lines.map((ln, i) => (
        <span key={ln} className="block overflow-hidden leading-[0.98]">
          <span
            data-kinetic-line
            data-dir={i % 2 === 0 ? 1 : -1}
            className="block whitespace-nowrap font-semibold will-change-transform"
            style={{ color, letterSpacing: '-0.02em' }}
          >
            {ln}
          </span>
        </span>
      ))}
      {/* accessible text for AT / reduced motion (the visual is aria-hidden) */}
      <span className="sr-only">{lines.join('. ')}</span>
    </div>
  );
}

export default KineticHeadline;

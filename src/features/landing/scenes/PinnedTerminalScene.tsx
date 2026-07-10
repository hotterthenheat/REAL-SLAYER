import { forwardRef, useRef, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { GSAP_EASE_PRIMARY, GSAP_EASE_SMOOTH, TRIGGER } from '../motion/motionTokens';
import { useLandingMotion } from '../motion/LandingMotionProvider';
import {
  PALETTE,
  MicroPositioning,
  MicroRanked,
  MicroGamma,
  MicroHeatmap,
  MicroBlotter,
  MicroTicks,
} from '../content/LandingSections';

gsap.registerPlugin(ScrollTrigger);

/**
 * Scene 4 — the pinned terminal-window sequence.
 *
 * A single Slayer terminal window rises from below, locks centred, and is PINNED
 * while its INNER content masks through the real Slayer module states — Pinpoint
 * GEX → SkyVision → Dealer Flow → Live Terminal / Quant — before drifting up into
 * the next section. The outer TerminalWindowFrame chrome (wordmark, status dot,
 * window controls, module rail) stays stationary; only the content area moves.
 *
 * Ownership contract: ONE gsap timeline + ScrollTrigger (id: TRIGGER.terminalPin)
 * owns the frame's rise/drift transform and each state layer's transform + opacity
 * + clip-path. Transitions are masked vertical wipes with a small depth shift (a
 * scale nudge), never a flat opacity crossfade; only one state is fully visible at
 * a time. Everything is scrubbed, so scrolling up reverses cleanly with no blank
 * window. Under reduced motion the whole timeline is skipped: the window renders
 * once, fully formed, showing a single representative state. On mobile there is no
 * pin — the states stack vertically and stay readable.
 *
 * Data is static hand-written product-true snapshot data fed to the lightweight
 * Micro* replicas; nothing here is a live/simulated feed and no heavy app module
 * is mounted.
 */

const line = 'var(--border)';
const lineStrong = 'var(--border-strong)';
const muted = 'var(--text-secondary)';
const faint = 'var(--text-tertiary)';

// clip-path masks — a state wipes in from below (top-clipped) and wipes out
// upward (bottom-clipped). Identical 4-value % structure so GSAP interpolates.
const SHOWN = 'inset(0% 0% 0% 0%)';
const BELOW = 'inset(100% 0% 0% 0%)';
const EXIT_UP = 'inset(0% 0% 100% 0%)';

/* ── static product-true snapshot (hand-written; not a live feed) ─────────── */
type PRow = { strike: number; net: number; kind?: 'callWall' | 'putWall' | 'pin' | 'spot' };
type RRow = { symbol: string; setup: string; bias: 'BULL' | 'BEAR'; confidence: number; expMovePct?: number | null };

const SPOT = 5990;
const CALL_WALL = 6050;
const PUT_WALL = 5900;
const PIN = 5950;

const PRESSURE: PRow[] = [
  { strike: 6050, net: 8.4e8, kind: 'callWall' },
  { strike: 6025, net: 5.1e8 },
  { strike: 6000, net: 2.3e8 },
  { strike: 5990, net: 0.5e8, kind: 'spot' },
  { strike: 5975, net: -2.0e8 },
  { strike: 5950, net: -4.7e8, kind: 'pin' },
  { strike: 5900, net: -7.9e8, kind: 'putWall' },
];

const RANKED: RRow[] = [
  { symbol: 'SPX 5950P', setup: 'Mispriced', bias: 'BEAR', confidence: 92, expMovePct: 0.0061 },
  { symbol: 'SPX 6050C', setup: 'Mispriced', bias: 'BULL', confidence: 89, expMovePct: 0.0061 },
  { symbol: 'NDX 21500P', setup: 'Mispriced', bias: 'BEAR', confidence: 87, expMovePct: 0.0074 },
  { symbol: 'SPY 599C', setup: 'Mispriced', bias: 'BULL', confidence: 85, expMovePct: 0.0058 },
];

const TICKS: number[] = [
  5982, 5985, 5983, 5988, 5991, 5987, 5990, 5994,
  5992, 5996, 5993, 5989, 5994, 5998, 5995, 5990,
];

/* ── module states ────────────────────────────────────────────────────────── */
interface StateDef {
  id: string;
  tab: string;      // onEnter() target
  short: string;    // rail label
  kicker: string;   // inner eyebrow
  title: string;    // inner heading
  meta: string;     // right-aligned inner meta
  accent: string;   // categorical dot colour
  render: () => ReactNode;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[8px] font-semibold uppercase tracking-[0.16em]" style={{ color: faint }}>{label}</div>
      <div className="mt-0.5 text-[12px] font-semibold tabular-nums leading-none" style={{ color: tone ?? PALETTE.text }}>{value}</div>
    </div>
  );
}

function SubLabel({ children, color = faint }: { children: ReactNode; color?: string }) {
  return (
    <div className="mb-1.5 text-[8.5px] font-semibold uppercase tracking-[0.16em]" style={{ color }}>{children}</div>
  );
}

const STATES: StateDef[] = [
  {
    id: 'pinpoint',
    tab: 'pinpoint',
    short: 'GEX',
    kicker: 'Pinpoint · GEX',
    title: 'Dealer positioning & hedging flow',
    meta: 'SPX · 0DTE',
    accent: PALETTE.amber,
    render: () => (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          <Stat label="Net GEX" value="−$1.84B" tone={PALETTE.red} />
          <Stat label="Spot" value="5,990.4" tone={PALETTE.ghost} />
          <Stat label="Call Wall" value="6,050" tone={PALETTE.steel} />
          <Stat label="Put Wall" value="5,900" tone={PALETTE.red} />
          <Stat label="Pin" value="5,950" tone={PALETTE.amber} />
          <Stat label="Exp Move" value="0.61%" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <SubLabel color={PALETTE.steel}>Dealer Positioning</SubLabel>
            <MicroPositioning rows={PRESSURE} spot={SPOT} />
          </div>
          <div>
            <SubLabel color={PALETTE.amber}>Net Gamma · Strike</SubLabel>
            <MicroGamma rows={PRESSURE} spot={SPOT} callWall={CALL_WALL} putWall={PUT_WALL} />
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'skyvision',
    tab: 'skyvision',
    short: 'SKY',
    kicker: 'SkyVision · Ranked',
    title: 'Ranked trade setups',
    meta: 'strongest first',
    accent: PALETTE.steel,
    render: () => (
      <div className="flex flex-col gap-2">
        <SubLabel color={PALETTE.steel}>Ranked Setups · Confidence</SubLabel>
        <MicroRanked rows={RANKED} />
        <div className="text-[9px] leading-relaxed" style={{ color: muted }}>
          Every candidate scored on dealer structure, mispricing and expected move — sorted strongest first.
        </div>
      </div>
    ),
  },
  {
    id: 'dealerflow',
    tab: 'dealerflow',
    short: 'FLW',
    kicker: 'Dealer Flow · Tape',
    title: 'Unusual options & dark-pool prints',
    meta: 'signed flow',
    accent: PALETTE.green,
    render: () => (
      <div className="flex flex-col gap-2">
        <SubLabel color={PALETTE.green}>Print Blotter · Signed PnL</SubLabel>
        <MicroBlotter />
        <div className="text-[9px] leading-relaxed" style={{ color: muted }}>
          Prints stream against a zero axis — green lifts, red hits — with entry meta on the rail.
        </div>
      </div>
    ),
  },
  {
    id: 'liveterminal',
    tab: 'liveterminal',
    short: 'LIV',
    kicker: 'Live Terminal · Quant',
    title: 'Chart, GEX nodes & vol surface',
    meta: 'levels + models',
    accent: PALETTE.red,
    render: () => (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <SubLabel color={PALETTE.steel}>Price · GEX Nodes</SubLabel>
          <MicroTicks data={TICKS} />
        </div>
        <div>
          <SubLabel color={PALETTE.amber}>IV Surface · K/F × DTE</SubLabel>
          <MicroHeatmap />
        </div>
      </div>
    ),
  },
];

/* ── the stationary terminal chrome ───────────────────────────────────────── */
const TerminalWindowFrame = forwardRef<HTMLDivElement, { rail: ReactNode; children: ReactNode }>(
  function TerminalWindowFrame({ rail, children }, ref) {
    return (
      <div
        ref={ref}
        className="w-full max-w-[560px] overflow-hidden will-change-transform"
        style={{
          background: PALETTE.panel,
          border: `1px solid ${line}`,
          borderRadius: 10,
          boxShadow: '0 30px 70px -34px rgba(0,0,0,0.7)',
          transformOrigin: '50% 50%',
        }}
      >
        {/* title bar — stationary */}
        <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid ${line}` }}>
          <div className="flex items-center gap-2.5">
            {/* window controls */}
            <span className="flex items-center gap-1.5" aria-hidden="true">
              {[PALETTE.red, PALETTE.amber, PALETTE.green].map((c) => (
                <span key={c} className="h-[7px] w-[7px] rounded-full" style={{ background: c, opacity: 0.75 }} />
              ))}
            </span>
            <span className="inline-flex items-center text-[12px] font-bold leading-none" style={{ fontFamily: 'var(--font-brand)', letterSpacing: '-0.01em' }}>
              <span style={{ color: 'var(--brand-prompt, #6B7177)', fontWeight: 700, fontSize: '0.84em', marginRight: '0.05em' }}>&gt;</span>
              <span style={{ color: 'var(--brand-ink, #F4F5F6)' }}>slayer_terminal</span>
            </span>
          </div>
          <span className="flex items-center gap-1.5 text-[9px] tabular-nums" style={{ color: muted }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: PALETTE.green }} />
            SPX · 0DTE
          </span>
        </div>
        {/* module rail — stationary; the active module is driven by the timeline */}
        {rail}
        {/* content area — the changing states live here */}
        {children}
      </div>
    );
  },
);

/* ── the scene ────────────────────────────────────────────────────────────── */
export function PinnedTerminalScene({ onEnter }: { onEnter: (tab?: string) => void }) {
  const { reduced, mode } = useLandingMotion();

  const scope = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const statesRef = useRef<(HTMLDivElement | null)[]>([]);
  const dotsRef = useRef<(HTMLButtonElement | null)[]>([]);

  useGSAP(
    () => {
      const frame = frameRef.current;
      if (!frame) return;
      const states = statesRef.current;
      const dots = dotsRef.current;

      // REDUCED MOTION — no pin, no scrub. One representative state, fully formed.
      if (reduced) {
        gsap.set(frame, { yPercent: 0, scale: 1, borderRadius: 10, autoAlpha: 1 });
        states.forEach((n, i) => {
          if (!n) return;
          if (i === 0) gsap.set(n, { autoAlpha: 1, yPercent: 0, scale: 1, clipPath: SHOWN, display: 'block' });
          else gsap.set(n, { autoAlpha: 0, display: 'none' });
        });
        dots.forEach((d, i) => { if (d) gsap.set(d, { opacity: i === 0 ? 1 : 0.4 }); });
        return;
      }

      const mm = gsap.matchMedia();
      mm.add(
        {
          desktop: '(min-width: 1024px)',
          tablet: '(min-width: 640px) and (max-width: 1023.98px)',
          mobile: '(max-width: 639.98px)',
        },
        (ctx) => {
          const cond = ctx.conditions as { desktop: boolean; tablet: boolean; mobile: boolean };

          // MOBILE — light: no pin. States stack (they are `relative` here) and
          // every module reads at once. The frame renders fully formed.
          if (cond.mobile) {
            gsap.set(frame, { yPercent: 0, scale: 1, borderRadius: 10, autoAlpha: 1 });
            states.forEach((n) => { if (n) gsap.set(n, { autoAlpha: 1, yPercent: 0, scale: 1, clipPath: SHOWN, display: 'block' }); });
            dots.forEach((d) => { if (d) gsap.set(d, { opacity: 1 }); });
            return;
          }

          // DESKTOP (4 states) / TABLET (3 states, shorter pin).
          const active = cond.desktop ? [0, 1, 2, 3] : [0, 1, 2];

          // init: state 0 shown, other active states waiting below, the rest off.
          states.forEach((n, i) => {
            if (!n) return;
            if (i === 0) gsap.set(n, { autoAlpha: 1, yPercent: 0, scale: 1, clipPath: SHOWN, display: 'block' });
            else if (active.includes(i)) gsap.set(n, { autoAlpha: 0, yPercent: 8, scale: 0.985, clipPath: BELOW, display: 'block' });
            else gsap.set(n, { autoAlpha: 0, display: 'block' });
          });
          dots.forEach((d, i) => { if (d) gsap.set(d, { opacity: i === active[0] ? 1 : 0.4 }); });

          const tl = gsap.timeline({
            defaults: { ease: 'none' },
            scrollTrigger: {
              trigger: scope.current,
              start: 'top top',
              end: 'bottom bottom',
              pin: stageRef.current,
              // The section itself reserves the scroll length (240–320vh) while
              // the 100vh stage stays pinned — so NO extra spacer (would gap).
              pinSpacing: false,
              anticipatePin: 1,
              scrub: true,
              invalidateOnRefresh: true,
              id: TRIGGER.terminalPin,
            },
          });

          // 1) rise from below → lock in (scale + translate + radius ease).
          tl.fromTo(
            frame,
            { yPercent: 16, scale: 0.78, borderRadius: 16, autoAlpha: 0.55 },
            { yPercent: 0, scale: 1, borderRadius: 10, autoAlpha: 1, duration: 1, ease: GSAP_EASE_PRIMARY },
          );
          tl.to({}, { duration: 0.5 }); // hold state 0

          // 2) masked vertical transitions between consecutive states.
          for (let j = 1; j < active.length; j++) {
            const prevN = states[active[j - 1]];
            const curN = states[active[j]];
            if (!prevN || !curN) continue;
            tl.to(prevN, { yPercent: -6, scale: 0.985, autoAlpha: 0, clipPath: EXIT_UP, duration: 0.6, ease: GSAP_EASE_SMOOTH });
            tl.fromTo(
              curN,
              { yPercent: 8, scale: 0.985, autoAlpha: 0, clipPath: BELOW },
              { yPercent: 0, scale: 1, autoAlpha: 1, clipPath: SHOWN, duration: 0.6, ease: GSAP_EASE_SMOOTH },
              '<',
            );
            const prevDot = dots[active[j - 1]];
            const curDot = dots[active[j]];
            if (prevDot) tl.to(prevDot, { opacity: 0.4, duration: 0.3 }, '<');
            if (curDot) tl.to(curDot, { opacity: 1, duration: 0.3 }, '<');
            tl.to({}, { duration: 0.7 }); // hold
          }

          // 3) unpin — the window drifts up into the following section.
          tl.to(frame, { yPercent: -16, scale: 0.985, autoAlpha: 0.85, duration: 0.8, ease: GSAP_EASE_SMOOTH });
        },
      );

      return () => { mm.revert(); };
    },
    { scope, dependencies: [reduced, mode] },
  );

  // The stationary module rail (progress indicator + cross-into-terminal shortcuts).
  const rail = (
    <div className="flex flex-wrap items-center gap-1 px-2.5 py-1.5" style={{ borderBottom: `1px solid ${line}` }}>
      {STATES.map((s, i) => (
        <button
          key={s.id}
          type="button"
          ref={(el) => { dotsRef.current[i] = el; }}
          onClick={() => onEnter(s.tab)}
          className="flex cursor-pointer items-center gap-1.5 rounded-[6px] px-2 py-1 transition-colors focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
          style={{ background: 'transparent' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--text-primary) 6%, transparent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          aria-label={`Open ${s.short} module`}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.accent }} />
          <span className="text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: muted }}>{s.short}</span>
        </button>
      ))}
    </div>
  );

  return (
    <section
      ref={scope}
      data-scene="pinned-terminal"
      className="relative w-full overflow-x-clip min-h-0 sm:min-h-[240vh] lg:min-h-[320vh]"
      style={{ background: 'var(--background)' }}
    >
      <div
        ref={stageRef}
        className="flex w-full items-center justify-center overflow-x-clip px-5 py-12 sm:h-screen sm:py-0"
      >
        <TerminalWindowFrame ref={frameRef} rail={rail}>
          <div className="relative flex flex-col gap-3 p-1 sm:block sm:min-h-[380px] sm:p-0">
            {/* shared data rails — stationary continuity behind the states (sm+ only) */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden sm:block" style={{ zIndex: 0 }}>
              <div className="absolute inset-y-6 left-1/2 w-px" style={{ background: lineStrong, opacity: 0.5 }} />
              <div className="absolute inset-x-6 top-1/2 h-px" style={{ background: line }} />
            </div>
            {STATES.map((s, i) => (
              <div
                key={s.id}
                ref={(el) => { statesRef.current[i] = el; }}
                className="relative z-[1] will-change-transform sm:absolute sm:inset-0"
                style={{ transformOrigin: '50% 50%' }}
              >
                <div className="flex flex-col gap-3 p-4 sm:h-full sm:justify-center">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[9px] font-semibold uppercase tracking-[0.2em]" style={{ color: s.accent }}>{s.kicker}</div>
                      <div className="mt-1 text-[13px] font-semibold leading-snug" style={{ color: PALETTE.ghost }}>{s.title}</div>
                    </div>
                    <span className="shrink-0 text-[8.5px] font-semibold uppercase tracking-[0.16em]" style={{ color: faint }}>{s.meta}</span>
                  </div>
                  <div>{s.render()}</div>
                </div>
              </div>
            ))}
          </div>
        </TerminalWindowFrame>
      </div>
    </section>
  );
}

export default PinnedTerminalScene;

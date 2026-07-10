import { useRef, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { GSAP_EASE_PRIMARY, TRIGGER } from '../motion/motionTokens';
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
 * Scene 3 — THE DESK. One large, full-width terminal window showing every module
 * at once, exactly like the product's workspace: stats rail on top, price + dealer
 * positioning as the main read, ranked setups / net gamma / vol surface / blotter
 * beneath. This replaces the old pinned scrub sequence (a 720px window masking
 * through 4 states over 260vh of scroll): the desk is now ALWAYS a finished frame —
 * no scroll trap, no mid-wipe intermediate states, no ocean of empty canvas.
 *
 * Motion contract: a single enter-once timeline (window rises, panels stagger in)
 * fired at 72% viewport — never scrubbed, so stopping the scroll can never leave a
 * half-composed screen. Under reduced motion it renders fully formed and still.
 *
 * Data is static hand-written product-true snapshot data fed to the lightweight
 * Micro* replicas; nothing here is a live/simulated feed and no heavy app module
 * is mounted.
 */

const line = 'var(--border)';
const muted = 'var(--text-secondary)';
const faint = 'var(--text-tertiary)';

/* ── static product-true snapshot (hand-written; not a live feed) ─────────── */
type PRow = { strike: number; net: number; kind?: 'callWall' | 'putWall' | 'pin' | 'spot' };
type RRow = { symbol: string; setup: string; bias: 'BULL' | 'BEAR'; confidence: number; expMovePct?: number | null };

const SPOT = 5990;
const CALL_WALL = 6050;
const PUT_WALL = 5900;

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

/* ── desk cells ───────────────────────────────────────────────────────────── */

const MODULE_CHIPS: { short: string; tab: string; accent: string }[] = [
  { short: 'GEX', tab: 'pinpoint', accent: PALETTE.amber },
  { short: 'SKY', tab: 'skyvision', accent: PALETTE.steel },
  { short: 'FLW', tab: 'dealerflow', accent: PALETTE.green },
  { short: 'LIV', tab: 'liveterminal', accent: PALETTE.red },
  { short: 'QNT', tab: 'quant', accent: PALETTE.amber },
];

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="desk-cell min-w-0 px-3.5 py-3" style={{ background: PALETTE.panel }}>
      <div className="text-[8.5px] font-semibold uppercase tracking-[0.16em]" style={{ color: faint }}>{label}</div>
      <div className="mt-1 text-[15px] font-semibold tabular-nums leading-none" style={{ color: tone ?? PALETTE.text }}>{value}</div>
    </div>
  );
}

/** A desk panel: module-coloured label, the authentic Micro* replica (its own
 *  inner frame stripped — the desk's hairline grid is the only chrome), and an
 *  optional one-line read. */
function Cell({ label, color, caption, className = '', children }: {
  label: string; color: string; caption?: string; className?: string; children: ReactNode;
}) {
  return (
    <div className={`desk-cell flex min-w-0 flex-col gap-2 p-3.5 ${className}`} style={{ background: PALETTE.panel }}>
      <div className="text-[8.5px] font-semibold uppercase tracking-[0.18em]" style={{ color }}>{label}</div>
      {/* strip the micros' own border/fill — inside the ruled desk they are naked */}
      <div className="min-w-0 flex-1 [&>div]:!border-0 [&>div]:!bg-transparent [&>div]:!p-0">{children}</div>
      {caption ? <div className="text-[9px] leading-relaxed" style={{ color: muted }}>{caption}</div> : null}
    </div>
  );
}

/* ── the scene ────────────────────────────────────────────────────────────── */
export function PinnedTerminalScene({ onEnter }: { onEnter: (tab?: string) => void }) {
  const { reduced } = useLandingMotion();
  const scope = useRef<HTMLElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);

  useGSAP(
    () => {
      const frame = frameRef.current;
      if (!frame) return;
      const cells = gsap.utils.toArray<HTMLElement>('.desk-cell', frame);
      const head = gsap.utils.toArray<HTMLElement>('[data-desk-head]', scope.current!);

      if (reduced) {
        gsap.set([frame, ...cells, ...head], { autoAlpha: 1, y: 0 });
        return;
      }

      // Enter ONCE and stay composed — never scrubbed, never reversed into a
      // half-built frame. Head copy leads, the window rises, panels follow.
      gsap.set(head, { autoAlpha: 0, y: 18 });
      gsap.set(frame, { autoAlpha: 0, y: 34 });
      gsap.set(cells, { autoAlpha: 0, y: 14 });
      const tl = gsap.timeline({
        defaults: { ease: GSAP_EASE_PRIMARY },
        scrollTrigger: {
          id: TRIGGER.terminalPin,
          trigger: scope.current!,
          start: 'top 72%',
          once: true,
        },
      });
      tl.to(head, { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.08 }, 0);
      tl.to(frame, { autoAlpha: 1, y: 0, duration: 0.7 }, 0.12);
      tl.to(cells, { autoAlpha: 1, y: 0, duration: 0.55, stagger: 0.035 }, 0.3);
    },
    { scope, dependencies: [reduced], revertOnUpdate: true },
  );

  return (
    <section
      ref={scope}
      data-scene="terminal-desk"
      className="relative w-full px-5 py-24 sm:px-8"
      style={{ background: 'var(--background)', borderTop: `1px solid ${line}` }}
    >
      <div className="mx-auto w-full max-w-6xl">
        {/* section head — left-aligned, editorial */}
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <div data-desk-head className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase" style={{ letterSpacing: '0.28em', color: faint }}>
              <span className="inline-block h-1 w-1 rounded-full" style={{ background: PALETTE.green }} />
              The Terminal, Live
            </div>
            <h2 data-desk-head className="mt-3 text-[28px] font-semibold leading-tight sm:text-[36px]" style={{ color: PALETTE.ghost, letterSpacing: '-0.01em' }}>
              One desk. Every read.
            </h2>
            <p data-desk-head className="mt-3 text-[14px] leading-relaxed" style={{ color: muted }}>
              Positioning, ranked setups, dealer flow, volatility and the blotter — assembled
              into a single field of view. This is the actual layout of the desk.
            </p>
          </div>
          <button
            data-desk-head
            type="button"
            onClick={() => onEnter('pinpoint')}
            className="cursor-pointer text-[10.5px] font-semibold uppercase tracking-[0.16em] transition-colors focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none"
            style={{ color: PALETTE.steel }}
          >
            Open the terminal <span aria-hidden="true">→</span>
          </button>
        </div>

        {/* the desk — one window, every module, hairline-ruled (no floating boxes) */}
        <div
          ref={frameRef}
          className="w-full overflow-hidden will-change-transform"
          style={{ border: `1px solid ${line}`, borderRadius: 10, background: line, boxShadow: '0 40px 90px -40px rgba(0,0,0,0.7)' }}
        >
          {/* title bar */}
          <div className="flex items-center justify-between px-3.5 py-2.5" style={{ background: PALETTE.panel, borderBottom: `1px solid ${line}` }}>
            <div className="flex items-center gap-2.5">
              <span className="flex items-center gap-1.5" aria-hidden="true">
                {[PALETTE.red, PALETTE.amber, PALETTE.green].map((c) => (
                  <span key={c} className="h-[7px] w-[7px] rounded-full" style={{ background: c, opacity: 0.75 }} />
                ))}
              </span>
              <span className="inline-flex items-center text-[12px] font-bold leading-none" style={{ fontFamily: 'var(--font-brand)', letterSpacing: '-0.01em' }}>
                <span style={{ color: 'var(--brand-prompt, #6B7177)', fontWeight: 700, fontSize: '0.84em', marginRight: '0.05em' }}>&gt;</span>
                <span style={{ color: 'var(--brand-ink, #F4F5F6)' }}>slayer_terminal</span>
              </span>
              {/* module shortcuts — every chip crosses into the real module */}
              <span className="ml-2 hidden items-center gap-0.5 sm:flex">
                {MODULE_CHIPS.map((m) => (
                  <button
                    key={m.short}
                    type="button"
                    onClick={() => onEnter(m.tab)}
                    aria-label={`Open ${m.short} module`}
                    className="flex cursor-pointer items-center gap-1.5 rounded-[6px] px-2 py-1 transition-colors focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] focus:outline-none hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)]"
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.accent }} />
                    <span className="text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: muted }}>{m.short}</span>
                  </button>
                ))}
              </span>
            </div>
            <span className="flex items-center gap-1.5 text-[9px] tabular-nums" style={{ color: muted }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: PALETTE.green }} />
              SPX · 0DTE
            </span>
          </div>

          {/* stats rail — the desk's headline numbers */}
          <div className="grid grid-cols-3 gap-px sm:grid-cols-6" style={{ borderBottom: `1px solid ${line}` }}>
            <Stat label="Net GEX" value="−$1.84B" tone={PALETTE.red} />
            <Stat label="Spot" value="5,990.4" tone={PALETTE.ghost} />
            <Stat label="Call Wall" value="6,050" tone={PALETTE.steel} />
            <Stat label="Put Wall" value="5,900" tone={PALETTE.red} />
            <Stat label="Pin" value="5,950" tone={PALETTE.amber} />
            <Stat label="Exp Move" value="0.61%" />
          </div>

          {/* main read — price + dealer positioning side by side */}
          <div className="grid grid-cols-1 gap-px sm:grid-cols-12" style={{ borderBottom: `1px solid ${line}` }}>
            <Cell className="sm:col-span-7" label="Price · GEX Nodes" color={PALETTE.steel}
              caption="Candles against the dealer walls — where hedging caps and floors the move.">
              <MicroTicks data={TICKS} />
            </Cell>
            <Cell className="sm:col-span-5" label="Dealer Positioning" color={PALETTE.amber}
              caption="Net dealer inventory by strike; the spot rule marks where you trade.">
              <MicroPositioning rows={PRESSURE} spot={SPOT} />
            </Cell>
          </div>

          {/* supporting reads — setups, gamma, vol, tape */}
          <div className="grid grid-cols-1 gap-px sm:grid-cols-12">
            <Cell className="sm:col-span-4" label="SkyVision · Ranked" color={PALETTE.steel}
              caption="Every candidate scored on structure, mispricing and expected move.">
              <MicroRanked rows={RANKED} />
            </Cell>
            <Cell className="sm:col-span-3" label="Net Gamma · Strike" color={PALETTE.amber}>
              <MicroGamma rows={PRESSURE} spot={SPOT} callWall={CALL_WALL} putWall={PUT_WALL} />
            </Cell>
            <Cell className="sm:col-span-2" label="IV Surface" color={PALETTE.red}>
              <MicroHeatmap />
            </Cell>
            <Cell className="sm:col-span-3" label="Print Blotter" color={PALETTE.green}
              caption="Green lifts, red hits — signed flow against a zero axis.">
              <MicroBlotter />
            </Cell>
          </div>
        </div>
      </div>
    </section>
  );
}

export default PinnedTerminalScene;

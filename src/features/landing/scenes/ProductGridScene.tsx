import { useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { useLandingMotion } from '../motion/LandingMotionProvider';
import { DUR, EASE_PRIMARY, GSAP_EASE_PRIMARY, STAGGER, TRIGGER } from '../motion/motionTokens';
import {
  PALETTE,
  MicroPositioning,
  MicroRanked,
  MicroGamma,
  MicroHeatmap,
  MicroBlotter,
  MicroTicks,
} from '../content/LandingSections';

/**
 * Scene 5 — the interactive module grid. A responsive CSS-grid of the six real
 * Slayer modules; each idle card is restrained (hairline border, dark surface,
 * a small authentic Micro* preview). On hover / focus-visible the active card
 * lifts its preview into a layered floating frame that grows out of the card
 * (Motion shared-layout `layoutId`), while its neighbours dim and recede to make
 * room. Escape closes it; every card is a real focusable button — nothing is
 * available on hover alone.
 *
 * Ownership contract (the two motion engines never fight over one node):
 *   • GSAP owns the OUTER `.pg-card-wrap` grid item — a scrubbed, reversible
 *     rise/stagger entrance (translateY + opacity) driven by ScrollTrigger
 *     `id: TRIGGER.productGrid`, sized per `gsap.matchMedia()` breakpoint.
 *   • Motion owns the INNER card — the hover/focus dim+recede and the floating
 *     frame's grow (`layoutId` morph). Motion touches transform/opacity only on
 *     these inner nodes; GSAP never does.
 * Under reduced motion the grid renders in place (no entrance, no auto-expand);
 * hover/focus becomes a plain border+opacity change with an inline metadata row,
 * and the large floating frame is never mounted.
 */

// Theme tokens — the landing is ONE system with the terminal, so surfaces and
// borders resolve to the app's design tokens (theme-aware), exactly like the
// sibling sections in content/LandingSections.tsx.
const line = 'var(--border)';
const lineStrong = 'var(--border-strong)';
const muted = 'var(--text-secondary)';
const faint = 'var(--text-tertiary)';

interface ModuleDef {
  id: string;
  /** terminal tab crossed into on click. */
  tab: string;
  name: string;
  desc: string;
  accent: string;
  /** module vocabulary shown on expand — labels only, never fabricated numbers. */
  chips: string[];
  /** authentic Micro* replica preview; fed the landing's live-ish props. */
  preview: () => ReactNode;
}

interface Props {
  metrics: any;
  ranked: any[];
  pressure: any[];
  spark: number[];
  onEnter: (tab?: string) => void;
}

export function ProductGridScene({ metrics, ranked, pressure, spark, onEnter }: Props) {
  const { reduced } = useLandingMotion();
  const gridScope = useRef<HTMLDivElement | null>(null);
  // A single "active id" is the whole flicker-avoidance strategy: rapid pointer
  // travel across cards only re-points this one value, and Motion's layout
  // system hands the floating frame off between cards instead of unmounting.
  const [active, setActive] = useState<string | null>(null);

  // Real modules, static voice. Live props flow straight into the Micro*
  // replicas (they fall back to number-free silhouettes when a feed is absent).
  const rk = Array.isArray(ranked) ? ranked : [];
  const pr = Array.isArray(pressure) ? pressure : [];
  const MODULES: ModuleDef[] = [
    {
      id: 'skyvision', tab: 'skyvision', name: 'SkyVision', accent: PALETTE.steel,
      desc: 'Ranks setups and contracts by structure, momentum, and risk.',
      chips: ['RANKED', 'CONFIDENCE', 'BIAS', 'INVALIDATION'],
      preview: () => <MicroRanked rows={rk} />,
    },
    {
      id: 'pinpoint', tab: 'pinpoint', name: 'Pinpoint GEX', accent: PALETTE.amber,
      desc: 'Dealer positioning by strike — call walls, put walls, pin zones.',
      chips: ['CALL WALL', 'PUT WALL', 'PIN', 'GAMMA FLIP'],
      preview: () => <MicroPositioning rows={pr} spot={metrics?.spot} />,
    },
    {
      id: 'dealerflow', tab: 'dealerflow', name: 'Dealer Flow', accent: PALETTE.green,
      desc: 'Net gamma pressure shifting across strikes as the tape develops.',
      chips: ['GEX', 'DEX', 'VEX', 'NET FLOW'],
      preview: () => <MicroGamma rows={pr} spot={metrics?.spot} callWall={metrics?.callWall} putWall={metrics?.putWall} />,
    },
    {
      id: 'liveterminal', tab: 'liveterminal', name: 'Live Terminal', accent: PALETTE.steel,
      desc: 'One clean workspace — chart and key levels, start to execution.',
      chips: ['PRICE', 'KEY LEVELS', 'GEX NODES'],
      // Empty → MicroTicks uses its built-in realistic candle series (the landing
      // spark is flat/empty, which collapses the candles).
      preview: () => <MicroTicks data={[]} />,
    },
    {
      id: 'quant', tab: 'quant', name: 'Quant Lab', accent: PALETTE.amber,
      desc: 'Volatility surface, Greeks, regime, and expected move.',
      chips: ['IV SURFACE', 'GREEKS', 'REGIME', 'EXP MOVE'],
      preview: () => <MicroHeatmap />,
    },
    {
      id: 'auditor', tab: 'auditor', name: 'Trade History', accent: PALETTE.green,
      desc: 'Tracked setups and outcomes with honest, realized results.',
      chips: ['ENTRIES', 'OUTCOMES', 'REALIZED', 'HEALTH'],
      preview: () => <MicroBlotter />,
    },
  ];

  /* ─────────────── GSAP entrance (owns the wrapper only) ─────────────── */
  useGSAP(
    () => {
      const root = gridScope.current;
      if (!root) return;
      const wraps = gsap.utils.toArray<HTMLElement>('.pg-card-wrap', root);
      if (!wraps.length) return;

      if (reduced) {
        // Render in place — no entrance under reduced motion.
        gsap.set(wraps, { autoAlpha: 1, y: 0 });
        return;
      }

      // matchMedia: 3-col desktop / 2-col tablet / 1-col mobile, with smaller
      // rise on narrower viewports so nothing translates far enough to overflow.
      const mm = gsap.matchMedia();
      const build = (rise: number) => () => {
        gsap.fromTo(
          wraps,
          { autoAlpha: 0, y: rise },
          {
            autoAlpha: 1,
            y: 0,
            ease: GSAP_EASE_PRIMARY,
            stagger: STAGGER.tight,
            duration: DUR.reveal,
            // Short scrubbed reveal — reversible as the grid scrolls back out.
            scrollTrigger: { id: TRIGGER.productGrid, trigger: root, start: 'top 85%', end: 'top 52%', scrub: 0.6 },
          },
        );
      };
      mm.add('(min-width: 1024px)', build(46));
      mm.add('(min-width: 640px) and (max-width: 1023.98px)', build(30));
      mm.add('(max-width: 639.98px)', build(16));
      return () => mm.revert();
    },
    { scope: gridScope, dependencies: [reduced], revertOnUpdate: true },
  );

  /* ─────────────── keyboard + focus wiring ─────────────── */
  // Clearing lives on the CONTAINER (mouseleave / focusout), so pointer travel
  // BETWEEN cards never dips through `null` — only the destination card's enter
  // fires. That, plus the single active id, is what stops the flicker.
  const handleContainerBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setActive(null);
  };
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && active) {
      // Close the expansion but KEEP focus on the focused card, so the keyboard
      // user isn't dumped to <body> (re-Tab from scratch).
      setActive(null);
    }
  };

  const activeMod = MODULES.find((m) => m.id === active) ?? null;
  const chipStyle: CSSProperties = {
    border: `1px solid ${line}`,
    color: muted,
    letterSpacing: '0.14em',
  };

  return (
    <section
      id="product"
      className="px-5 py-16"
      style={{ borderTop: `1px solid ${line}`, background: PALETTE.bg }}
      data-scene="product-grid"
      aria-label="Slayer modules"
    >
      {/* section head — static, institutional */}
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <div className="text-[10px] font-semibold uppercase" style={{ letterSpacing: '0.28em', color: faint }}>
          The Terminal
        </div>
        <h2 className="mt-3 text-[26px] font-semibold leading-tight sm:text-[32px]" style={{ color: PALETTE.ghost, letterSpacing: '-0.01em' }}>
          Six Modules. One Read.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-[13.5px] leading-relaxed" style={{ color: muted }}>
          Every module reads market structure, not decoration. Hover or focus a card to look closer.
        </p>
      </div>

      {/* grid container — position:relative anchors the floating frame; the frame
          clamps to this box (which sits inside the page), so it can never push
          horizontal page overflow. */}
      <div
        ref={gridScope}
        className="relative mx-auto max-w-6xl"
        onMouseLeave={() => setActive(null)}
        onBlur={handleContainerBlur}
        onKeyDown={handleKeyDown}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => {
            const isActive = active === m.id;
            const isDim = active != null && !isActive;
            // Hide the source preview while its clone lives in the floating frame
            // so the shared-layout morph doesn't leave a ghost behind in the card.
            const sourceHidden = isActive && !reduced;
            return (
              <div key={m.id} className="pg-card-wrap min-w-0">
                <motion.button
                  type="button"
                  onClick={() => onEnter(m.tab)}
                  onMouseEnter={() => setActive(m.id)}
                  onFocus={() => setActive(m.id)}
                  aria-expanded={isActive}
                  aria-label={`${m.name} — ${m.desc} Open module`}
                  className="flex h-full w-full cursor-pointer flex-col rounded-[10px] p-5 text-left focus:outline-none focus-visible:ring-1"
                  style={{
                    background: PALETTE.panel,
                    border: `1px solid ${isActive ? lineStrong : line}`,
                    ['--tw-ring-color' as any]: lineStrong,
                  }}
                  // Motion owns the inner card: neighbours dim + recede to make room.
                  animate={reduced ? { opacity: isDim ? 0.55 : 1 } : { opacity: isDim ? 0.5 : 1, y: isDim ? 10 : 0 }}
                  transition={{ duration: DUR.fast, ease: EASE_PRIMARY }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2 text-[14px] font-semibold" style={{ color: PALETTE.ghost }}>
                      <span aria-hidden="true" className="h-2.5 w-[3px] rounded-full" style={{ background: m.accent }} />
                      {m.name}
                    </span>
                    <span aria-hidden="true" className="text-[11px]" style={{ color: faint }}>→</span>
                  </div>
                  <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: muted }}>{m.desc}</p>

                  {/* preview slot — fixed height keeps the card stable when the
                      preview clone flies out to the floating frame. */}
                  <div className="relative mt-4 h-[92px] overflow-hidden rounded-[7px]">
                    <motion.div
                      layoutId={reduced ? undefined : `pg-frame-${m.id}`}
                      className="absolute inset-0"
                      style={{ opacity: sourceHidden ? 0 : 1 }}
                      transition={{ layout: { duration: DUR.normal, ease: EASE_PRIMARY } }}
                    >
                      {m.preview()}
                    </motion.div>
                  </div>

                  {/* reduced-motion inline expansion: a plain metadata row (no big
                      layout motion), so the same read is reachable without the
                      floating frame. */}
                  {reduced && isActive ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {m.chips.map((c) => (
                        <span key={c} className="rounded-[5px] px-2 py-1 text-[9px] font-semibold uppercase" style={chipStyle}>{c}</span>
                      ))}
                    </div>
                  ) : null}
                </motion.button>
              </div>
            );
          })}
        </div>

        {/* floating frame — the active card's preview grows into it via the shared
            layoutId. pointer-events sit on the frame (not the backdrop) so hovering
            it holds the active card instead of firing the covered cards beneath.
            Never mounted under reduced motion. */}
        <AnimatePresence>
          {activeMod && !reduced ? (
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4">
              <motion.div
                key={activeMod.id}
                layoutId={`pg-frame-${activeMod.id}`}
                role="button"
                onMouseDown={(e) => e.preventDefault()} // keep focus on the card — no focusout race before click
                onClick={() => onEnter(activeMod.tab)}
                className="pointer-events-auto w-full max-w-[min(560px,90vw)] max-h-[80vh] cursor-pointer overflow-hidden rounded-[12px] p-5"
                style={{
                  background: PALETTE.panel,
                  border: `1px solid ${lineStrong}`,
                  boxShadow: '0 24px 60px -22px rgba(0,0,0,0.7)',
                }}
                transition={{ layout: { duration: DUR.normal, ease: EASE_PRIMARY } }}
              >
                {/* header — content crossfades in over the morphing box */}
                <motion.div
                  className="flex items-center justify-between gap-3"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: DUR.fast, ease: EASE_PRIMARY }}
                >
                  <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase" style={{ letterSpacing: '0.16em', color: faint }}>
                    <span aria-hidden="true" className="h-2.5 w-[3px] rounded-full" style={{ background: activeMod.accent }} />
                    {activeMod.name}
                  </span>
                  <span className="text-[10px] uppercase" style={{ letterSpacing: '0.14em', color: faint }}>Live preview</span>
                </motion.div>

                {/* the enlarged, authentic preview — the real Micro* replica, now
                    rendered at panel width. */}
                <div className="mt-4">{activeMod.preview()}</div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: DUR.fast, ease: EASE_PRIMARY, delay: 0.04 }}
                >
                  <p className="mt-4 text-[12.5px] leading-relaxed" style={{ color: muted }}>{activeMod.desc}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {activeMod.chips.map((c) => (
                      <span key={c} className="rounded-[5px] px-2 py-1 text-[9px] font-semibold uppercase" style={chipStyle}>{c}</span>
                    ))}
                  </div>
                  <div
                    className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase"
                    style={{ letterSpacing: '0.14em', color: activeMod.accent }}
                  >
                    Open {activeMod.name} <span aria-hidden="true">→</span>
                  </div>
                </motion.div>
              </motion.div>
            </div>
          ) : null}
        </AnimatePresence>
      </div>
    </section>
  );
}

export default ProductGridScene;

import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { GSAP_EASE_PRIMARY, GSAP_EASE_SMOOTH, TRIGGER } from '../motion/motionTokens';
import { useLandingMotion } from '../motion/LandingMotionProvider';
import {
  MicroPositioning,
  MicroRanked,
  MicroGamma,
  MicroHeatmap,
  MicroBlotter,
  PALETTE,
} from '../content/LandingSections';

/**
 * Scene 3 — the scrubbed product collage. A pinned stage in which ~5 authentic
 * Slayer mini-modules (Pinpoint GEX, SkyVision, Dealer Flow, Quant Lab, Trade
 * History) fly in from separate edges with depth, settle into a readable collage
 * around a dominant centre panel, reveal their labels through a wiping mask, drift
 * their supporting panels outward, then separate + fade to hand off to the next
 * scene underneath.
 *
 * ── Ownership contract ──
 * One GSAP timeline bound to ONE ScrollTrigger (id: TRIGGER.collage, scrub) owns
 * every panel's transform + opacity + its label's clip-path. Nothing else touches
 * those. Because the whole choreography is a single scrubbed timeline, scrolling
 * back reverses it cleanly — no once-fired tween is ever stranded.
 *
 * Transforms/opacity/clip-path ONLY are animated (never width/height/top/left/
 * margin/filter), so the pin + parallax stay compositor-cheap. gsap.matchMedia()
 * builds three timeline shapes (desktop / tablet / mobile) and auto-reverts on
 * breakpoint change. Under reduced motion NO pin/scrub is built at all — the
 * panels render straight into their final readable collage layout via CSS, with
 * labels already visible.
 */

interface Props {
  onEnter: (tab?: string) => void;
}

const line = 'var(--border)';
const faint = 'var(--text-tertiary)';
const muted = 'var(--text-secondary)';

/* ── static, hand-written replica data (no live feeds, no sample labels) ── */
const POSITIONING_ROWS = [
  { strike: 6050, net: 0.92, kind: 'callWall' as const },
  { strike: 6025, net: 0.54 },
  { strike: 6000, net: 0.28 },
  { strike: 5975, net: 0.08, kind: 'spot' as const },
  { strike: 5950, net: -0.34, kind: 'pin' as const },
  { strike: 5925, net: -0.62 },
  { strike: 5900, net: -0.95, kind: 'putWall' as const },
];

const RANKED_ROWS = [
  { symbol: 'SPX 5450P', setup: 'Mispriced', bias: 'BEAR' as const, confidence: 93 },
  { symbol: 'SPX 5550C', setup: 'Mispriced', bias: 'BULL' as const, confidence: 88 },
  { symbol: 'NDX 19150P', setup: 'Mispriced', bias: 'BEAR' as const, confidence: 81 },
  { symbol: 'QQQ 485C', setup: 'Mispriced', bias: 'BULL' as const, confidence: 74 },
];

const GAMMA_ROWS = [
  { strike: 5900, net: -0.9 },
  { strike: 5925, net: -0.6 },
  { strike: 5950, net: -0.3 },
  { strike: 5975, net: 0.2 },
  { strike: 6000, net: 0.52 },
  { strike: 6025, net: 0.76 },
  { strike: 6050, net: 0.95 },
];

/* ── panel layout + entry/exit vectors ──
   `home` is the settled position (centre-anchored % of the stage). `from` is the
   scattered entry offset relative to home; `out` is the small outward drift the
   supporting panels take once the collage is readable. Displacement magnitudes
   below are the DESKTOP values — each matchMedia branch scales them by `k`. */
interface PanelCfg {
  id: string;
  title: string;
  tab: string;
  z: number;
  /** settled opacity — the centre panel is dominant at 1, supports sit back. */
  op: number;
  dominant?: boolean;
  /** appears on the mobile (reduced-count) collage? */
  mobile: boolean;
  home: { left: string; top: string; width: string };
  from: { x: number; y: number; rot: number; scale: number };
  out: { x: number; y: number };
  body: React.ReactNode;
}

const PANELS: PanelCfg[] = [
  {
    id: 'skyvision',
    title: 'SkyVision',
    tab: 'skyvision',
    z: 30,
    op: 0.7,
    mobile: true,
    home: { left: '25%', top: '27%', width: 'min(250px, 66vw)' },
    from: { x: -140, y: -44, rot: -3, scale: 0.86 },
    out: { x: -42, y: -20 },
    body: <MicroRanked rows={RANKED_ROWS} />,
  },
  {
    id: 'dealerflow',
    title: 'Dealer Flow',
    tab: 'dealerflow',
    z: 30,
    op: 0.7,
    mobile: true,
    home: { left: '76%', top: '24%', width: 'min(250px, 66vw)' },
    from: { x: 130, y: -92, rot: 3, scale: 0.88 },
    out: { x: 46, y: -16 },
    body: <MicroGamma rows={GAMMA_ROWS} spot={5975} callWall={6050} putWall={5900} />,
  },
  {
    id: 'pinpoint',
    title: 'Pinpoint GEX',
    tab: 'pinpoint',
    z: 50,
    op: 1,
    dominant: true,
    mobile: true,
    home: { left: '50%', top: '52%', width: 'min(360px, 86vw)' },
    from: { x: 0, y: 82, rot: 0, scale: 0.9 },
    out: { x: 0, y: 0 },
    body: <MicroPositioning rows={POSITIONING_ROWS} spot={5975} />,
  },
  {
    id: 'quant',
    title: 'Quant Lab',
    tab: 'quant',
    z: 20,
    op: 0.62,
    mobile: true,
    home: { left: '26%', top: '75%', width: 'min(240px, 64vw)' },
    from: { x: -120, y: 108, rot: 2, scale: 0.88 },
    out: { x: -46, y: 34 },
    body: <MicroHeatmap />,
  },
  {
    id: 'history',
    title: 'Trade History',
    tab: 'liveterminal',
    z: 20,
    op: 0.62,
    mobile: false,
    home: { left: '76%', top: '76%', width: 'min(250px, 64vw)' },
    from: { x: 140, y: 96, rot: -2, scale: 0.86 },
    out: { x: 48, y: 30 },
    body: <MicroBlotter />,
  },
];

/** per-mode tuning: displacement scale, static-layout scale, pin height, stage box. */
const MODE_CFG = {
  desktop: { k: 1, minH: '170vh', stageH: 560, stageMax: 1000 },
  tablet: { k: 0.62, minH: '150vh', stageH: 520, stageMax: 760 },
  mobile: { k: 0.4, minH: '140vh', stageH: 468, stageMax: 460 },
} as const;

export function ProductCollageScene({ onEnter }: Props) {
  const { reduced, mode } = useLandingMotion();
  const scope = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const cfg = MODE_CFG[mode];
  // Only the mobile tier drops a panel (Trade History); tablet/desktop show all 5.
  const panels = mode === 'mobile' ? PANELS.filter((p) => p.mobile) : PANELS;

  useGSAP(
    () => {
      // Reduced motion: build NO pin/scrub. The panels are already rendered in
      // their final readable layout via CSS (see panelStyle), so there is nothing
      // to animate — bail before creating any timeline or ScrollTrigger.
      if (reduced) return;

      const section = scope.current;
      const stage = stageRef.current;
      if (!section || !stage) return;

      const mm = gsap.matchMedia();

      const build = (k: number) => {
        const panelEl = (id: string) => stage.querySelector<HTMLElement>(`[data-panel="${id}"]`);
        const labelEl = (id: string) => stage.querySelector<HTMLElement>(`[data-label="${id}"]`);

        const nodes = PANELS.map((p) => ({ p, el: panelEl(p.id), label: labelEl(p.id) })).filter(
          (n): n is { p: PanelCfg; el: HTMLElement; label: HTMLElement } => !!n.el && !!n.label,
        );
        if (!nodes.length) return;

        // Scattered start state (centre-anchored via xPercent/yPercent so px x/y
        // compose cleanly on top of the -50%/-50% centring).
        nodes.forEach(({ p, el, label }) => {
          gsap.set(el, {
            xPercent: -50,
            yPercent: -50,
            x: p.from.x * k,
            y: p.from.y * k,
            rotation: p.from.rot,
            scale: p.from.scale,
            autoAlpha: 0,
            transformOrigin: '50% 50%',
          });
          gsap.set(label, { clipPath: 'inset(0 100% 0 0)' });
        });

        const tl = gsap.timeline({
          defaults: { force3D: true },
          scrollTrigger: {
            id: TRIGGER.collage,
            trigger: section,
            start: 'top top',
            end: 'bottom bottom',
            pin: stage,
            pinType: 'transform',
            scrub: true,
            invalidateOnRefresh: true,
          },
        });

        // ── Phase A: ENTER — panels arrive from their separate edges with depth.
        // Staggered starts give each a distinct apparent scroll speed; the centre
        // panel lands last and largest, becoming dominant.
        nodes.forEach(({ p, el }, i) => {
          tl.to(
            el,
            {
              x: 0,
              y: 0,
              rotation: 0,
              scale: 1,
              autoAlpha: p.op,
              duration: 0.5,
              ease: GSAP_EASE_PRIMARY,
            },
            i * 0.07,
          );
        });

        // ── Phase B: LABELS — each product label wipes in through its mask as its
        // panel settles.
        nodes.forEach(({ label }, i) => {
          tl.to(
            label,
            { clipPath: 'inset(0 0% 0 0)', duration: 0.3, ease: GSAP_EASE_PRIMARY },
            0.32 + i * 0.05,
          );
        });

        // ── Phase C: SETTLE — supporting panels ease slightly OUTWARD to open the
        // composition; the centre grows to full dominance.
        nodes.forEach(({ p, el }) => {
          if (p.dominant) {
            tl.to(el, { scale: 1.04, duration: 0.36, ease: GSAP_EASE_SMOOTH }, 0.62);
          } else {
            tl.to(
              el,
              { x: p.out.x * k, y: p.out.y * k, duration: 0.36, ease: GSAP_EASE_SMOOTH },
              0.62,
            );
          }
        });

        // ── Phase D: HANDOFF — the whole collage drifts up + fades so the next
        // scene begins underneath. All bound to the same timeline → fully reversible.
        nodes.forEach(({ el }) => {
          tl.to(
            el,
            { y: `-=${52 * k}`, autoAlpha: 0, duration: 0.4, ease: GSAP_EASE_SMOOTH },
            0.86,
          );
        });

        return () => {
          // matchMedia revert restores inline styles for this branch.
        };
      };

      mm.add('(min-width: 1024px)', () => build(MODE_CFG.desktop.k));
      mm.add('(min-width: 640px) and (max-width: 1023.98px)', () => build(MODE_CFG.tablet.k));
      mm.add('(max-width: 639.98px)', () => build(MODE_CFG.mobile.k));

      return () => mm.revert();
    },
    { scope, dependencies: [reduced, mode] },
  );

  /** Base style per panel. Under reduced motion this IS the final layout (settled
   *  outward drift + dominance scale, full opacity). Otherwise GSAP owns transform
   *  + opacity, so we render centred + hidden and let the timeline take over. */
  const panelStyle = (p: PanelCfg): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: 'absolute',
      left: p.home.left,
      top: p.home.top,
      width: p.home.width,
      zIndex: p.z,
      willChange: 'transform',
    };
    if (reduced) {
      return {
        ...base,
        transform: `translate(-50%, -50%) translate(${p.out.x * cfg.k}px, ${p.out.y * cfg.k}px) scale(${p.dominant ? 1.04 : 1})`,
        opacity: p.op,
      };
    }
    return { ...base, transform: 'translate(-50%, -50%)', opacity: 0 };
  };

  return (
    <section
      ref={scope}
      data-scene="collage"
      className="relative w-full"
      style={{ minHeight: reduced ? undefined : cfg.minH, background: PALETTE.bg, overflowX: 'clip' }}
    >
      {/* pinned stage — held in place while the section scrolls past */}
      <div
        ref={stageRef}
        className="relative flex min-h-screen w-full flex-col items-center justify-center px-5 py-16"
      >
        {/* eyebrow + heading */}
        <div className="relative z-[60] mb-8 max-w-2xl text-center sm:mb-10">
          <div
            className="text-[10px] font-semibold uppercase"
            style={{ letterSpacing: '0.28em', color: faint }}
          >
            The terminal, in parts
          </div>
          <h2
            className="mt-3 text-[26px] font-semibold leading-tight sm:text-[34px]"
            style={{ color: PALETTE.ghost, letterSpacing: '-0.01em' }}
          >
            One desk. Every read.
          </h2>
          <p
            className="mx-auto mt-3 max-w-md text-[13px] leading-relaxed"
            style={{ color: muted }}
          >
            Positioning, ranked setups, dealer flow, volatility and the blotter —
            assembled into a single field of view.
          </p>
        </div>

        {/* the collage stage */}
        <div
          className="relative w-full"
          style={{ height: cfg.stageH, maxWidth: cfg.stageMax, margin: '0 auto' }}
        >
          {panels.map((p) => (
            <div key={p.id} data-panel={p.id} style={panelStyle(p)}>
              <button
                type="button"
                onClick={() => onEnter(p.tab)}
                aria-label={`Open ${p.title}`}
                className="group block w-full cursor-pointer overflow-hidden rounded-[10px] text-left transition-colors"
                style={{ background: PALETTE.panel, border: `1px solid ${line}` }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-strong)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                }}
              >
                {/* titled frame header — 10px uppercase mono label revealed via mask */}
                <div
                  className="flex items-center justify-between px-3 py-2"
                  style={{ borderBottom: `1px solid ${line}` }}
                >
                  <span
                    data-label={p.id}
                    className="inline-block"
                    style={{
                      fontFamily: 'var(--font-brand, monospace)',
                      fontSize: 10,
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                      color: PALETTE.text,
                      // reduced motion: label already visible (no wipe mask)
                      clipPath: reduced ? undefined : 'inset(0 100% 0 0)',
                    }}
                  >
                    {p.title}
                  </span>
                  <span
                    className="inline-block h-1 w-1 rounded-full"
                    style={{ background: p.dominant ? PALETTE.amber : PALETTE.steel, opacity: 0.7 }}
                  />
                </div>
                <div className="p-3">{p.body}</div>
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default ProductCollageScene;

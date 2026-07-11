import { useRef, type CSSProperties } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { useLandingMotion } from '../motion/LandingMotionProvider';
import { DUR, GSAP_EASE_PRIMARY, STAGGER, TRIGGER } from '../motion/motionTokens';
import { PALETTE } from '../content/LandingSections';

/**
 * Scene 4 — the module directory. The live hero terminal is the one page-faithful
 * visual of the product; this scene is the *index* into it, so it
 * deliberately does NOT re-render the same mini-charts — that repetition ("the
 * same cards over and over") was the whole problem. Instead each module is a crisp
 * hairline tile: accent, name, one-line read and its real vocabulary, with a hover
 * lift + arrow travel and a click straight into the live tab. One ruled instrument
 * panel, matching the terminal itself.
 *
 * Motion: GSAP owns a reversible stagger-rise entrance on the tiles (toggleActions,
 * never scrubbed); hover/focus is pure CSS transform/opacity so the two engines
 * never touch the same node. Reduced motion renders the grid in place.
 */

const line = 'var(--border)';
const lineStrong = 'var(--border-strong)';
const muted = 'var(--text-secondary)';
const faint = 'var(--text-tertiary)';

interface ModuleDef {
  id: string;
  tab: string;
  name: string;
  desc: string;
  accent: string;
  chips: string[];
  /** real screenshot of the actual page — the box photo, not a mock. */
  img: string;
}

interface Props {
  onEnter: (tab?: string) => void;
}

const MODULES: ModuleDef[] = [
  {
    id: 'skyvision', tab: 'skyvision', name: 'SkyVision', accent: PALETTE.steel,
    desc: 'Ranks setups and contracts by structure, momentum and risk.',
    chips: ['RANKED', 'CONFIDENCE', 'BIAS', 'INVALIDATION'],
    img: '/previews/skyvision.jpg',
  },
  {
    id: 'pinpoint', tab: 'pinpoint', name: 'Pinpoint GEX', accent: PALETTE.amber,
    desc: 'Dealer positioning by strike — call walls, put walls, pin zones.',
    chips: ['CALL WALL', 'PUT WALL', 'PIN', 'GAMMA FLIP'],
    img: '/previews/pinpoint.jpg',
  },
  {
    id: 'dealerflow', tab: 'dealerflow', name: 'Dealer Flow', accent: PALETTE.green,
    desc: 'Net gamma pressure shifting across strikes as the tape develops.',
    chips: ['GEX', 'DEX', 'VEX', 'NET FLOW'],
    img: '/previews/dealerflow.jpg',
  },
  {
    id: 'liveterminal', tab: 'liveterminal', name: 'Live Terminal', accent: PALETTE.steel,
    desc: 'One clean workspace — chart and key levels, start to execution.',
    chips: ['PRICE', 'KEY LEVELS', 'GEX NODES'],
    img: '/previews/liveterminal.jpg',
  },
  {
    id: 'quant', tab: 'quant', name: 'Quant Lab', accent: PALETTE.amber,
    desc: 'Volatility surface, Greeks, regime and expected move.',
    chips: ['IV SURFACE', 'GREEKS', 'REGIME', 'EXP MOVE'],
    img: '/previews/quant.jpg',
  },
  {
    id: 'auditor', tab: 'auditor', name: 'Trade History', accent: PALETTE.green,
    desc: 'Tracked setups and outcomes with honest, realized results.',
    chips: ['ENTRIES', 'OUTCOMES', 'REALIZED', 'HEALTH'],
    img: '/previews/auditor.jpg',
  },
];

export function ProductGridScene({ onEnter }: Props) {
  const { reduced } = useLandingMotion();
  const gridScope = useRef<HTMLDivElement | null>(null);

  useGSAP(
    () => {
      const root = gridScope.current;
      if (!root) return;
      const tiles = gsap.utils.toArray<HTMLElement>('.pg-tile', root);
      if (!tiles.length) return;
      if (reduced) {
        gsap.set(tiles, { autoAlpha: 1, y: 0 });
        return;
      }
      gsap.fromTo(
        tiles,
        { autoAlpha: 0, y: 18 },
        {
          autoAlpha: 1,
          y: 0,
          ease: GSAP_EASE_PRIMARY,
          stagger: STAGGER.tight,
          duration: DUR.reveal,
          scrollTrigger: { id: TRIGGER.productGrid, trigger: root, start: 'top 78%', toggleActions: 'play none none reverse' },
        },
      );
    },
    { scope: gridScope, dependencies: [reduced], revertOnUpdate: true },
  );

  const chipStyle: CSSProperties = { border: `1px solid ${line}`, color: faint, letterSpacing: '0.12em' };

  return (
    <section
      id="product"
      className="px-5 py-16"
      style={{ borderTop: `1px solid ${line}`, background: PALETTE.bg }}
      data-scene="product-grid"
      aria-label="Slayer modules"
    >
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <div className="text-[10px] font-semibold uppercase" style={{ letterSpacing: '0.28em', color: faint }}>
          Jump In
        </div>
        <h2 className="mt-3 text-[26px] font-semibold leading-tight sm:text-[32px]" style={{ color: PALETTE.ghost, letterSpacing: '-0.01em' }}>
          Every module, one click away.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-[13.5px] leading-relaxed" style={{ color: muted }}>
          These are the actual screens — not mockups. Pick a read and open it live.
        </p>
      </div>

      <div ref={gridScope} className="mx-auto max-w-6xl">
        {/* ONE ruled surface — hairline dividers via gap-px, not six floating cards. */}
        <div
          className="grid grid-cols-1 gap-px overflow-hidden rounded-[10px] sm:grid-cols-2 lg:grid-cols-3"
          style={{ border: `1px solid ${line}`, background: line }}
        >
          {MODULES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onEnter(m.tab)}
              aria-label={`Open ${m.name} — ${m.desc}`}
              className="pg-tile group relative flex h-full min-w-0 cursor-pointer flex-col overflow-hidden text-left transition-[transform] duration-200 ease-out focus:outline-none focus-visible:ring-1 focus-visible:ring-inset hover:-translate-y-[2px]"
              style={{ background: PALETTE.panel, ['--tw-ring-color' as any]: lineStrong }}
            >
              {/* box photo — a real screenshot of the actual page, gently zooming on
                  hover. object-top so the module's header/KPIs read first. */}
              <div className="relative overflow-hidden" style={{ aspectRatio: '124 / 76', borderBottom: `1px solid ${line}`, background: PALETTE.bg }}>
                <img
                  src={m.img}
                  alt={`${m.name} — a live Slayer Terminal screen`}
                  loading="lazy"
                  className="h-full w-full object-cover object-top transition-transform duration-500 ease-out group-hover:scale-[1.045]"
                />
                {/* accent hairline seats the shot into the module's colour */}
                <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[2px]" style={{ background: m.accent, opacity: 0.85 }} />
              </div>

              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2.5 text-[14px] font-semibold" style={{ color: PALETTE.ghost }}>
                    <span aria-hidden="true" className="h-2.5 w-[3px] rounded-full" style={{ background: m.accent }} />
                    {m.name}
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-[13px] transition-transform duration-200 ease-out group-hover:translate-x-1 group-focus-visible:translate-x-1"
                    style={{ color: m.accent }}
                  >
                    →
                  </span>
                </div>
                <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: muted }}>{m.desc}</p>
                {/* real module vocabulary — the tile's supporting substance */}
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {m.chips.map((c) => (
                    <span key={c} className="rounded-[5px] px-2 py-1 text-[9px] font-semibold uppercase" style={chipStyle}>{c}</span>
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export default ProductGridScene;

import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { GSAP_EASE_PRIMARY, GSAP_EASE_SMOOTH, STAGGER } from '../motion/motionTokens';
import { useFitScale } from '../hooks/useFitScale';

/**
 * LayeredTerminalAssembly — the hero's centrepiece. A Slayer terminal built from
 * separate interface LAYERS (frame, nav rail, price chart, dealer-positioning
 * bars, key-level rail, metrics strip, SkyVision setup, live-feed chip) that fly
 * in from different directions with depth, rotation and stagger, lock into a
 * complete terminal, breathe, then disassemble — on a continuous loop. This is the
 * Slayer-native reinterpretation of the reference's assemble/disassemble motion:
 * same choreography, none of its imagery.
 *
 * Ownership contract: GSAP owns each LAYER's transform+opacity (assemble → hold →
 * disassemble). The outer stage wrapper's transform is owned by pointer parallax
 * (a different node) so the two never fight. Under reduced motion the terminal is
 * rendered fully assembled and still — no loop, no scatter.
 */

interface LayerCfg {
  id: string;
  depth: number;
  /** scattered entry offset (assembled = 0,0,0,1). */
  from: { x: number; y: number; rot: number; scale: number };
  /** disassembly exit offset. */
  exit: { x: number; y: number; rot: number; scale: number };
  /** absolute home box within the 560×380 stage. */
  box: { left: number; top: number; width: number; height?: number };
  z: number;
}

// Home layout + scatter/exit vectors. Pieces approach from distinct directions
// (no random paths); exit peels them to different depth planes.
const LAYERS: LayerCfg[] = [
  { id: 'grid',      depth: 0, z: 0,  box: { left: 0,   top: 0,   width: 560, height: 380 }, from: { x: 0,    y: 0,   rot: 0,   scale: 1.08 }, exit: { x: 0,   y: 0,   rot: 0,   scale: 1.12 } },
  { id: 'frame',     depth: 1, z: 10, box: { left: 20,  top: 24,  width: 520, height: 332 }, from: { x: 0,    y: 40,  rot: 0,   scale: 0.9  }, exit: { x: 0,   y: 26,  rot: 0,   scale: 0.94 } },
  { id: 'nav',       depth: 2, z: 20, box: { left: 34,  top: 66,  width: 68,  height: 274 }, from: { x: -220, y: 0,   rot: -6,  scale: 0.9  }, exit: { x: -180,y: -30, rot: -5,  scale: 0.92 } },
  { id: 'metrics',   depth: 3, z: 30, box: { left: 112, top: 62,  width: 420, height: 52  }, from: { x: 0,    y: -180,rot: 0,   scale: 0.94 }, exit: { x: 0,   y: -150,rot: 0,   scale: 0.95 } },
  { id: 'chart',     depth: 3, z: 30, box: { left: 112, top: 120, width: 252, height: 150 }, from: { x: -260, y: 120, rot: 5,   scale: 0.88 }, exit: { x: -60, y: 120, rot: 4,   scale: 0.9  } },
  { id: 'gex',       depth: 3, z: 30, box: { left: 376, top: 120, width: 156, height: 150 }, from: { x: 260,  y: 120, rot: -5,  scale: 0.88 }, exit: { x: 210, y: 90,  rot: -4,  scale: 0.9  } },
  { id: 'levels',    depth: 4, z: 40, box: { left: 112, top: 280, width: 252, height: 60  }, from: { x: -160, y: 220, rot: 3,   scale: 0.9  }, exit: { x: -120,y: 170, rot: 3,   scale: 0.92 } },
  { id: 'skyvision', depth: 5, z: 60, box: { left: 374, top: 282, width: 158, height: 74  }, from: { x: 240,  y: 200, rot: 7,   scale: 0.86 }, exit: { x: 220, y: 150, rot: 6,   scale: 0.88 } },
  { id: 'feed',      depth: 5, z: 60, box: { left: 372, top: 2,   width: 160, height: 26  }, from: { x: 200,  y: -140,rot: 4,   scale: 0.9  }, exit: { x: 170, y: -120,rot: 4,   scale: 0.92 } },
];

const STEEL = '#6A93B5';
const AMBER = '#C79350';
const RED = '#B23B3B';
const GREEN = '#3F9C79';
const INK = '#0B0C0E';
const PANEL = '#121316';
const BORDER = 'rgba(255,255,255,0.09)';
const DIM = 'rgba(245,245,245,0.42)';
const TEXT = 'rgba(245,245,245,0.86)';

function LayerChrome({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden', ...style }}>
      {children}
    </div>
  );
}

function label(t: string, color = DIM) {
  return <span style={{ fontFamily: 'var(--font-brand, monospace)', fontSize: 8, letterSpacing: '0.16em', textTransform: 'uppercase', color }}>{t}</span>;
}

/** The visual content of each named layer — Slayer product silhouettes. */
function LayerBody({ id }: { id: string }) {
  switch (id) {
    case 'grid':
      return (
        <div style={{ position: 'absolute', inset: 0, opacity: 0.5 }}>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(${BORDER} 1px, transparent 1px), linear-gradient(90deg, ${BORDER} 1px, transparent 1px)`, backgroundSize: '34px 34px' }} />
          <span style={{ position: 'absolute', left: 8, top: 120, fontFamily: 'var(--font-brand,monospace)', fontSize: 9, color: 'rgba(106,147,181,0.35)' }}>flow.gex_net # −1.84bn</span>
          <span style={{ position: 'absolute', right: 10, top: 240, fontFamily: 'var(--font-brand,monospace)', fontSize: 9, color: 'rgba(199,147,80,0.35)' }}>vanna: bearish &lt; 5,940</span>
        </div>
      );
    case 'frame':
      return (
        <LayerChrome style={{ background: INK, borderColor: 'rgba(255,255,255,0.12)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 26, padding: '0 10px', borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ fontFamily: 'var(--font-brand,monospace)', fontSize: 11, fontWeight: 700 }}>
              <span style={{ color: '#6B7177' }}>&gt;</span><span style={{ color: '#F4F5F6' }}>slayer_terminal</span>
            </span>
            <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <span style={{ width: 5, height: 5, borderRadius: 99, background: GREEN }} />
              {label('SPX · 0DTE')}
            </span>
          </div>
        </LayerChrome>
      );
    case 'nav':
      return (
        <LayerChrome style={{ background: '#0d0e10' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 8px' }}>
            {['SKY', 'GEX', 'FLW', 'LIV', 'QNT'].map((t, i) => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 14, height: 14, borderRadius: 4, border: `1px solid ${BORDER}`, background: i === 1 ? 'rgba(106,147,181,0.18)' : 'transparent' }} />
                {label(t, i === 1 ? STEEL : DIM)}
              </div>
            ))}
          </div>
        </LayerChrome>
      );
    case 'metrics':
      return (
        <LayerChrome style={{ background: PANEL }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', height: '100%' }}>
            {[['NET GEX', '−$1.84B', RED], ['SPOT', '5,993.9', TEXT], ['CALL WALL', '6,050', STEEL], ['EXP MOVE', '0.61%', AMBER]].map(([l, v, c], i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, padding: '0 10px', borderLeft: i ? `1px solid ${BORDER}` : 'none', minWidth: 0 }}>
                {label(l as string)}
                <div style={{ fontFamily: 'var(--font-brand,monospace)', fontSize: 12, fontWeight: 700, lineHeight: 1, color: c as string, whiteSpace: 'nowrap' }}>{v}</div>
              </div>
            ))}
          </div>
        </LayerChrome>
      );
    case 'chart': {
      // real candlesticks (OHLC) — not a line — on a faint grid with wall levels
      const closes = [50, 58, 52, 62, 55, 66, 61, 54, 49, 60, 70, 65, 74, 68, 78, 72];
      const lo = 42, hi = 84, span = hi - lo;
      const yOf = (v: number) => 88 - ((v - lo) / span) * 76 - 6;
      const stepX = 236 / closes.length, bw = stepX * 0.56;
      return (
        <LayerChrome>
          <div style={{ padding: '7px 9px' }}>{label('Price · Key Levels', STEEL)}</div>
          <svg viewBox="0 0 244 96" style={{ width: '100%', height: 96, display: 'block' }}>
            <line x1="4" y1={yOf(74)} x2="240" y2={yOf(74)} stroke={STEEL} strokeOpacity="0.26" strokeDasharray="2 3" />
            <line x1="4" y1={yOf(50)} x2="240" y2={yOf(50)} stroke={RED} strokeOpacity="0.26" strokeDasharray="2 3" />
            {closes.map((c, i) => {
              const o = i === 0 ? c - 3 : closes[i - 1];
              const wig = 2 + Math.abs(Math.sin(i * 12.9)) * 4;
              const up = c >= o;
              const col = up ? GREEN : RED;
              const cx = 4 + i * stepX + stepX / 2;
              const yO = yOf(o), yC = yOf(c);
              return (
                <g key={i}>
                  <line x1={cx} y1={yOf(Math.max(o, c) + wig)} x2={cx} y2={yOf(Math.min(o, c) - wig)} stroke={col} strokeWidth={0.8} />
                  <rect x={cx - bw / 2} y={Math.min(yO, yC)} width={bw} height={Math.max(1.2, Math.abs(yC - yO))} fill={col} rx={0.5} />
                </g>
              );
            })}
          </svg>
        </LayerChrome>
      );
    }
    case 'gex':
      return (
        <LayerChrome>
          <div style={{ padding: '7px 9px' }}>{label('Dealer Positioning', AMBER)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '2px 9px' }}>
            {[42, 66, 30, 78, 54, 22].map((w, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: i % 2 ? 'flex-start' : 'flex-end' }}>
                <span style={{ height: 6, width: `${w}%`, background: i % 2 ? RED : STEEL, borderRadius: 2 }} />
              </div>
            ))}
          </div>
        </LayerChrome>
      );
    case 'levels':
      return (
        <LayerChrome>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', height: '100%' }}>
            {[['CALL WALL', '6,050', STEEL], ['PIN', '5,950', AMBER], ['PUT WALL', '5,900', RED]].map(([l, v, c], i) => (
              <div key={i} style={{ padding: '10px', borderLeft: i ? `1px solid ${BORDER}` : 'none' }}>
                {label(l as string)}
                <div style={{ marginTop: 4, fontFamily: 'var(--font-brand,monospace)', fontSize: 13, fontWeight: 700, color: c as string }}>{v}</div>
              </div>
            ))}
          </div>
        </LayerChrome>
      );
    case 'skyvision':
      return (
        <LayerChrome style={{ background: '#14151a', boxShadow: '0 18px 40px -18px rgba(0,0,0,0.8)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderBottom: `1px solid ${BORDER}` }}>
            {label('SkyVision · Ranked', STEEL)}
            <span style={{ fontFamily: 'var(--font-brand,monospace)', fontSize: 10, color: GREEN }}>93</span>
          </div>
          <div style={{ padding: '8px 10px' }}>
            <div style={{ fontFamily: 'var(--font-brand,monospace)', fontSize: 12, color: TEXT }}>SPX 5450P · 0DTE</div>
            <div style={{ marginTop: 6, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)' }}>
              <div style={{ height: '100%', width: '93%', borderRadius: 3, background: GREEN }} />
            </div>
          </div>
        </LayerChrome>
      );
    case 'feed':
      return (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
          {['GEX', 'DEX', 'VEX'].map((t) => (
            <span key={t} style={{ padding: '3px 7px', borderRadius: 6, border: `1px solid ${BORDER}`, background: PANEL, fontFamily: 'var(--font-brand,monospace)', fontSize: 9, letterSpacing: '0.12em', color: TEXT }}>{t}</span>
          ))}
        </div>
      );
    default:
      return null;
  }
}

export function LayeredTerminalAssembly({ reduced }: { reduced: boolean }) {
  // Lay the terminal out at a FIXED 560×380 design size and scale the whole thing
  // uniformly to fit its column, so the aspect ratio is always locked and type/SVG
  // never squish or overlap (the fix for the distorted, cramped render).
  const { ref: scope, scale } = useFitScale<HTMLDivElement>(560);
  const breatheRef = useRef<HTMLDivElement | null>(null);

  useGSAP(
    () => {
      const nodes = LAYERS.map((l) => scope.current!.querySelector<HTMLElement>(`[data-layer="${l.id}"]`)).filter(Boolean) as HTMLElement[];
      if (!nodes.length) return;

      if (reduced) {
        gsap.set(nodes, { x: 0, y: 0, rotation: 0, scale: 1, autoAlpha: 1 });
        return;
      }

      // ── Assemble ONCE, then hold — the terminal never disassembles or vanishes.
      // A first-time visitor sees the pieces fly in, lock together, and the desk
      // simply stays alive: a slow breath plus per-layer micro-drift at different
      // periods (never opacity — the card is always fully present).
      LAYERS.forEach((l, i) => gsap.set(nodes[i], { x: l.from.x, y: l.from.y, rotation: l.from.rot, scale: l.from.scale, autoAlpha: l.id === 'grid' ? 0.5 : 0 }));
      const tl = gsap.timeline({ defaults: { force3D: true } });
      tl.to(nodes, {
        x: 0, y: 0, rotation: 0, scale: 1, autoAlpha: 1,
        duration: 0.8, ease: GSAP_EASE_PRIMARY, stagger: STAGGER.layer,
      }, 0.1);
      // idle life, started after lock-in: a barely-there breath on the whole desk…
      tl.add(() => {
        gsap.to(breatheRef.current, { scale: 1.008, duration: 3.2, ease: 'sine.inOut', yoyo: true, repeat: -1 });
        // …and 2–3px drift on the floating accent layers (different periods so the
        // motion never reads as a synchronized loop). Transform-only, no opacity.
        nodes.forEach((n, i) => {
          const depth = LAYERS[i].depth;
          if (depth < 4) return; // only the top depth plane floats
          gsap.to(n, {
            y: `+=${i % 2 ? 3 : -3}`,
            duration: 2.6 + i * 0.7,
            ease: 'sine.inOut',
            yoyo: true,
            repeat: -1,
          });
        });
      });
    },
    { scope, dependencies: [reduced], revertOnUpdate: true },
  );

  return (
    // Outer box holds the aspect ratio responsively; the inner box is the exact
    // 560×380 design, scaled to fill it. Everything inside is positioned in real
    // design pixels, so one transform scales positions + type + SVG together.
    <div ref={scope} style={{ position: 'relative', width: '100%', maxWidth: 680, aspectRatio: '560 / 380', margin: '0 auto' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 560, height: 380, transformOrigin: 'top left', transform: `scale(${scale})` }}>
        <div ref={breatheRef} style={{ position: 'absolute', inset: 0, transformOrigin: '50% 50%' }}>
          {LAYERS.map((l) => (
            <div
              key={l.id}
              data-layer={l.id}
              data-depth={l.depth}
              style={{
                position: 'absolute',
                left: l.box.left,
                top: l.box.top,
                width: l.box.width,
                height: l.box.height,
                zIndex: l.z,
                willChange: 'transform, opacity',
              }}
            >
              <LayerBody id={l.id} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default LayeredTerminalAssembly;

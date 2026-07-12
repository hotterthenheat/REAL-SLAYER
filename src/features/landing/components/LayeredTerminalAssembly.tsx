import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { GSAP_EASE_PRIMARY, STAGGER, DUR } from '../motion/motionTokens';
import { useFitScale } from '../hooks/useFitScale';

/**
 * Live tick engine for the hero terminal. This is a marketing surface, not a real
 * feed — but the whole point of the hero is that it BREATHES like the product, so
 * the numbers move: spot random-walks in a tight band, Net GEX / expected-move
 * flicker, the candle series rolls a fresh print in every ~1.5s, dealer bars
 * jitter, and the SkyVision score ticks. Direction flags let a value flash green/
 * red on the frame it changes. Frozen entirely under reduced motion.
 */
type Live = {
  spot: number; netGex: number; expMove: number; score: number;
  bars: number[]; candles: number[]; spotDir: number;
};
const BASE_CANDLES = [50, 58, 52, 62, 55, 66, 61, 54, 49, 60, 70, 65, 74, 68, 78, 72];
const BASE_LIVE: Live = { spot: 5993.9, netGex: -1.84, expMove: 0.61, score: 93, bars: [42, 66, 30, 78, 54, 22], candles: BASE_CANDLES, spotDir: 0 };

function useLiveTicker(reduced: boolean): Live {
  const [d, setD] = useState<Live>(BASE_LIVE);
  useEffect(() => {
    if (reduced) return;
    let spot = BASE_LIVE.spot, gex = BASE_LIVE.netGex, em = BASE_LIVE.expMove, score = BASE_LIVE.score;
    let bars = BASE_LIVE.bars.slice();
    let candles = BASE_LIVE.candles.slice();
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const metrics = setInterval(() => {
      const prev = spot;
      spot = clamp(spot + (Math.random() - 0.48) * 1.7, 5972, 6014);
      gex = clamp(gex + (Math.random() - 0.5) * 0.07, -2.4, -1.2);
      em = clamp(em + (Math.random() - 0.5) * 0.03, 0.47, 0.83);
      score = Math.round(clamp(score + (Math.random() - 0.5) * 2.2, 88, 96));
      bars = bars.map((b) => clamp(b + (Math.random() - 0.5) * 11, 16, 92));
      setD((p) => ({ ...p, spot, netGex: gex, expMove: em, score, bars: bars.slice(), spotDir: Math.sign(spot - prev) }));
    }, 1300);
    const roll = setInterval(() => {
      const next = clamp(candles[candles.length - 1] + (Math.random() - 0.5) * 11, 44, 82);
      candles = [...candles.slice(1), next];
      setD((p) => ({ ...p, candles: candles.slice() }));
    }, 1500);
    return () => { clearInterval(metrics); clearInterval(roll); };
  }, [reduced]);
  return d;
}

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

/** The visual content of each named layer — Slayer product silhouettes, fed the
 *  live tick values so the metrics, chart, bars and score all move. */
function LayerBody({ id, live }: { id: string; live: Live }) {
  const fmtSpot = live.spot.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const spotColor = live.spotDir > 0 ? GREEN : live.spotDir < 0 ? RED : TEXT;
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
            {[
              ['NET GEX', `−$${Math.abs(live.netGex).toFixed(2)}B`, RED],
              ['SPOT', fmtSpot, spotColor],
              ['CALL WALL', '6,050', STEEL],
              ['EXP MOVE', `${live.expMove.toFixed(2)}%`, AMBER],
            ].map(([l, v, c], i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, padding: '0 10px', borderLeft: i ? `1px solid ${BORDER}` : 'none', minWidth: 0 }}>
                {label(l as string)}
                <div style={{ fontFamily: 'var(--font-brand,monospace)', fontSize: 12, fontWeight: 700, lineHeight: 1, color: c as string, whiteSpace: 'nowrap', transition: 'color 240ms ease' }}>{v}</div>
              </div>
            ))}
          </div>
        </LayerChrome>
      );
    case 'chart': {
      // real candlesticks (OHLC) — not a line — on a faint grid with wall levels.
      // The series rolls: a fresh print arrives every ~1.5s and the newest candle
      // is emphasised, so the chart reads as a live tape.
      const closes = live.candles;
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
              const isLast = i === closes.length - 1;
              return (
                <g key={i} opacity={isLast ? 1 : 0.82}>
                  <line x1={cx} y1={yOf(Math.max(o, c) + wig)} x2={cx} y2={yOf(Math.min(o, c) - wig)} stroke={col} strokeWidth={isLast ? 1.1 : 0.8} />
                  <rect x={cx - bw / 2} y={Math.min(yO, yC)} width={bw} height={Math.max(1.2, Math.abs(yC - yO))} fill={col} rx={0.5} />
                  {isLast ? <circle cx={cx} cy={yC} r={1.6} fill={col} /> : null}
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
            {live.bars.map((w, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: i % 2 ? 'flex-start' : 'flex-end' }}>
                <span style={{ height: 6, width: `${w}%`, background: i % 2 ? RED : STEEL, borderRadius: 2, transition: 'width 700ms cubic-bezier(0.16,1,0.3,1)' }} />
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
            <span style={{ fontFamily: 'var(--font-brand,monospace)', fontSize: 10, color: GREEN }}>{live.score}</span>
          </div>
          <div style={{ padding: '8px 10px' }}>
            <div style={{ fontFamily: 'var(--font-brand,monospace)', fontSize: 12, color: TEXT }}>SPX 5450P · 0DTE</div>
            <div style={{ marginTop: 6, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)' }}>
              <div style={{ height: '100%', width: `${live.score}%`, borderRadius: 3, background: GREEN, transition: 'width 700ms cubic-bezier(0.16,1,0.3,1)' }} />
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
  const live = useLiveTicker(reduced);

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

      // Choreographed in three directed beats instead of one uniform cascade, so the
      // desk reads as ASSEMBLED, not merely faded in: (1) the foundation — grid +
      // frame — settles first and gives the pieces a surface to land on; (2) the
      // working panels sweep in from their own sides, overlapping the tail of beat 1;
      // (3) the accent chips (SkyVision, live feed) lock in last, a beat behind, so
      // the eye finishes on the signal. All transform+opacity only (GPU-cheap), all
      // on the shared expo-out hand from the motion tokens.
      const byId: Record<string, HTMLElement> = {};
      LAYERS.forEach((l, i) => { if (nodes[i]) byId[l.id] = nodes[i]; });
      const pick = (ids: string[]) => ids.map((id) => byId[id]).filter(Boolean) as HTMLElement[];
      const foundation = pick(['grid', 'frame']);
      const structure = pick(['nav', 'metrics', 'chart', 'gex', 'levels']);
      const accents = pick(['skyvision', 'feed']);
      const home = { x: 0, y: 0, rotation: 0, scale: 1, autoAlpha: 1 };

      const tl = gsap.timeline({ defaults: { force3D: true, ease: GSAP_EASE_PRIMARY } });
      tl.to(foundation, { ...home, duration: DUR.hero, stagger: STAGGER.tight }, 0.1);
      tl.to(structure, { ...home, duration: DUR.hero, stagger: STAGGER.layer }, 0.4);
      tl.to(accents, { ...home, duration: DUR.reveal, stagger: STAGGER.tight }, 0.98);
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
    <div ref={scope} style={{ position: 'relative', width: '100%', maxWidth: 760, aspectRatio: '560 / 380', margin: '0 auto' }}>
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
              <LayerBody id={l.id} live={live} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default LayeredTerminalAssembly;

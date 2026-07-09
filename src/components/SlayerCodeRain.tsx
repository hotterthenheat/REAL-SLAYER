import { useMemo } from 'react';
import { useReducedMotion } from 'motion/react';

/**
 * SlayerCodeRain — a faithful port of the slayerterminal.com hero background:
 * columns of terminal lines drifting up/down endlessly, tinted by product
 * (steel = SkyVision setup scanning, amber = Pinpoint AI dealer flow), under a
 * radial scrim + vignette so it reads as texture, not a chart. Colour still
 * encodes meaning; motion is slow. Collapses to nothing under reduced-motion.
 *
 * Positioned `absolute inset-0`, it fills — and is clipped to — its nearest
 * positioned ancestor (the hero section), so the rain lives only behind the
 * first viewport and fades to solid #08090A at the hero's lower edge. Every
 * section below the hero therefore sits on clean, legible black.
 */

const STEEL = '#6A93B5'; // SkyVision — setup scanning / scoring / ranking
const AMBER = '#C79350'; // Pinpoint AI — dealer flow / GEX / gamma / walls
const DIM2 = '#454E58';

const POOL = [
  // SkyVision — setup scanner
  'chain = spx.chain(dte=0)',
  'setups = skyvision.scan(chain)',
  'top = setups.rank().head(5)',
  'skyvision.scan() -> 4 setups',
  'setup.score   # 91',
  'setup.ev      # +0.44R',
  'score = kelly(edge, win_rate)',
  'ev = sum(p(x) * payoff(x))',
  'upper = ema + k * atr',
  'reprice(S, vol - 0.012 * dPct)',
  'P_touch = 0.67',
  'if px >= upper: return HOLDING',
  'if px <= lower: return FAILING',
  'return TESTING',
  "chain('SPX', 0DTE).rank()",
  'setups = rank(chain, strat)',
  // Pinpoint AI — dealer flow
  'flow = pinpoint.read(chain)',
  'flow.gex_net   # -1.84bn',
  'flow.flip      # 5,938',
  'flow.vanna     # bearish < 5940',
  'flow.charm     # sell accel',
  'pinpoint.dealers() -> gex -1.84bn',
  'dealers.hedge -> accel down',
  'NET GEX  -1.84bn   FLIP  5,938',
  'DEX +0.39   VEX 0.72',
  'CALL WALL 6050   -1.9bn',
  'PUT  WALL 5900   +2.4bn',
  'vanna: bearish below 5,940',
  'charm: sell accel into close',
  'regime: neg gamma',
  // Contract scores
  'SPX  5938P  0DTE   91',
  'SPX  5985C  0DTE   88',
  'QQQ   495P  0DTE   82',
  'NDX 21180P  1DTE   76',
  'IWM   225C  0DTE   69',
  // Live terminal output
  'SLAYER/LIVE  09:41:22 ET',
  '0DTE  filled  5938P  +31%',
  'P_cal 0.64   EV +0.41R',
  'slayer:~ $',
];

const STEEL_KEYS = ['skyvision', 'setup', 'scan', 'rank', 'score', 'kelly', 'reprice', 'p_touch', 'holding', 'testing', 'failing'];
const AMBER_KEYS = ['pinpoint', 'gex', 'dex', 'vex', 'flip', 'dealer', 'wall', 'vanna', 'charm', 'accel', 'regime'];

function tint(s: string): string {
  const l = s.toLowerCase();
  if (STEEL_KEYS.some((k) => l.includes(k))) return STEEL;
  if (AMBER_KEYS.some((k) => l.includes(k))) return AMBER;
  return DIM2;
}

// Deterministic PRNG so column layout is stable across a mount (no Math.random
// hydration flicker); seeded off the column index.
function seeded(i: number) {
  let x = Math.sin(i * 999.13) * 43758.5453;
  return () => {
    x = Math.sin(x) * 43758.5453;
    return x - Math.floor(x);
  };
}

export default function SlayerCodeRain() {
  const reduce = useReducedMotion();

  const columns = useMemo(() => {
    const cols = 8; // stable count; CSS handles width via left%
    return Array.from({ length: cols }, (_, c) => {
      const rnd = seeded(c + 1);
      const dur = 36 + rnd() * 42;
      const lines = Array.from({ length: 22 }, () => POOL[Math.floor(rnd() * POOL.length)]);
      return {
        left: c * (100 / cols) + (rnd() * 4 - 2),
        dur,
        delay: -rnd() * dur,
        up: rnd() > 0.5,
        opacity: 0.42 + rnd() * 0.22,
        lines: lines.concat(lines), // duplicate for a seamless -50% loop
      };
    });
  }, []);

  // Reduced motion: no rain. The hero simply resolves to the page's solid
  // #08090A, matching every section below it.
  if (reduce) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {columns.map((col, i) => (
        <div
          key={i}
          className="absolute top-0 flex select-none flex-col whitespace-nowrap"
          style={{
            left: `${col.left}%`,
            gap: 17,
            fontFamily: 'var(--font-brand)',
            fontSize: 12,
            lineHeight: 1.85,
            opacity: col.opacity,
            willChange: 'transform',
            animation: `${col.up ? 'slayerRainUp' : 'slayerRainDown'} ${col.dur}s linear infinite`,
            animationDelay: `${col.delay}s`,
          }}
        >
          {col.lines.map((ln, j) => (
            <span key={j} style={{ color: tint(ln) }}>{ln}</span>
          ))}
        </div>
      ))}
      {/* scrim — darkens the centre so hero content stays legible */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 72% 62% at 50% 44%, rgba(8,9,10,0.9) 0%, rgba(8,9,10,0.55) 44%, transparent 78%)' }} />
      {/* vignette */}
      <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 260px 70px rgba(0,0,0,0.92)', background: 'radial-gradient(ellipse at center, transparent 52%, rgba(0,0,0,0.62) 100%)' }} />
      {/* bottom fade — ramps the rain into solid #08090A so it dissolves cleanly
          into the sections below the hero */}
      <div className="absolute inset-x-0 bottom-0 h-1/2" style={{ background: 'linear-gradient(to bottom, transparent 0%, rgba(8,9,10,0.85) 62%, #08090A 100%)' }} />
    </div>
  );
}

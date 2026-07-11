import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useLandingMotion } from '../motion/LandingMotionProvider';
import { EASE_PRIMARY } from '../motion/motionTokens';
import { Reveal } from '../components/Reveal';
import { PALETTE } from '../content/LandingSections';

/**
 * Scene 4 — the interactive product showcase. Instead of static mockups (or literal
 * screenshots), each of the six engines gets a HANDS-ON mini modelled on its real
 * page: hover the ranked rows, brush the dealer-positioning strikes, sweep the IV
 * surface cells, scrub the live chart, pick a trade in the blotter. Switching the
 * left tab crossfades to that engine's live preview. The point is to let a first-time
 * visitor *operate* the product for a few seconds and want the rest.
 *
 * Every preview is self-contained and interactive on hover/click; the two with a
 * genuine feed (chart, flow) tick on an interval, frozen under reduced motion.
 */

const line = 'var(--border)';
const lineStrong = 'var(--border-strong)';
const ghost = 'var(--text-primary)';
const muted = 'var(--text-secondary)';
const faint = 'var(--text-tertiary)';
const panel = 'var(--surface)';
const panelSoft = 'var(--surface-2)';
const STEEL = PALETTE.steel, AMBER = PALETTE.amber, GREEN = PALETTE.green, RED = PALETTE.red;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const chip = (c: string): React.CSSProperties => ({ border: `1px solid ${line}`, color: faint, letterSpacing: '0.12em' });

/* ───────────────────────── SkyVision — ranked scanner ───────────────────────── */
const SKY_ROWS = [
  { r: 1, sym: 'SPX 5520C', setup: 'Conviction', conf: 96, rr: '0.7 : 1', em: '±43%', target: '$5.40 → $7.20' },
  { r: 2, sym: 'SPX 5500C', setup: 'Conviction', conf: 96, rr: '0.8 : 1', em: '±39%', target: '$6.10 → $8.05' },
  { r: 3, sym: 'SPY 515C', setup: 'Conviction', conf: 94, rr: '0.7 : 1', em: '±36%', target: '$2.10 → $2.90' },
  { r: 4, sym: 'SPX 5600C', setup: 'Block Sweep', conf: 94, rr: '1.2 : 1', em: '±62%', target: '$3.20 → $6.10' },
  { r: 5, sym: 'NDX 18500C', setup: 'Momentum', conf: 91, rr: '1.5 : 1', em: '±75%', target: '$41 → $92' },
];
function SkyVisionPreview() {
  const [sel, setSel] = useState(0);
  const s = SKY_ROWS[sel];
  return (
    <div className="grid h-full grid-cols-1 gap-px sm:grid-cols-[1.5fr_1fr]" style={{ background: line }}>
      <div className="min-w-0 overflow-hidden" style={{ background: panel }}>
        <div className="flex items-center justify-between px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: faint, borderBottom: `1px solid ${line}` }}>
          <span>Opportunities · 30 ranked</span><span>Confidence ▾</span>
        </div>
        {SKY_ROWS.map((row, i) => {
          const on = i === sel;
          return (
            <button
              key={row.r}
              onMouseEnter={() => setSel(i)}
              onFocus={() => setSel(i)}
              onClick={() => setSel(i)}
              className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left transition-colors"
              style={{ background: on ? panelSoft : 'transparent', borderLeft: `2px solid ${on ? STEEL : 'transparent'}` }}
            >
              <span className="w-3 text-[10px] tabular-nums" style={{ color: faint }}>{row.r}</span>
              <span className="w-[74px] shrink-0 text-[11px] font-semibold" style={{ color: ghost }}>{row.sym}</span>
              <span className="hidden w-[74px] shrink-0 text-[9px] uppercase tracking-[0.1em] sm:block" style={{ color: muted }}>{row.setup}</span>
              <span className="relative h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }}>
                <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${row.conf}%`, background: on ? STEEL : 'rgba(106,147,181,0.55)' }} />
              </span>
              <span className="w-7 text-right text-[10px] tabular-nums" style={{ color: ghost }}>{row.conf}</span>
            </button>
          );
        })}
      </div>
      {/* selected-setup rail */}
      <div className="min-w-0 p-3" style={{ background: panel }}>
        <div className="text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: faint }}>Selected setup</div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-[15px] font-bold" style={{ color: ghost }}>{s.sym}</span>
          <span className="rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em]" style={{ color: GREEN, background: 'color-mix(in srgb, #3F9C79 12%, transparent)' }}>Bull</span>
        </div>
        <div className="mt-3 space-y-2 text-[10px]">
          {[['Confidence', `${s.conf}%`], ['R / R', s.rr], ['Exp. move', s.em], ['Target', s.target]].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-2">
              <span style={{ color: faint }}>{k}</span>
              <span className="tabular-nums" style={{ color: ghost }}>{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: STEEL }}>Open setup →</div>
      </div>
    </div>
  );
}

/* ──────────────────── Pinpoint — dealer positioning map ──────────────────── */
const PIN = [
  { k: 6050, net: 18 }, { k: 6000, net: 46 }, { k: 5950, net: 30 }, { k: 5900, net: 58 }, { k: 5850, net: 40 },
  { k: 5750, net: 24, pin: true }, { k: 5705, net: 4, spot: true }, { k: 5650, net: -30 },
  { k: 5600, net: -64, wall: 'put' as const }, { k: 5550, net: -44 }, { k: 5500, net: -58 }, { k: 5450, net: -34 },
];
function PinpointPreview() {
  const [hi, setHi] = useState(5);
  const maxAbs = 64;
  const h = PIN[hi];
  return (
    <div className="flex h-full flex-col" style={{ background: panel }}>
      <div className="flex items-center justify-between px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: faint, borderBottom: `1px solid ${line}` }}>
        <span>Dealer Positioning · net pressure by strike</span>
        <span className="tabular-nums" style={{ color: h.net >= 0 ? STEEL : RED }}>{h.k} · {h.net >= 0 ? '+' : ''}{h.net}M {h.net >= 0 ? 'call' : 'put'}</span>
      </div>
      <div className="relative flex-1 px-3 py-2">
        {/* centre / spot axis */}
        <div className="absolute inset-y-2 left-1/2 w-px" style={{ background: 'rgba(255,255,255,0.14)' }} />
        <div className="flex h-full flex-col justify-between">
          {PIN.map((d, i) => {
            const on = i === hi;
            const w = (Math.abs(d.net) / maxAbs) * 46;
            const call = d.net >= 0;
            return (
              <button
                key={d.k}
                onMouseEnter={() => setHi(i)}
                onFocus={() => setHi(i)}
                className="group flex items-center gap-2 py-[1px]"
                style={{ cursor: 'pointer' }}
              >
                <span className="w-9 shrink-0 text-right text-[8px] tabular-nums" style={{ color: d.spot ? ghost : faint, fontWeight: d.spot ? 700 : 400 }}>{d.k}</span>
                <span className="relative flex h-2.5 flex-1 items-center">
                  <span className="absolute left-1/2 h-full -translate-x-full rounded-l-[2px]" style={{ width: call ? 0 : `${w}%`, background: RED, opacity: on ? 1 : 0.6 }} />
                  <span className="absolute left-1/2 h-full rounded-r-[2px]" style={{ width: call ? `${w}%` : 0, background: STEEL, opacity: on ? 1 : 0.6 }} />
                </span>
                {d.wall ? <span className="text-[7px] font-bold uppercase" style={{ color: RED }}>PW</span> : d.pin ? <span className="text-[7px] font-bold uppercase" style={{ color: AMBER }}>PIN</span> : <span className="w-4" />}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-3 px-3 py-1.5 text-[8px] uppercase tracking-[0.1em]" style={{ color: faint, borderTop: `1px solid ${line}` }}>
        <span className="flex items-center gap-1"><span className="h-1.5 w-2.5 rounded-sm" style={{ background: RED }} />Put pressure</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-2.5 rounded-sm" style={{ background: STEEL }} />Call pressure</span>
      </div>
    </div>
  );
}

/* ─────────────────────── Dealer Flow — net gamma by strike ─────────────────────── */
function DealerFlowPreview() {
  const { reduced } = useLandingMotion();
  const [bars, setBars] = useState(() => [22, 38, 30, 52, 44, 18, -26, -40, -34, -58, -30, -20]);
  const [hi, setHi] = useState<number | null>(null);
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setBars((b) => b.map((v) => clamp(v + (Math.random() - 0.5) * 8, -64, 64))), 1400);
    return () => clearInterval(t);
  }, [reduced]);
  const strikes = [6050, 6000, 5950, 5900, 5850, 5750, 5650, 5600, 5550, 5500, 5450, 5400];
  return (
    <div className="flex h-full flex-col" style={{ background: panel }}>
      <div className="flex items-center justify-between px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: faint, borderBottom: `1px solid ${line}` }}>
        <span>Net Gamma · flowing by strike</span>
        <span className="tabular-nums" style={{ color: hi != null ? (bars[hi] >= 0 ? GREEN : RED) : muted }}>{hi != null ? `${strikes[hi]} · ${bars[hi] >= 0 ? '+' : ''}${Math.round(bars[hi])}M` : 'GEX · DEX · VEX'}</span>
      </div>
      <div className="relative flex flex-1 items-stretch gap-[3px] px-3 py-3">
        <div className="absolute inset-x-3 top-1/2 h-px" style={{ background: 'rgba(255,255,255,0.12)' }} />
        {bars.map((v, i) => {
          const on = hi === i;
          const up = v >= 0;
          const hpct = (Math.abs(v) / 64) * 46;
          return (
            <button key={i} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)} onFocus={() => setHi(i)} className="relative flex-1 cursor-pointer" aria-label={`Strike ${strikes[i]}`}>
              <span className="absolute left-0 right-0" style={{ [up ? 'bottom' : 'top']: '50%', height: `${hpct}%`, background: up ? GREEN : RED, opacity: on ? 1 : 0.7, borderRadius: 2, transition: 'height 700ms cubic-bezier(0.16,1,0.3,1)' } as React.CSSProperties} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────── Live Terminal — ticking candles + levels ───────────────────── */
function LiveTerminalPreview() {
  const { reduced } = useLandingMotion();
  const [candles, setCandles] = useState<number[]>([50, 58, 52, 62, 55, 66, 61, 54, 49, 60, 70, 65, 74, 68, 78, 72, 66, 71]);
  const [hoverX, setHoverX] = useState<number | null>(null);
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setCandles((c) => [...c.slice(1), clamp(c[c.length - 1] + (Math.random() - 0.5) * 11, 44, 82)]), 1500);
    return () => clearInterval(t);
  }, [reduced]);
  const W = 320, H = 150, lo = 42, hi = 84, span = hi - lo;
  const yOf = (v: number) => H - 14 - ((v - lo) / span) * (H - 34);
  const stepX = (W - 8) / candles.length, bw = stepX * 0.56;
  const levels = [{ v: 78, c: STEEL, t: 'CALL WALL 6,050' }, { v: 60, c: AMBER, t: 'PIN 5,950' }, { v: 48, c: RED, t: 'PUT WALL 5,900' }];
  const hxIdx = hoverX == null ? null : clamp(Math.floor((hoverX - 4) / stepX), 0, candles.length - 1);
  return (
    <div className="flex h-full flex-col" style={{ background: panel }}>
      <div className="flex items-center justify-between px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: faint, borderBottom: `1px solid ${line}` }}>
        <span>Price · Key Levels</span>
        <span className="flex items-center gap-1.5 tabular-nums" style={{ color: GREEN }}><span className="inline-block h-1 w-1 rounded-full" style={{ background: GREEN }} />SPX {(5900 + (hxIdx != null ? candles[hxIdx] : candles[candles.length - 1])).toFixed(0)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full flex-1" style={{ display: 'block' }} preserveAspectRatio="none"
        onMouseMove={(e) => { const r = (e.target as SVGElement).ownerSVGElement!.getBoundingClientRect(); setHoverX(((e.clientX - r.left) / r.width) * W); }}
        onMouseLeave={() => setHoverX(null)}>
        {levels.map((l) => (
          <g key={l.t}>
            <line x1="2" y1={yOf(l.v)} x2={W - 2} y2={yOf(l.v)} stroke={l.c} strokeOpacity="0.4" strokeDasharray="2 3" strokeWidth="0.6" />
            <text x={W - 3} y={yOf(l.v) - 2} fontSize="5.5" textAnchor="end" fill={l.c} opacity="0.75" style={{ fontFamily: 'var(--font-brand,monospace)' }}>{l.t}</text>
          </g>
        ))}
        {candles.map((c, i) => {
          const o = i === 0 ? c - 3 : candles[i - 1];
          const up = c >= o, col = up ? GREEN : RED;
          const cx = 4 + i * stepX + stepX / 2, wig = 2 + Math.abs(Math.sin(i * 12.9)) * 4;
          const last = i === candles.length - 1;
          return (
            <g key={i} opacity={last ? 1 : 0.85}>
              <line x1={cx} y1={yOf(Math.max(o, c) + wig)} x2={cx} y2={yOf(Math.min(o, c) - wig)} stroke={col} strokeWidth={0.8} />
              <rect x={cx - bw / 2} y={yOf(Math.max(o, c))} width={bw} height={Math.max(1.4, Math.abs(yOf(o) - yOf(c)))} fill={col} rx={0.5} />
            </g>
          );
        })}
        {hoverX != null ? <line x1={hoverX} y1="2" x2={hoverX} y2={H - 2} stroke="rgba(255,255,255,0.35)" strokeWidth="0.6" /> : null}
      </svg>
    </div>
  );
}

/* ──────────────────────── Quant Lab — IV surface heatmap ──────────────────────── */
const IV_RAMP: number[][] = [[15, 30, 58], [42, 90, 138], [58, 138, 104], [154, 120, 48], [168, 64, 32]];
function ivColor(t: number) {
  t = clamp(t, 0, 1) * (IV_RAMP.length - 1);
  const i = Math.min(IV_RAMP.length - 2, Math.floor(t)), f = t - i;
  const a = IV_RAMP[i], b = IV_RAMP[i + 1];
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(',')})`;
}
function QuantPreview() {
  const NX = 16, NY = 9;
  const cells = useMemo(() => {
    const g: { iv: number; m: number; dte: number }[] = [];
    let mn = Infinity, mx = -Infinity;
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const m = (i / (NX - 1)) * 0.4 + 0.8;
      const mm = (m - 1) / 0.2;
      const iv = clamp((0.32 + 0.6 * mm * mm - 0.16 * mm) * (0.9 + 0.18 * (j / (NY - 1))), 0.1, 1.2);
      g.push({ iv, m, dte: Math.round(15 + (j / (NY - 1)) * 350) }); mn = Math.min(mn, iv); mx = Math.max(mx, iv);
    }
    return { g, mn, mx };
  }, []);
  const [hi, setHi] = useState<number | null>(Math.floor((NY / 2) * NX + NX / 2));
  const norm = (iv: number) => (iv - cells.mn) / (cells.mx - cells.mn || 1);
  const h = hi != null ? cells.g[hi] : null;
  return (
    <div className="flex h-full flex-col" style={{ background: panel }}>
      <div className="flex items-center justify-between px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: faint, borderBottom: `1px solid ${line}` }}>
        <span>IV Surface · smile × term</span>
        <span className="tabular-nums" style={{ color: ghost }}>{h ? `K/F ${h.m.toFixed(2)} · ${h.dte}d · ${(h.iv * 100).toFixed(0)}% IV` : ''}</span>
      </div>
      <div className="flex-1 p-2">
        <div className="grid h-full gap-[2px]" style={{ gridTemplateColumns: `repeat(${NX},1fr)`, gridTemplateRows: `repeat(${NY},1fr)` }}>
          {cells.g.map((c, idx) => (
            <button
              key={idx}
              onMouseEnter={() => setHi(idx)}
              onFocus={() => setHi(idx)}
              className="rounded-[1px] transition-transform duration-150"
              style={{ background: ivColor(norm(c.iv)), outline: hi === idx ? '1.5px solid rgba(255,255,255,0.85)' : 'none', outlineOffset: -1, cursor: 'pointer', transform: hi === idx ? 'scale(1.12)' : 'none', zIndex: hi === idx ? 2 : 1 }}
              aria-label={`Moneyness ${c.m.toFixed(2)}, ${c.dte} days, IV ${(c.iv * 100).toFixed(0)}%`}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between px-3 py-1 text-[8px] uppercase tracking-[0.14em]" style={{ color: faint }}>
        <span>0.80 K/F</span><span>Moneyness</span><span>1.20 K/F</span>
      </div>
    </div>
  );
}

/* ───────────────────────── Trade History — blotter ───────────────────────── */
const TRADES = [
  { sym: 'SPX 5450P', out: 'Target 2', pnl: 128 }, { sym: 'NDX 18500P', out: 'Stretch', pnl: 214 },
  { sym: 'SPY 512C', out: 'Target 1', pnl: 44 }, { sym: 'SPX 5600C', out: 'Stopped', pnl: -38 },
  { sym: 'QQQ 448C', out: 'Target 1', pnl: 61 }, { sym: 'SPX 5500P', out: 'Stopped', pnl: -22 },
];
function TradeHistoryPreview() {
  const [hi, setHi] = useState(0);
  const wins = TRADES.filter((t) => t.pnl >= 0).length;
  const maxAbs = 214;
  return (
    <div className="flex h-full flex-col" style={{ background: panel }}>
      <div className="flex items-center justify-between px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: faint, borderBottom: `1px solid ${line}` }}>
        <span>Trade Ledger · realized</span>
        <span className="tabular-nums"><span style={{ color: GREEN }}>{Math.round((wins / TRADES.length) * 100)}%</span> <span style={{ color: faint }}>win rate</span></span>
      </div>
      <div className="flex-1">
        {TRADES.map((t, i) => {
          const on = i === hi, up = t.pnl >= 0, w = (Math.abs(t.pnl) / maxAbs) * 42;
          return (
            <button key={t.sym} onMouseEnter={() => setHi(i)} onFocus={() => setHi(i)} className="flex w-full cursor-pointer items-center gap-2 px-3 py-[7px] text-left transition-colors" style={{ background: on ? panelSoft : 'transparent' }}>
              <span className="w-[74px] shrink-0 text-[11px] font-semibold" style={{ color: ghost }}>{t.sym}</span>
              <span className="hidden w-14 shrink-0 text-[8px] uppercase tracking-[0.1em] sm:block" style={{ color: up ? GREEN : RED }}>{t.out}</span>
              <span className="relative flex h-2 flex-1 items-center">
                <span className="absolute left-1/2 h-full -translate-x-full rounded-l-[2px]" style={{ width: up ? 0 : `${w}%`, background: RED, opacity: on ? 1 : 0.65 }} />
                <span className="absolute left-1/2 h-full rounded-r-[2px]" style={{ width: up ? `${w}%` : 0, background: GREEN, opacity: on ? 1 : 0.65 }} />
              </span>
              <span className="w-10 text-right text-[10px] font-semibold tabular-nums" style={{ color: up ? GREEN : RED }}>{up ? '+' : ''}{t.pnl}%</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────────── the showcase ───────────────────────────── */
interface Mod { id: string; tab: string; name: string; accent: string; desc: string; chips: string[]; Preview: () => ReactNode; }
const MODULES: Mod[] = [
  { id: 'skyvision', tab: 'skyvision', name: 'SkyVision', accent: STEEL, desc: 'Ranks every setup by structure, momentum and risk — hover a row to inspect it.', chips: ['RANKED', 'CONFIDENCE', 'R / R', 'INVALIDATION'], Preview: SkyVisionPreview },
  { id: 'pinpoint', tab: 'pinpoint', name: 'Pinpoint GEX', accent: AMBER, desc: 'Dealer positioning by strike — call walls, put walls and the pin. Brush a strike.', chips: ['CALL WALL', 'PUT WALL', 'PIN', 'GAMMA FLIP'], Preview: PinpointPreview },
  { id: 'dealerflow', tab: 'dealerflow', name: 'Dealer Flow', accent: GREEN, desc: 'Net gamma pressure shifting across strikes as the tape develops, live.', chips: ['GEX', 'DEX', 'VEX', 'NET FLOW'], Preview: DealerFlowPreview },
  { id: 'liveterminal', tab: 'liveterminal', name: 'Live Terminal', accent: STEEL, desc: 'Price against the dealer walls — one clean chart from read to execution.', chips: ['PRICE', 'KEY LEVELS', 'GEX NODES'], Preview: LiveTerminalPreview },
  { id: 'quant', tab: 'quant', name: 'Quant Lab', accent: AMBER, desc: 'The implied-vol surface — sweep the smile × term grid to read any cell.', chips: ['IV SURFACE', 'GREEKS', 'REGIME', 'EXP MOVE'], Preview: QuantPreview },
  { id: 'auditor', tab: 'auditor', name: 'Trade History', accent: GREEN, desc: 'Every tracked setup and its realized outcome — accountable, not alerted.', chips: ['ENTRIES', 'OUTCOMES', 'REALIZED', 'WIN RATE'], Preview: TradeHistoryPreview },
];

export function ProductGridScene({ onEnter }: { onEnter: (tab?: string) => void }) {
  const { reduced } = useLandingMotion();
  const [active, setActive] = useState('skyvision');
  const railRef = useRef<HTMLDivElement | null>(null);
  const mod = MODULES.find((m) => m.id === active)!;
  const Preview = mod.Preview;

  return (
    <section id="product" className="px-5 py-16" style={{ borderTop: `1px solid ${line}`, background: PALETTE.bg }} data-scene="product-grid" aria-label="Interactive product showcase">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <div className="text-[10px] font-semibold uppercase" style={{ letterSpacing: '0.28em', color: faint }}>The Terminal</div>
        <h2 className="mt-3 text-[26px] font-semibold leading-tight sm:text-[32px]" style={{ color: PALETTE.ghost, letterSpacing: '-0.01em' }}>Six engines. Try each one.</h2>
        <p className="mx-auto mt-3 max-w-xl text-[13.5px] leading-relaxed" style={{ color: muted }}>Not screenshots — the real reads, running. Pick an engine and put your cursor in it.</p>
      </div>

      <Reveal className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[12px] lg:grid-cols-[220px_1fr]" style={{ border: `1px solid ${line}`, background: line }}>
          {/* engine rail */}
          <div ref={railRef} className="flex gap-px overflow-x-auto lg:flex-col" style={{ background: line }} role="tablist" aria-label="Engines">
            {MODULES.map((m) => {
              const on = m.id === active;
              return (
                <button
                  key={m.id}
                  role="tab"
                  aria-selected={on}
                  onClick={() => setActive(m.id)}
                  onMouseEnter={() => setActive(m.id)}
                  className="flex min-w-[150px] shrink-0 cursor-pointer items-center gap-2.5 px-4 py-3 text-left transition-colors lg:min-w-0"
                  style={{ background: on ? panel : panelSoft, borderLeft: `2px solid ${on ? m.accent : 'transparent'}` }}
                >
                  <span className="h-2.5 w-[3px] shrink-0 rounded-full" style={{ background: m.accent, opacity: on ? 1 : 0.5 }} />
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-semibold" style={{ color: on ? ghost : muted }}>{m.name}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* live preview + footer */}
          <div className="flex min-w-0 flex-col" style={{ background: panel }}>
            <div className="relative min-h-[300px] flex-1 overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.div
                  key={mod.id}
                  className="absolute inset-0"
                  initial={reduced ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduced ? undefined : { opacity: 0, y: -8 }}
                  transition={{ duration: 0.28, ease: EASE_PRIMARY }}
                >
                  <Preview />
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="flex flex-col gap-3 px-4 py-4" style={{ borderTop: `1px solid ${line}` }}>
              <div className="flex items-start justify-between gap-4">
                <p className="max-w-lg text-[12.5px] leading-relaxed" style={{ color: muted }}>{mod.desc}</p>
                <button
                  type="button"
                  onClick={() => onEnter(mod.tab)}
                  className="shrink-0 cursor-pointer whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.14em] transition-transform hover:translate-x-0.5"
                  style={{ color: mod.accent }}
                >
                  Open {mod.name} →
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {mod.chips.map((c) => (
                  <span key={c} className="rounded-[5px] px-2 py-1 text-[9px] font-semibold uppercase" style={chip(mod.accent)}>{c}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export default ProductGridScene;

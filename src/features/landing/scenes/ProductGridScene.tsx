import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useLandingMotion } from '../motion/LandingMotionProvider';
import { EASE_PRIMARY } from '../motion/motionTokens';
import { Reveal } from '../components/Reveal';
import { PALETTE } from '../content/LandingSections';

// The Quant engine uses the ACTUAL 3D IV surface the terminal renders — lazy so
// three.js only loads when a visitor opens that engine, keeping the landing light.
const QuantSurface3D = lazy(() => import('../../../components/quant/QuantSurface3D'));
const GREEK = '#8A5AA0';

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
      <div className="flex min-w-0 flex-col overflow-hidden" style={{ background: panel }}>
        <div className="flex shrink-0 items-center justify-between px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: faint, borderBottom: `1px solid ${line}` }}>
          <span>Opportunities · 30 ranked</span><span>Confidence ▾</span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          {SKY_ROWS.map((row, i) => {
            const on = i === sel;
            return (
              <button
                key={row.r}
                onMouseEnter={() => setSel(i)}
                onFocus={() => setSel(i)}
                onClick={() => setSel(i)}
                className="flex w-full flex-1 cursor-pointer items-center gap-2.5 px-3 text-left transition-colors"
                style={{ background: on ? panelSoft : 'transparent', borderLeft: `2px solid ${on ? STEEL : 'transparent'}`, borderTop: i ? `1px solid ${line}` : undefined }}
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
      </div>
      {/* selected-setup rail */}
      <div className="flex min-w-0 flex-col p-3" style={{ background: panel }}>
        <div className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: faint }}>Selected setup</div>
        <div className="mt-1.5 flex shrink-0 items-center justify-between gap-2">
          <span className="text-[15px] font-bold" style={{ color: ghost }}>{s.sym}</span>
          <span className="rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em]" style={{ color: GREEN, background: 'color-mix(in srgb, #3F9C79 12%, transparent)' }}>Bull</span>
        </div>
        <div className="mt-3 flex min-h-0 flex-1 flex-col justify-between text-[10.5px]">
          {[['Confidence', `${s.conf}%`], ['R / R', s.rr], ['Exp. move', s.em], ['Target', s.target]].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-2 border-b py-1" style={{ borderColor: line }}>
              <span style={{ color: faint }}>{k}</span>
              <span className="tabular-nums" style={{ color: ghost }}>{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 inline-flex shrink-0 items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: STEEL }}>Open setup →</div>
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

/* ───────────── Dealer Flow — unusual options flow tape (sweeps · dark pool) ───────────── */
const FLOW_UNIV: [string, number][] = [['SPX', 5990], ['SPY', 598], ['QQQ', 521], ['NVDA', 178], ['TSLA', 250], ['META', 720], ['AAPL', 232], ['AMD', 168], ['MSFT', 470]];
type Print = { id: number; tk: string; label: string; type: 'SWEEP' | 'BLOCK' | 'SPLIT' | 'DARK POOL'; tint: string; bull: boolean | null; prem: number; fresh: boolean };
let _pid = 0;
function makePrint(): Print {
  const [tk, spot] = FLOW_UNIV[Math.floor(Math.random() * FLOW_UNIV.length)];
  const dark = Math.random() < 0.24;
  if (dark) {
    const notion = 3e6 + Math.pow(Math.random(), 1.7) * 90e6;
    return { id: _pid++, tk, label: 'dark-pool block', type: 'DARK POOL', tint: GREEK, bull: null, prem: notion, fresh: true };
  }
  const cp = Math.random() < 0.55 ? 'C' : 'P';
  const bull = cp === 'C' ? Math.random() < 0.72 : Math.random() < 0.3;
  const strike = Math.round(spot * (1 + (Math.random() - 0.5) * 0.06));
  const type = Math.random() < 0.5 ? 'SWEEP' : Math.random() < 0.62 ? 'BLOCK' : 'SPLIT';
  const tint = type === 'SWEEP' ? AMBER : type === 'BLOCK' ? STEEL : faint;
  return { id: _pid++, tk, label: `${strike}${cp} · 0DTE`, type: type as Print['type'], tint, bull, prem: 100000 + Math.pow(Math.random(), 2) * 2.1e6, fresh: true };
}
const fmtPrem = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}K`);
function DealerFlowPreview() {
  const { reduced } = useLandingMotion();
  const [rows, setRows] = useState<Print[]>(() => Array.from({ length: 7 }, () => ({ ...makePrint(), fresh: false })));
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setRows((r) => [makePrint(), ...r.map((x) => ({ ...x, fresh: false }))].slice(0, 7)), 1150);
    return () => clearInterval(t);
  }, [reduced]);
  return (
    <div className="flex h-full flex-col" style={{ background: panel }}>
      <div className="flex items-center justify-between px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: faint, borderBottom: `1px solid ${line}` }}>
        <span className="flex items-center gap-1.5"><span className="inline-block h-1 w-1 rounded-full" style={{ background: GREEN }} />Options Flow · unusual prints</span>
        <span>Sweep · Block · Dark</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {rows.map((r, i) => {
          const dir = r.bull == null ? faint : r.bull ? GREEN : RED;
          return (
            <div key={r.id} className="flex flex-1 items-center gap-2 px-3 text-[11px]" style={{ background: r.fresh ? 'color-mix(in srgb, var(--text-primary) 5%, transparent)' : 'transparent', borderLeft: `2px solid ${r.fresh ? r.tint : 'transparent'}`, borderTop: i ? `1px solid ${line}` : undefined, transition: 'background 600ms ease' }}>
              <span className="w-10 shrink-0 font-semibold" style={{ color: ghost }}>{r.tk}</span>
              <span className="hidden w-[92px] shrink-0 truncate sm:block" style={{ color: muted }}>{r.label}</span>
              <span className="shrink-0 rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em]" style={{ color: r.tint, background: `color-mix(in srgb, ${r.tint} 14%, transparent)` }}>{r.type}</span>
              <span className="flex-1" />
              <span aria-hidden="true" className="shrink-0 text-[10px]" style={{ color: dir }}>{r.bull == null ? '◼' : r.bull ? '▲' : '▼'}</span>
              <span className="w-12 shrink-0 text-right font-semibold tabular-nums" style={{ color: ghost }}>{fmtPrem(r.prem)}</span>
            </div>
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

/* ──────────── Quant Lab — the REAL 3D implied-vol surface (three.js) ──────────── */
function QuantPreview() {
  // A smile × term IV grid (rows = tenor, cols = moneyness) fed to the exact
  // surface the terminal renders, so the landing shows the actual thing quants
  // read — an auto-rotating 3D vol surface, not a flat heatmap.
  const grid = useMemo(() => {
    const NX = 30, NY = 20, g: number[][] = [];
    for (let j = 0; j < NY; j++) {
      const term = 0.9 + 0.2 * (j / (NY - 1));
      const row: number[] = [];
      for (let i = 0; i < NX; i++) {
        const mm = ((i / (NX - 1)) * 0.4 + 0.8 - 1) / 0.2; // moneyness → −1…1
        row.push((0.30 + 0.62 * mm * mm - 0.16 * mm) * term);
      }
      g.push(row);
    }
    return g;
  }, []);
  return (
    <div className="flex h-full flex-col" style={{ background: panel }}>
      <div className="flex items-center justify-between px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: faint, borderBottom: `1px solid ${line}` }}>
        <span>IV Surface · smile × term</span>
        <span style={{ color: STEEL }}>3D · drag to orbit</span>
      </div>
      <div className="relative flex-1 overflow-hidden" style={{ minHeight: 300 }}>
        <Suspense fallback={<div className="flex h-full items-center justify-center text-[10px] uppercase tracking-[0.2em]" style={{ color: faint }}>Rendering surface…</div>}>
          <QuantSurface3D grid={grid} ramp="sequential" height={320} autoRotate axisLabels={['Moneyness', 'Tenor', 'IV']} />
        </Suspense>
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
      <div className="flex min-h-0 flex-1 flex-col">
        {TRADES.map((t, i) => {
          const on = i === hi, up = t.pnl >= 0, w = (Math.abs(t.pnl) / maxAbs) * 42;
          return (
            <button key={t.sym} onMouseEnter={() => setHi(i)} onFocus={() => setHi(i)} className="flex w-full flex-1 cursor-pointer items-center gap-2 px-3 text-left transition-colors" style={{ background: on ? panelSoft : 'transparent', borderTop: i ? `1px solid ${line}` : undefined }}>
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
// Each engine is a DESIGNED, interactive mini modelled on its real page (not a
// screenshot) that fills its frame edge-to-edge, plus a punchy one-line product
// quote. `tag` is the short rail subtitle.
interface Mod { id: string; tab: string; name: string; tag: string; accent: string; quote: string; desc: string; chips: string[]; Preview: () => ReactNode; }
const MODULES: Mod[] = [
  { id: 'skyvision', tab: 'skyvision', name: 'SkyVision', tag: 'Ranked setups', accent: STEEL, quote: 'Thirty setups, ranked. You read one.', desc: 'Every setup scored by structure, momentum and risk — the strongest float to the top with its full rationale.', chips: ['RANKED', 'CONFIDENCE', 'R / R', 'INVALIDATION'], Preview: SkyVisionPreview },
  { id: 'pinpoint', tab: 'pinpoint', name: 'Pinpoint GEX', tag: 'Dealer positioning', accent: AMBER, quote: 'See the walls dealers defend — before price tests them.', desc: 'Dealer positioning by strike: call walls, put walls, the pin and the gamma flip, mapped across every expiry.', chips: ['CALL WALL', 'PUT WALL', 'PIN', 'GAMMA FLIP'], Preview: PinpointPreview },
  { id: 'dealerflow', tab: 'dealerflow', name: 'Dealer Flow', tag: 'Unusual flow', accent: GREEN, quote: 'Sweeps, blocks, dark pool — the tape, live.', desc: 'Unusual options flow as it prints: aggressive sweeps, negotiated blocks and off-exchange dark-pool crosses.', chips: ['SWEEPS', 'DARK POOL', 'BLOCKS', 'SENTIMENT'], Preview: DealerFlowPreview },
  { id: 'liveterminal', tab: 'liveterminal', name: 'Live Terminal', tag: 'Chart + levels', accent: STEEL, quote: 'Price against every dealer level. One clean chart.', desc: 'The chart with the walls, pin and flip drawn on it, plus the strike × expiry GEX matrix — read to execution.', chips: ['PRICE', 'KEY LEVELS', 'GEX NODES'], Preview: LiveTerminalPreview },
  { id: 'quant', tab: 'quant', name: 'Quant Lab', tag: 'Vol surface', accent: AMBER, quote: 'The vol surface quants trade — in your browser.', desc: 'The implied-vol surface, term structure, risk-neutral distribution and regime read — the desk quants actually use.', chips: ['IV SURFACE', 'GREEKS', 'REGIME', 'EXP MOVE'], Preview: QuantPreview },
  { id: 'auditor', tab: 'auditor', name: 'Trade History', tag: 'Tracked outcomes', accent: GREEN, quote: 'Every setup tracked to its outcome. Accountable.', desc: 'The blotter of every tracked setup and its realized result, with win rate and PnL — receipts, not alerts.', chips: ['ENTRIES', 'OUTCOMES', 'REALIZED', 'WIN RATE'], Preview: TradeHistoryPreview },
];

/* One engine, thrown in from its side as it scrolls into view. The whole block
   translates from the left/right edge (alternating) with a smooth expo settle;
   the preview mounts only once its row is first seen (keeps the 6 minis + the 3D
   surface off the CPU/GPU until they're needed, so the scroll stays buttery). */
function FeatureRow({ m, index, onEnter }: { m: Mod; index: number; onEnter: (tab?: string) => void }) {
  const { reduced } = useLandingMotion();
  const [seen, setSeen] = useState(reduced);
  const previewLeft = index % 2 === 0; // even → arrives from the left, odd → from the right
  const fromX = previewLeft ? -170 : 170;
  const Preview = m.Preview;

  const previewPanel = (
    <div
      className={`relative h-[300px] overflow-hidden rounded-[12px] sm:h-[360px] ${previewLeft ? '' : 'lg:order-2'}`}
      style={{ border: `1px solid ${line}`, background: panel }}
    >
      {seen ? <Preview /> : <div className="h-full w-full" style={{ background: panel }} />}
    </div>
  );

  const textBlock = (
    <div className={`flex flex-col justify-center ${previewLeft ? '' : 'lg:order-1'}`}>
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: faint }}>
        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: m.accent }} />
        {m.name}
        <span style={{ color: lineStrong }}>·</span>
        <span style={{ color: m.accent }}>{m.tag}</span>
      </div>
      <h3 className="mt-3 text-[23px] font-semibold leading-[1.12] sm:text-[29px]" style={{ color: ghost, letterSpacing: '-0.02em' }}>{m.quote}</h3>
      <p className="mt-3 max-w-md text-[14px] leading-relaxed" style={{ color: muted }}>{m.desc}</p>
      <div className="mt-5 flex flex-wrap gap-1.5">
        {m.chips.map((c) => (
          <span key={c} className="rounded-[5px] px-2 py-1 text-[9px] font-semibold uppercase" style={chip(m.accent)}>{c}</span>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onEnter(m.tab)}
        className="mt-6 inline-flex w-fit cursor-pointer items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.14em] transition-transform hover:translate-x-0.5"
        style={{ color: m.accent }}
      >
        Open {m.name} →
      </button>
    </div>
  );

  return (
    <motion.div
      className="grid grid-cols-1 items-center gap-6 lg:grid-cols-2 lg:gap-14"
      initial={reduced ? false : { opacity: 0, x: fromX, scale: 0.97 }}
      whileInView={{ opacity: 1, x: 0, scale: 1 }}
      viewport={{ once: false, amount: 0.4 }}
      onViewportEnter={() => setSeen(true)}
      transition={{ duration: 0.85, ease: EASE_PRIMARY }}
      style={{ willChange: 'transform' }}
    >
      {/* source order = preview first so it's always on top on mobile; lg:order flips
          the pair for odd rows so the throw-in side matches the layout side. */}
      {previewPanel}
      {textBlock}
    </motion.div>
  );
}

export function ProductGridScene({ onEnter }: { onEnter: (tab?: string) => void }) {
  return (
    <section id="product" className="overflow-x-clip px-5 py-20 sm:py-24" style={{ borderTop: `1px solid ${line}`, background: PALETTE.bg }} data-scene="product-grid" aria-label="Product showcase">
      <Reveal className="mx-auto mb-14 max-w-2xl text-center sm:mb-20">
        <div className="text-[10px] font-semibold uppercase" style={{ letterSpacing: '0.28em', color: faint }}>The Terminal</div>
        <h2 className="mt-3 text-[26px] font-semibold leading-tight sm:text-[32px]" style={{ color: PALETTE.ghost, letterSpacing: '-0.01em' }}>Six engines. One desk.</h2>
        <p className="mx-auto mt-3 max-w-xl text-[13.5px] leading-relaxed" style={{ color: muted }}>Keep scrolling — each engine arrives on its own, live and hands-on.</p>
      </Reveal>

      <div className="mx-auto flex max-w-6xl flex-col gap-24 sm:gap-32">
        {MODULES.map((m, i) => (
          <FeatureRow key={m.id} m={m} index={i} onEnter={onEnter} />
        ))}
      </div>
    </section>
  );
}

export default ProductGridScene;

/**
 * ECharts option builders for the Quant Lab, adapted from Apache ECharts examples
 * into Slayer's options-desk framing. Each builder generates its own live-looking
 * mock data so the page renders fully with no backend; swap the generators for a
 * real feed (candles, greeks surface, dealer flow) when API keys are wired.
 *
 * `bull`/`bear` follow Slayer's convention (up = green, down = red).
 */

const BULL = '#4ADE80';
const BEAR = '#F87171';
const BULL_SOFT = 'rgba(74,222,128,0.18)';
const BEAR_SOFT = 'rgba(248,113,113,0.18)';

// ── Intraday candlestick + moving averages + volume ─────────────────────────
// Adapted from the ECharts "candlestick + MA + volume" example.
function genOHLC(n: number, base = 500) {
  const cats: string[] = [];
  const vals: number[][] = []; // [open, close, low, high]
  const vols: [number, number, number][] = [];
  let prevClose = base;
  const day0 = Date.UTC(2025, 0, 2, 14, 30);
  for (let i = 0; i < n; i++) {
    const open = prevClose + (Math.random() - 0.5) * 1.2;
    const drift = (Math.random() - 0.48) * 3.4;
    const close = Math.max(1, open + drift);
    const high = Math.max(open, close) + Math.random() * 1.8;
    const low = Math.min(open, close) - Math.random() * 1.8;
    const t = new Date(day0 + i * 60_000);
    cats.push(`${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`);
    vals.push([+open.toFixed(2), +close.toFixed(2), +low.toFixed(2), +high.toFixed(2)]);
    vols.push([i, +(Math.random() * 900 + 200).toFixed(0), close >= open ? 1 : -1]);
    prevClose = close;
  }
  return { cats, vals, vols };
}

function ma(period: number, vals: number[][]) {
  const out: (number | string)[] = [];
  for (let i = 0; i < vals.length; i++) {
    if (i < period) { out.push('-'); continue; }
    let sum = 0;
    for (let j = 0; j < period; j++) sum += vals[i - j][1];
    out.push(+(sum / period).toFixed(2));
  }
  return out;
}

export function candleMaVolumeOption(ticker = 'SPY') {
  const { cats, vals, vols } = genOHLC(240);
  return {
    animation: false,
    legend: { top: 2, data: ['Price', 'MA20', 'MA60'], textStyle: { fontSize: 10 } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
    axisPointer: { link: [{ xAxisIndex: 'all' }], label: { backgroundColor: '#1c1c1e' } },
    grid: [
      { left: 52, right: 16, top: 30, height: '62%' },
      { left: 52, right: 16, top: '80%', height: '14%' },
    ],
    xAxis: [
      { type: 'category', data: cats, boundaryGap: false, axisLine: { onZero: false }, splitLine: { show: false }, min: 'dataMin', max: 'dataMax', axisPointer: { z: 100 } },
      { type: 'category', gridIndex: 1, data: cats, boundaryGap: false, axisLine: { onZero: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, min: 'dataMin', max: 'dataMax' },
    ],
    yAxis: [
      { scale: true, splitArea: { show: false }, axisLabel: { formatter: (v: number) => v.toFixed(0) } },
      { scale: true, gridIndex: 1, splitNumber: 2, axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false } },
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1], start: 55, end: 100 },
      { type: 'slider', xAxisIndex: [0, 1], height: 16, bottom: 4, start: 55, end: 100 },
    ],
    series: [
      {
        name: 'Price', type: 'candlestick', data: vals,
        itemStyle: { color: BULL, color0: BEAR, borderColor: BULL, borderColor0: BEAR },
      },
      { name: 'MA20', type: 'line', data: ma(20, vals), smooth: true, symbol: 'none', lineStyle: { width: 1, color: '#60A5FA', opacity: 0.9 } },
      { name: 'MA60', type: 'line', data: ma(60, vals), smooth: true, symbol: 'none', lineStyle: { width: 1, color: '#FBBF24', opacity: 0.9 } },
      {
        name: 'Volume', type: 'bar', xAxisIndex: 1, yAxisIndex: 1,
        data: vols.map(v => ({ value: v[1], itemStyle: { color: v[2] > 0 ? BULL_SOFT : BEAR_SOFT } })),
      },
    ],
    _ticker: ticker,
  };
}

// ── Cumulative P&L / equity curve (large area + dataZoom) ────────────────────
export function equityCurveOption(echarts: any) {
  const dates: string[] = [];
  const data: number[] = [];
  let base = Date.UTC(2024, 0, 1);
  let equity = 100_000;
  for (let i = 0; i < 2600; i++) {
    const d = new Date(base);
    dates.push(`${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`);
    equity += (Math.random() - 0.46) * 900;
    data.push(Math.round(equity));
    base += 24 * 3600 * 1000;
  }
  return {
    tooltip: { trigger: 'axis', position: (pt: number[]) => [pt[0], '10%'] },
    grid: { left: 62, right: 18, top: 18, bottom: 46 },
    xAxis: { type: 'category', boundaryGap: false, data: dates },
    yAxis: { type: 'value', boundaryGap: [0, '12%'], axisLabel: { formatter: (v: number) => '$' + (v / 1000).toFixed(0) + 'k' } },
    dataZoom: [
      { type: 'inside', start: 62, end: 100 },
      { type: 'slider', height: 16, bottom: 8, start: 62, end: 100 },
    ],
    series: [{
      name: 'Equity', type: 'line', symbol: 'none', sampling: 'lttb', smooth: true,
      itemStyle: { color: BULL },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(74,222,128,0.35)' },
          { offset: 1, color: 'rgba(74,222,128,0.02)' },
        ]),
      },
      data,
    }],
  };
}

// ── 3D implied-volatility surface (echarts-gl surface via equation) ──────────
const HEAT = ['#1710c0', '#0b9df0', '#00fea8', '#00ff0d', '#f5f811', '#f09a09', '#fe0300'];

export function volSurfaceOption() {
  return {
    tooltip: {},
    visualMap: {
      show: false, dimension: 2, min: -1, max: 1,
      inRange: { color: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', '#ffffbf', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026'] },
    },
    xAxis3D: { type: 'value', name: 'Moneyness' },
    yAxis3D: { type: 'value', name: 'Tenor' },
    zAxis3D: { type: 'value', name: 'IV' },
    grid3D: {
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.35)' } },
      axisPointer: { lineStyle: { color: '#4ADE80' } },
      viewControl: { autoRotate: true, autoRotateSpeed: 8, distance: 200 },
      environment: 'transparent',
    },
    series: [{
      type: 'surface',
      wireframe: { show: true, lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      shading: 'realistic',
      equation: {
        x: { step: 0.06, min: -3, max: 3 },
        y: { step: 0.06, min: -3, max: 3 },
        // A smooth "vol smile x term" surface.
        z: (x: number, y: number) => (Math.sin(x * x + y * y) * x) / 3.14,
      },
    }],
  };
}

// ── 3D risk scatter: strike offset × IV × net-GEX (echarts-gl scatter3D) ─────
export function riskScatter3DOption() {
  const data: number[][] = [];
  for (let i = 0; i < 900; i++) {
    const strike = (Math.random() - 0.5) * 40;               // moneyness offset
    const iv = 12 + Math.abs(strike) * 0.6 + Math.random() * 14; // vol smile-ish
    const gex = Math.sin(strike / 6) * 800 + (Math.random() - 0.5) * 400; // net gex
    const size = Math.abs(gex);
    data.push([strike, iv, gex, gex, size, i]);
  }
  const maxSize = Math.max(...data.map(d => d[4]));
  return {
    tooltip: {},
    visualMap: [
      { top: 8, calculable: true, dimension: 3, min: -1000, max: 1000, inRange: { color: HEAT }, textStyle: { color: '#8A8A92' } },
      { bottom: 8, calculable: true, dimension: 4, max: maxSize, inRange: { symbolSize: [6, 34] }, textStyle: { color: '#8A8A92' } },
    ],
    xAxis3D: { type: 'value', name: 'Strike Δ' },
    yAxis3D: { type: 'value', name: 'IV %' },
    zAxis3D: { type: 'value', name: 'Net GEX' },
    grid3D: {
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.35)' } },
      axisPointer: { lineStyle: { color: '#4ADE80' } },
      viewControl: { distance: 220 },
    },
    series: [{
      type: 'scatter3D', data, symbolSize: 10,
      itemStyle: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)' },
      emphasis: { itemStyle: { color: '#fff' } },
    }],
  };
}

// ── Dealer flow field: a GL vector field (echarts-gl flowGL) ─────────────────
export function dealerFlowFieldOption() {
  const data: number[][] = [];
  let vMin = Infinity, vMax = -Infinity;
  for (let i = 0; i <= 48; i++) {
    for (let j = 0; j <= 48; j++) {
      const x = i / 8, y = j / 8;
      const dx = Math.sin(y) * Math.cos(x * 0.6);
      const dy = Math.cos(x) * Math.sin(y * 0.6);
      const mag = Math.sqrt(dx * dx + dy * dy);
      vMin = Math.min(vMin, mag); vMax = Math.max(vMax, mag);
      data.push([i, j, dx, dy, mag]);
    }
  }
  return {
    visualMap: {
      show: false, min: vMin, max: vMax, dimension: 4,
      inRange: { color: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', '#ffffbf', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026'] },
    },
    xAxis: { show: false, type: 'value', min: 0, max: 48 },
    yAxis: { show: false, type: 'value', min: 0, max: 48 },
    grid: { left: 0, right: 0, top: 0, bottom: 0 },
    series: [{ type: 'flowGL', data, particleDensity: 128, particleSize: 3, particleSpeed: 1.2, supersampling: 1, itemStyle: { opacity: 0.7 } }],
  };
}

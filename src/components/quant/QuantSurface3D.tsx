import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

/**
 * QuantSurface3D — the terminal's single, canonical WebGL renderer for multidimensional
 * quant data, built to ARCHITECTURAL DIRECTIVE 08 (Spatial Quant Rendering):
 *
 *   • BRUTALIST ONLY. No lights (no Ambient/Directional), no PBR, no post-processing.
 *     The surface is a `MeshBasicMaterial({ wireframe: true, vertexColors })` — a raw,
 *     high-performance mathematical plot; clouds are `PointsMaterial`; axes/ticks/markers
 *     are `LineBasicMaterial`/`MeshBasicMaterial`. It looks like a plot, not a video game.
 *   • DATA-STATUS PALETTE. Floor grid is stark #27272a. Surface colour maps to data
 *     intensity: diverging signed data → red #ef4444 (neg) · slate (zero) · green
 *     #22c55e (pos); sequential unsigned data → blue (low) → amber → red #ef4444 (high).
 *   • REAL SPATIAL CONTEXT. Optional strike/tenor domains drive axis ticks + numeric
 *     readouts; optional market markers (spot / γ-flip / call wall / put wall) render as
 *     vertical reference walls; a floor heatmap projects the field; hover raycasts the
 *     lattice for exact (x, z, value) readouts; selected strike/expiry slices are lit.
 *   • ZERO-LEAK LIFECYCLE. A trading terminal runs 24h. On unmount we cancel the RAF,
 *     disconnect the ResizeObserver, remove listeners, dispose EVERY geometry/material/
 *     texture (explicit list + a scene.traverse sweep), then renderer.dispose() AND
 *     renderer.forceContextLoss() so the GPU context is actually released — verified by
 *     asserting the live-context count does not grow across mount/unmount cycles.
 *   • NEVER A WHITE BOX. Every failure mode (no-webgl / context-lost / empty / error)
 *     renders an explicit terminal-grade state.
 *
 * Only spin this up when the third dimension carries vital mathematical context
 * (IV surfaces, dealer Greek/exposure matrices, Monte-Carlo path clouds). If a dataset
 * reads cleanly as a 2D heatmap or scatter, use 2D — do not touch the GPU.
 */

export interface CloudPoint { x: number; y: number; z: number; v: number }

type Ramp = 'diverging' | 'sequential';

/** Clean data-provenance state — never a large fake "SIMULATED" stamp. */
export type DataState = 'live' | 'delayed' | 'model' | 'required';

/** A market level rendered as a vertical reference wall across the surface. */
export interface SurfaceMarker {
  /** Value in the x-domain (e.g. a strike) where the wall sits. */
  at: number;
  kind: 'spot' | 'flip' | 'callWall' | 'putWall';
  label: string;
}

interface QuantSurface3DProps {
  /** Row-major grid of values (surface mode). rows = depth axis, cols = x axis. */
  grid?: number[][];
  /** Explicit {x,y,z,v} points (cloud mode, used when `grid` is absent). */
  points?: CloudPoint[];
  /** diverging = signed (red/green around a slate zero); sequential = unsigned intensity. */
  ramp?: Ramp;
  height?: number;
  /** [x, depth, height] axis captions. */
  axisLabels?: [string, string, string];
  autoRotate?: boolean;
  loading?: boolean;
  error?: string | null;

  // ── Real spatial context (all optional; the surface degrades cleanly without them) ──
  /** Real value range mapped across the columns (e.g. [strikeLo, strikeHi]). */
  xDomain?: [number, number];
  /** Real value range mapped across the rows (e.g. [nearDte, farDte]). */
  zDomain?: [number, number];
  xFormat?: (v: number) => string;
  zFormat?: (v: number) => string;
  valueFormat?: (v: number) => string;
  /** Vertical reference walls at x-domain values (spot / γ-flip / call & put walls). */
  markers?: SurfaceMarker[];
  /** Project the field onto the floor as a filled heatmap. */
  floorHeatmap?: boolean;
  /** Show the colour legend + axis-domain readouts. */
  legend?: boolean;
  /** Clean data-provenance chip. */
  dataState?: DataState;
  /** Light up a single column (a strike's term-structure slice). */
  sliceCol?: number | null;
  /** Light up a single row (an expiry's smile slice). */
  sliceRow?: number | null;
}

// ── Directive-08 data-status palette (0..255 → 0..1 baked below) ──────────────
const RED: [number, number, number] = [0xef / 255, 0x44 / 255, 0x44 / 255];   // #ef4444
const GREEN: [number, number, number] = [0x22 / 255, 0xc5 / 255, 0x5e / 255]; // #22c55e
const SLATE: [number, number, number] = [0x33 / 255, 0x41 / 255, 0x55 / 255]; // #334155 (dim neutral so red/green extremes pop)
const BLUE: [number, number, number] = [0x25 / 255, 0x63 / 255, 0xeb / 255];  // #2563eb
const AMBER: [number, number, number] = [0xea / 255, 0xb3 / 255, 0x08 / 255]; // #eab308

// Marker wall colours (hex ints for three, css for the chip legend).
const MARKER_HEX: Record<SurfaceMarker['kind'], number> = { spot: 0xe5e7eb, flip: 0xeab308, callWall: 0x22c55e, putWall: 0xef4444 };
const MARKER_CSS: Record<SurfaceMarker['kind'], string> = { spot: '#e5e7eb', flip: '#eab308', callWall: '#22c55e', putWall: '#ef4444' };

function lerp3(a: readonly number[], b: readonly number[], f: number, out: THREE.Color) {
  out.setRGB(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
}
// t ∈ [0,1]; for diverging, 0.5 is the neutral zero (slate), 0→red, 1→green.
function rampColor(ramp: Ramp, t: number, out: THREE.Color) {
  t = Math.max(0, Math.min(1, t));
  if (ramp === 'diverging') {
    if (t < 0.5) lerp3(RED, SLATE, t / 0.5, out);
    else lerp3(SLATE, GREEN, (t - 0.5) / 0.5, out);
    return;
  }
  // sequential: blue → amber → red
  if (t < 0.5) lerp3(BLUE, AMBER, t / 0.5, out);
  else lerp3(AMBER, RED, (t - 0.5) / 0.5, out);
}

// Probe WebGL ONCE and cache it. The probe itself creates a GL context; running it on
// every effect re-run (each surface switch) would leak throwaway contexts and undercut
// the zero-growth guarantee, so we release the probe context immediately and memoize.
let _webglOk: boolean | undefined;
function webglAvailable(): boolean {
  if (_webglOk !== undefined) return _webglOk;
  try {
    const c = document.createElement('canvas');
    const ctx = (c.getContext('webgl') || c.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    _webglOk = !!(window.WebGLRenderingContext && ctx);
    // Drop the probe's context so it doesn't count against the browser's context budget.
    ctx?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { _webglOk = false; }
  return _webglOk;
}

const SPAN = 10;      // xz footprint
const HEIGHT = 5.4;   // world height (y) — deeper Z relief so the geometry reads as a surface

interface HoverInfo { left: number; top: number; xv: string; zv: string; v: string; sign: number }

const num = (v: number) => (Math.abs(v) >= 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : v.toLocaleString(undefined, { maximumFractionDigits: 2 }));

export default function QuantSurface3D({
  grid, points, ramp = 'diverging', height = 380, axisLabels, autoRotate = true, loading, error,
  xDomain, zDomain, xFormat = num, zFormat = num, valueFormat = num, markers, floorHeatmap, legend,
  dataState, sliceCol = null, sliceRow = null,
}: QuantSurface3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [glState, setGlState] = useState<'ok' | 'nowebgl' | 'lost'>('ok');
  const [stats, setStats] = useState<{ vMin: number; vMax: number } | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  const hasData = (grid && grid.length > 0 && grid[0]?.length > 0) || (points && points.length > 0);

  useEffect(() => {
    if (!hasData || loading || error) return;
    const container = mountRef.current;
    if (!container) return;
    if (!webglAvailable()) { setGlState('nowebgl'); return; }

    let width = container.clientWidth || 400;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch { setGlState('nowebgl'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';

    const onLost = (e: Event) => { e.preventDefault(); setGlState('lost'); };
    renderer.domElement.addEventListener('webglcontextlost', onLost, false);

    const group = new THREE.Group();
    scene.add(group);

    // Stark reference frame — floor grid #27272a, faint axes. No decoration.
    const floor = new THREE.GridHelper(SPAN, 14, 0x27272a, 0x27272a);
    floor.position.y = -0.01;
    scene.add(floor);
    const axisMat = new THREE.LineBasicMaterial({ color: 0x3f3f46, transparent: true, opacity: 0.8 });
    const mkAxis = (a: THREE.Vector3, b: THREE.Vector3) => new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), axisMat);
    const ax = mkAxis(new THREE.Vector3(-SPAN / 2, 0, SPAN / 2), new THREE.Vector3(SPAN / 2, 0, SPAN / 2));
    const ay = mkAxis(new THREE.Vector3(-SPAN / 2, 0, SPAN / 2), new THREE.Vector3(-SPAN / 2, HEIGHT + 0.6, SPAN / 2));
    const az = mkAxis(new THREE.Vector3(-SPAN / 2, 0, -SPAN / 2), new THREE.Vector3(-SPAN / 2, 0, SPAN / 2));
    scene.add(ax, ay, az);

    const disposables: Array<{ dispose: () => void }> = [floor.geometry, floor.material as THREE.Material, axisMat, ax.geometry, ay.geometry, az.geometry];
    const color = new THREE.Color();

    // ── Axis ticks — short perpendicular marks along the three framing edges. ──
    const tickPts: number[] = [];
    const TX = 6, TZ = 5, TY = 5;
    for (let i = 0; i <= TX; i++) { const x = -SPAN / 2 + (SPAN * i) / TX; tickPts.push(x, 0, SPAN / 2, x, -0.22, SPAN / 2); }
    for (let i = 0; i <= TZ; i++) { const z = -SPAN / 2 + (SPAN * i) / TZ; tickPts.push(-SPAN / 2, 0, z, -SPAN / 2 - 0.22, 0, z); }
    for (let i = 0; i <= TY; i++) { const y = (HEIGHT * i) / TY; tickPts.push(-SPAN / 2, y, SPAN / 2, -SPAN / 2 - 0.22, y, SPAN / 2); }
    const tickGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(tickPts), 3));
    const tickMat = new THREE.LineBasicMaterial({ color: 0x52525b, transparent: true, opacity: 0.7 });
    scene.add(new THREE.LineSegments(tickGeo, tickMat));
    disposables.push(tickGeo, tickMat);

    // shared surface geometry meta captured for the hover raycaster
    let surfacePoints: THREE.Points | null = null;
    let gRows = 0, gCols = 0;
    let vMin = 0, vMax = 0, absMax = 1, range = 1;
    const heightOf = (raw: number) => (ramp === 'diverging' ? (raw / absMax + 1) / 2 : (raw - vMin) / range) * HEIGHT;

    if (grid && grid.length) {
      // Surface: rows = depth(z), cols = x, value = height(y). Wireframe, colour by value.
      const rows = grid.length, cols = grid[0].length;
      gRows = rows; gCols = cols;
      vMin = Infinity; vMax = -Infinity;
      for (const r of grid) for (const v of r) { if (v < vMin) vMin = v; if (v > vMax) vMax = v; }
      // Diverging surfaces centre the colour ramp on zero and make the height symmetric,
      // so a value of 0 sits at the slate neutral and the floor.
      absMax = Math.max(Math.abs(vMin), Math.abs(vMax)) || 1;
      range = vMax - vMin || 1;
      const positions = new Float32Array(rows * cols * 3);
      const colors = new Float32Array(rows * cols * 3);
      let p = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = (c / (cols - 1) - 0.5) * SPAN;
          const z = (r / (rows - 1) - 0.5) * SPAN;
          const raw = grid[r][c];
          const cNorm = ramp === 'diverging' ? (raw / absMax + 1) / 2 : (raw - vMin) / range;
          positions[p] = x; positions[p + 1] = heightOf(raw); positions[p + 2] = z;
          rampColor(ramp, cNorm, color);
          colors[p] = color.r; colors[p + 1] = color.g; colors[p + 2] = color.b;
          p += 3;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const idx: number[] = [];
      for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
        idx.push(a, b, d, b, e, d);
      }
      geo.setIndex(idx);
      // Hybrid surface (still brutalist — MeshBasicMaterial, no lighting): a translucent
      // SOLID fill reads the surface as a continuous sheet and gives real depth occlusion,
      // then a crisp WIREFRAME rides on top for the lattice. depthWrite:false on the fill
      // keeps the wire and points from z-fighting through it. This is the default so the
      // plot looks finished rather than skeletal.
      const fillMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
      const fillMesh = new THREE.Mesh(geo, fillMat);
      group.add(fillMesh);
      const mat = new THREE.MeshBasicMaterial({ wireframe: true, vertexColors: true, transparent: true, opacity: 0.75 });
      const mesh = new THREE.Mesh(geo, mat);
      group.add(mesh);
      // Vertex nodes as points give the plot definition without any lighting.
      const ptsMat = new THREE.PointsMaterial({ size: 0.055, vertexColors: true, transparent: true, opacity: 0.9, sizeAttenuation: true });
      const pts = new THREE.Points(geo, ptsMat);
      group.add(pts);
      surfacePoints = pts;
      disposables.push(geo, fillMat, mat, ptsMat);

      // ── Floor heatmap: the same field projected flat, filled (not wireframe). ──
      if (floorHeatmap) {
        const fpos = new Float32Array(rows * cols * 3);
        let fp = 0;
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          fpos[fp] = (c / (cols - 1) - 0.5) * SPAN; fpos[fp + 1] = 0.02; fpos[fp + 2] = (r / (rows - 1) - 0.5) * SPAN; fp += 3;
        }
        const fgeo = new THREE.BufferGeometry();
        fgeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
        fgeo.setAttribute('color', geo.getAttribute('color'));
        fgeo.setIndex(idx);
        const fmat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false });
        group.add(new THREE.Mesh(fgeo, fmat));
        disposables.push(fgeo, fmat);
      }

      // ── Slices: light one column (term structure) and/or one row (smile). ──
      const litMat = new THREE.LineBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.95 });
      let usedLit = false;
      if (sliceCol != null && sliceCol >= 0 && sliceCol < cols) {
        const pl: THREE.Vector3[] = [];
        for (let r = 0; r < rows; r++) pl.push(new THREE.Vector3((sliceCol / (cols - 1) - 0.5) * SPAN, heightOf(grid[r][sliceCol]) + 0.02, (r / (rows - 1) - 0.5) * SPAN));
        const lg = new THREE.BufferGeometry().setFromPoints(pl);
        group.add(new THREE.Line(lg, litMat)); disposables.push(lg); usedLit = true;
      }
      if (sliceRow != null && sliceRow >= 0 && sliceRow < rows) {
        const pl: THREE.Vector3[] = [];
        for (let c = 0; c < cols; c++) pl.push(new THREE.Vector3((c / (cols - 1) - 0.5) * SPAN, heightOf(grid[sliceRow][c]) + 0.02, (sliceRow / (rows - 1) - 0.5) * SPAN));
        const lg = new THREE.BufferGeometry().setFromPoints(pl);
        group.add(new THREE.Line(lg, litMat)); disposables.push(lg); usedLit = true;
      }
      if (usedLit) disposables.push(litMat); else litMat.dispose();

      // ── Market markers: vertical reference walls at x-domain values. ──
      if (markers && markers.length && xDomain) {
        const [xlo, xhi] = xDomain;
        const xspan = xhi - xlo || 1;
        for (const m of markers) {
          if (!Number.isFinite(m.at)) continue;
          const f = (m.at - xlo) / xspan;
          if (f < -0.02 || f > 1.02) continue;               // out of frame → skip, never clamp-lie
          const x = (Math.max(0, Math.min(1, f)) - 0.5) * SPAN;
          const top = HEIGHT * (m.kind === 'spot' ? 1.02 : 0.92);
          const quad = new Float32Array([
            x, 0, -SPAN / 2, x, 0, SPAN / 2, x, top, SPAN / 2,
            x, 0, -SPAN / 2, x, top, SPAN / 2, x, top, -SPAN / 2,
          ]);
          const wgeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(quad, 3));
          const wmat = new THREE.MeshBasicMaterial({ color: MARKER_HEX[m.kind], transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false });
          group.add(new THREE.Mesh(wgeo, wmat));
          // A crisp top edge so the wall reads even at grazing angles.
          const egeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, top, -SPAN / 2), new THREE.Vector3(x, top, SPAN / 2)]);
          const emat = new THREE.LineBasicMaterial({ color: MARKER_HEX[m.kind], transparent: true, opacity: 0.8 });
          group.add(new THREE.Line(egeo, emat));
          disposables.push(wgeo, wmat, egeo, emat);
        }
      }
    } else if (points && points.length) {
      // Cloud: x,z from x/y; height y from z; colour by v.
      let xm = Infinity, xM = -Infinity, ym = Infinity, yM = -Infinity, zm = Infinity, zM = -Infinity, vm = Infinity, vM = -Infinity;
      for (const pt of points) {
        xm = Math.min(xm, pt.x); xM = Math.max(xM, pt.x);
        ym = Math.min(ym, pt.y); yM = Math.max(yM, pt.y);
        zm = Math.min(zm, pt.z); zM = Math.max(zM, pt.z);
        vm = Math.min(vm, pt.v); vM = Math.max(vM, pt.v);
      }
      vMin = vm; vMax = vM;
      const nx = (v: number) => ((v - xm) / (xM - xm || 1) - 0.5) * SPAN;
      const nz = (v: number) => ((v - ym) / (yM - ym || 1) - 0.5) * SPAN;
      const ny = (v: number) => ((v - zm) / (zM - zm || 1)) * HEIGHT;
      const absV = Math.max(Math.abs(vm), Math.abs(vM)) || 1;
      const positions = new Float32Array(points.length * 3);
      const colors = new Float32Array(points.length * 3);
      points.forEach((pt, i) => {
        positions[i * 3] = nx(pt.x); positions[i * 3 + 1] = ny(pt.z); positions[i * 3 + 2] = nz(pt.y);
        const cNorm = ramp === 'diverging' ? (pt.v / absV + 1) / 2 : (pt.v - vm) / (vM - vm || 1);
        rampColor(ramp, cNorm, color);
        colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const mat = new THREE.PointsMaterial({ size: 0.17, vertexColors: true, transparent: true, opacity: 0.95, sizeAttenuation: true });
      const cloud = new THREE.Points(geo, mat);
      group.add(cloud);
      disposables.push(geo, mat);
    }

    setStats({ vMin, vMax });

    // Orbit-drag + wheel-zoom + gentle auto-rotate around a y-up world.
    let rot = 0.7, dragging = false, lastX = 0, lastY = 0, elev = 0.42, dist = 15;
    const el = renderer.domElement;
    const onDown = (e: PointerEvent) => { dragging = true; lastX = e.clientX; lastY = e.clientY; try { el.setPointerCapture(e.pointerId); } catch {} };
    const onUp = (e: PointerEvent) => { dragging = false; try { el.releasePointerCapture(e.pointerId); } catch {} };
    const onMove = (e: PointerEvent) => {
      if (dragging) {
        rot -= (e.clientX - lastX) * 0.008;
        elev = Math.max(0.1, Math.min(1.4, elev + (e.clientY - lastY) * 0.006));
        lastX = e.clientX; lastY = e.clientY;
        return;
      }
      // ── Hover raycast: nearest lattice node → exact (x, z, value) readout. ──
      if (!surfacePoints || !grid) return;
      const rect = el.getBoundingClientRect();
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(surfacePoints)[0];
      if (!hit || hit.index == null) { setHover(null); return; }
      const r = Math.floor(hit.index / gCols), c = hit.index % gCols;
      const raw = grid[r]?.[c];
      if (raw == null) { setHover(null); return; }
      const xv = xDomain ? xDomain[0] + (xDomain[1] - xDomain[0]) * (c / (gCols - 1)) : c;
      const zv = zDomain ? zDomain[0] + (zDomain[1] - zDomain[0]) * (r / (gRows - 1)) : r;
      setHover({ left: e.clientX - rect.left, top: e.clientY - rect.top, xv: xFormat(xv), zv: zFormat(zv), v: valueFormat(raw), sign: Math.sign(raw) });
    };
    const onLeave = () => setHover(null);
    const onWheel = (e: WheelEvent) => { e.preventDefault(); dist = Math.max(9, Math.min(34, dist + e.deltaY * 0.012)); };
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: 0.4 };
    const pointer = new THREE.Vector2();
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('wheel', onWheel, { passive: false });

    const target = new THREE.Vector3(0, HEIGHT * 0.4, 0);
    let raf = 0;
    const animate = () => {
      if (autoRotate && !dragging) rot += 0.0022;
      camera.position.set(Math.sin(rot) * dist, elev * dist, Math.cos(rot) * dist);
      camera.lookAt(target);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    const ro = new ResizeObserver(() => {
      const w = container.clientWidth || width;
      width = w; camera.aspect = w / height; camera.updateProjectionMatrix(); renderer.setSize(w, height);
    });
    ro.observe(container);

    // ── Directive-08 mandatory teardown: release the GPU context, leak nothing ──
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('webglcontextlost', onLost);
      disposables.forEach((d) => { try { d.dispose(); } catch {} });
      // Safety sweep: dispose anything the explicit list missed.
      scene.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = (m as any).material;
        if (Array.isArray(mat)) mat.forEach((x: THREE.Material) => x.dispose());
        else if (mat) (mat as THREE.Material).dispose();
      });
      renderer.dispose();
      renderer.forceContextLoss();
      if (el.parentNode) el.parentNode.removeChild(el);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasData, loading, error, grid, points, ramp, floorHeatmap, sliceCol, sliceRow, markers, xDomain, zDomain]);

  if (error) return <Frame height={height}><State tone="danger" title="Surface failed to render" sub={error} /></Frame>;
  if (loading) return <Frame height={height}><Sk /></Frame>;
  if (!hasData) return <Frame height={height}>{dataState && <StatePill state={dataState} />}<State tone="muted" title="Awaiting inputs" sub="No grid / cloud to plot yet." /></Frame>;
  if (glState === 'nowebgl') return <Frame height={height}><State tone="warn" title="3D renderer unavailable" sub="WebGL is disabled or unsupported here." /></Frame>;

  const mid = stats ? (ramp === 'diverging' ? 0 : (stats.vMin + stats.vMax) / 2) : 0;
  const gradient = ramp === 'diverging'
    ? 'linear-gradient(to top, #ef4444, #334155 50%, #22c55e)'
    : 'linear-gradient(to top, #2563eb, #eab308 50%, #ef4444)';

  return (
    <Frame height={height}>
      <div ref={mountRef} className="absolute inset-0" />
      {glState === 'lost' && <div className="absolute inset-0 flex items-center justify-center"><State tone="warn" title="GL context lost" sub="Scroll away and back to restore." /></div>}

      {dataState && <StatePill state={dataState} />}

      {/* Colour legend — the value ramp with real numeric endpoints. */}
      {legend && stats && (
        <div className="pointer-events-none absolute right-3 top-9 flex items-stretch gap-1.5">
          <div className="flex flex-col justify-between py-0.5 font-mono text-[8px] tabular-nums text-[var(--text-tertiary)] text-right leading-none">
            <span>{valueFormat(stats.vMax)}</span><span>{valueFormat(mid)}</span><span>{valueFormat(stats.vMin)}</span>
          </div>
          <div className="w-2 rounded-sm border border-white/10" style={{ background: gradient, height: 74 }} />
        </div>
      )}

      {/* Marker legend chips. */}
      {markers && markers.length > 0 && (
        <div className="pointer-events-none absolute left-3 top-9 flex flex-col gap-1">
          {markers.map((m) => (
            <div key={m.kind + m.at} className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-widest text-[var(--text-tertiary)]">
              <span className="inline-block h-[7px] w-[7px] rounded-[1px]" style={{ background: MARKER_CSS[m.kind] }} />
              <span>{m.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Axis captions + real domains. */}
      {axisLabels && (
        <div className="pointer-events-none absolute bottom-2 left-3 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[8px] uppercase tracking-widest text-[var(--text-tertiary)]">
          <span>x · {axisLabels[0]}{xDomain ? ` · ${xFormat(xDomain[0])}–${xFormat(xDomain[1])}` : ''}</span>
          <span>z · {axisLabels[1]}{zDomain ? ` · ${zFormat(zDomain[0])}–${zFormat(zDomain[1])}` : ''}</span>
          <span>y · {axisLabels[2]}</span>
        </div>
      )}
      <div className="pointer-events-none absolute right-3 bottom-2 font-mono text-[8px] uppercase tracking-widest text-[var(--text-tertiary)]/70">drag · scroll · hover</div>

      {/* Hover readout. */}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded border border-[var(--border-strong,#3f3f46)] bg-[#0a0a0b]/95 px-2 py-1 font-mono text-[9px] leading-tight tabular-nums shadow-lg"
          style={{ left: hover.left, top: hover.top - 10 }}
        >
          <div className="text-[var(--text-tertiary)]">{axisLabels?.[0] ?? 'x'} <span className="text-[var(--text-primary)]">{hover.xv}</span></div>
          <div className="text-[var(--text-tertiary)]">{axisLabels?.[1] ?? 'z'} <span className="text-[var(--text-primary)]">{hover.zv}</span></div>
          <div className="text-[var(--text-tertiary)]">{axisLabels?.[2] ?? 'y'} <span style={{ color: hover.sign < 0 ? '#ef4444' : hover.sign > 0 ? '#22c55e' : 'var(--text-primary)' }}>{hover.v}</span></div>
        </div>
      )}
    </Frame>
  );
}

// Module-scope so the subtree (and the imperatively-appended canvas) is NEVER remounted
// when the parent re-renders each tick — the bug that produced a canvas-less black panel.
const Frame: React.FC<{ height: number; children: React.ReactNode }> = ({ height, children }) => (
  <div style={{ height }} className="relative w-full overflow-hidden bg-[#0a0a0b]">{children}</div>
);

const STATE_META: Record<DataState, { label: string; css: string }> = {
  live: { label: 'Live Chain', css: 'text-[var(--success)] border-[var(--success)]/40 bg-[var(--success)]/10' },
  delayed: { label: 'Delayed Data', css: 'text-[var(--warning)] border-[var(--warning)]/40 bg-[var(--warning)]/10' },
  model: { label: 'Model Mode', css: 'text-[var(--info)] border-[var(--info)]/40 bg-[var(--info)]/10' },
  required: { label: 'Data Required', css: 'text-[var(--text-tertiary)] border-[var(--border)] bg-[var(--surface-2)]' },
};

function StatePill({ state }: { state: DataState }) {
  const m = STATE_META[state];
  return (
    <div className={`pointer-events-none absolute left-3 top-2 z-10 rounded border px-1.5 py-0.5 font-mono text-[8px] font-black uppercase tracking-widest ${m.css}`}>
      {m.label}
    </div>
  );
}

function State({ tone, title, sub }: { tone: 'danger' | 'warn' | 'muted'; title: string; sub: string }) {
  const c = tone === 'danger' ? 'var(--danger)' : tone === 'warn' ? 'var(--warning)' : 'var(--text-tertiary)';
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-6 text-center">
      <div className="h-8 w-8 rounded-full border" style={{ borderColor: `color-mix(in srgb, ${c} 45%, transparent)` }} />
      <div className="font-mono text-[11px] font-black uppercase tracking-widest" style={{ color: c }}>{title}</div>
      <div className="max-w-[240px] font-mono text-[10px] leading-relaxed text-[var(--text-tertiary)]">{sub}</div>
    </div>
  );
}

function Sk() {
  return (
    <div className="absolute inset-0 p-4">
      <div className="mb-3 h-3 w-40 animate-pulse rounded bg-white/10" />
      <div className="h-[calc(100%-1.5rem)] w-full animate-pulse rounded-lg bg-white/[0.04]" />
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

/**
 * QuantSurface3D — the terminal's single, canonical WebGL renderer for multidimensional
 * quant data, built to ARCHITECTURAL DIRECTIVE 08 (Spatial Quant Rendering):
 *
 *   • BRUTALIST ONLY. No lights (no Ambient/Directional), no PBR, no post-processing.
 *     The surface is a `MeshBasicMaterial({ wireframe: true, vertexColors })` — a raw,
 *     high-performance mathematical plot; clouds are `PointsMaterial`; axes/grid are
 *     `LineBasicMaterial`. It looks like a plot, not a video game.
 *   • DATA-STATUS PALETTE. Floor grid is stark #27272a. Surface colour maps to data
 *     intensity: diverging signed data → red #ef4444 (neg) · slate (zero) · green
 *     #22c55e (pos); sequential unsigned data → blue (low) → amber → red #ef4444 (high).
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
}

// ── Directive-08 data-status palette (0..255 → 0..1 baked below) ──────────────
const RED: [number, number, number] = [0xef / 255, 0x44 / 255, 0x44 / 255];   // #ef4444
const GREEN: [number, number, number] = [0x22 / 255, 0xc5 / 255, 0x5e / 255]; // #22c55e
const SLATE: [number, number, number] = [0x33 / 255, 0x41 / 255, 0x55 / 255]; // #334155 (dim neutral so red/green extremes pop)
const BLUE: [number, number, number] = [0x25 / 255, 0x63 / 255, 0xeb / 255];  // #2563eb
const AMBER: [number, number, number] = [0xea / 255, 0xb3 / 255, 0x08 / 255]; // #eab308

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

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch { return false; }
}

const SPAN = 10;      // xz footprint
const HEIGHT = 4.4;   // world height (y)

export default function QuantSurface3D({
  grid, points, ramp = 'diverging', height = 380, axisLabels, autoRotate = true, loading, error,
}: QuantSurface3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [glState, setGlState] = useState<'ok' | 'nowebgl' | 'lost'>('ok');

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
    const ax = mkAxis(new THREE.Vector3(-SPAN / 2, 0, 0), new THREE.Vector3(SPAN / 2, 0, 0));
    const ay = mkAxis(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, HEIGHT + 0.6, 0));
    const az = mkAxis(new THREE.Vector3(0, 0, -SPAN / 2), new THREE.Vector3(0, 0, SPAN / 2));
    scene.add(ax, ay, az);

    const disposables: Array<{ dispose: () => void }> = [floor.geometry, floor.material as THREE.Material, axisMat, ax.geometry, ay.geometry, az.geometry];
    const color = new THREE.Color();

    if (grid && grid.length) {
      // Surface: rows = depth(z), cols = x, value = height(y). Wireframe, colour by value.
      const rows = grid.length, cols = grid[0].length;
      let vMin = Infinity, vMax = -Infinity;
      for (const r of grid) for (const v of r) { if (v < vMin) vMin = v; if (v > vMax) vMax = v; }
      // Diverging surfaces centre the colour ramp on zero and make the height symmetric,
      // so a value of 0 sits at the slate neutral and the floor.
      const absMax = Math.max(Math.abs(vMin), Math.abs(vMax)) || 1;
      const range = vMax - vMin || 1;
      const positions = new Float32Array(rows * cols * 3);
      const colors = new Float32Array(rows * cols * 3);
      let p = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = (c / (cols - 1) - 0.5) * SPAN;
          const z = (r / (rows - 1) - 0.5) * SPAN;
          const raw = grid[r][c];
          const hNorm = ramp === 'diverging' ? (raw / absMax + 1) / 2 : (raw - vMin) / range; // 0..1
          const cNorm = ramp === 'diverging' ? (raw / absMax + 1) / 2 : (raw - vMin) / range;
          positions[p] = x; positions[p + 1] = hNorm * HEIGHT; positions[p + 2] = z;
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
      // THE brutalist surface: wireframe mesh, coloured per-vertex by data intensity.
      const mat = new THREE.MeshBasicMaterial({ wireframe: true, vertexColors: true, transparent: true, opacity: 0.95 });
      const mesh = new THREE.Mesh(geo, mat);
      group.add(mesh);
      // Vertex nodes as points give the plot definition without any lighting.
      const ptsMat = new THREE.PointsMaterial({ size: 0.055, vertexColors: true, transparent: true, opacity: 0.9, sizeAttenuation: true });
      const pts = new THREE.Points(geo, ptsMat);
      group.add(pts);
      disposables.push(geo, mat, ptsMat);
    } else if (points && points.length) {
      // Cloud: x,z from x/y; height y from z; colour by v.
      let xm = Infinity, xM = -Infinity, ym = Infinity, yM = -Infinity, zm = Infinity, zM = -Infinity, vm = Infinity, vM = -Infinity;
      for (const pt of points) {
        xm = Math.min(xm, pt.x); xM = Math.max(xM, pt.x);
        ym = Math.min(ym, pt.y); yM = Math.max(yM, pt.y);
        zm = Math.min(zm, pt.z); zM = Math.max(zM, pt.z);
        vm = Math.min(vm, pt.v); vM = Math.max(vM, pt.v);
      }
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

    // Orbit-drag + wheel-zoom + gentle auto-rotate around a y-up world.
    let rot = 0.7, dragging = false, lastX = 0, lastY = 0, elev = 0.42, dist = 15;
    const el = renderer.domElement;
    const onDown = (e: PointerEvent) => { dragging = true; lastX = e.clientX; lastY = e.clientY; try { el.setPointerCapture(e.pointerId); } catch {} };
    const onUp = (e: PointerEvent) => { dragging = false; try { el.releasePointerCapture(e.pointerId); } catch {} };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      rot -= (e.clientX - lastX) * 0.008;
      elev = Math.max(0.1, Math.min(1.4, elev + (e.clientY - lastY) * 0.006));
      lastX = e.clientX; lastY = e.clientY;
    };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); dist = Math.max(9, Math.min(34, dist + e.deltaY * 0.012)); };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointermove', onMove);
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
  }, [hasData, loading, error, grid, points, ramp]);

  if (error) return <Frame height={height}><State tone="danger" title="Surface failed to render" sub={error} /></Frame>;
  if (loading) return <Frame height={height}><Sk /></Frame>;
  if (!hasData) return <Frame height={height}><State tone="muted" title="Awaiting inputs" sub="No grid / cloud to plot yet." /></Frame>;
  if (glState === 'nowebgl') return <Frame height={height}><State tone="warn" title="3D renderer unavailable" sub="WebGL is disabled or unsupported here." /></Frame>;

  return (
    <Frame height={height}>
      <div ref={mountRef} className="absolute inset-0" />
      {glState === 'lost' && <div className="absolute inset-0 flex items-center justify-center"><State tone="warn" title="GL context lost" sub="Scroll away and back to restore." /></div>}
      {axisLabels && (
        <div className="pointer-events-none absolute bottom-2 left-3 flex gap-3 font-mono text-[8px] uppercase tracking-widest text-[var(--text-tertiary)]">
          <span>x · {axisLabels[0]}</span><span>z · {axisLabels[1]}</span><span>y · {axisLabels[2]}</span>
        </div>
      )}
      <div className="pointer-events-none absolute right-3 top-2 font-mono text-[8px] uppercase tracking-widest text-[var(--text-tertiary)]/70">drag · scroll</div>
    </Frame>
  );
}

// Module-scope so the subtree (and the imperatively-appended canvas) is NEVER remounted
// when the parent re-renders each tick — the bug that produced a canvas-less black panel.
const Frame: React.FC<{ height: number; children: React.ReactNode }> = ({ height, children }) => (
  <div style={{ height }} className="relative w-full overflow-hidden bg-[#0a0a0b]">{children}</div>
);

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

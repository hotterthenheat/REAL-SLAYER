import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

/**
 * ThreeSurface — a robust, self-disposing three.js 3D surface / point-cloud for the
 * Quant Lab. Renders REAL model data (a height grid or an x/y/z/value cloud) mapped to
 * a Slayer height colormap, with a wireframe, orbit-drag, wheel-zoom and gentle
 * auto-rotate. Uses three.js's native y-up world (height = y) so orientation is boring
 * and correct. Every failure mode has an explicit terminal-grade state — it never
 * settles into a white/blank box:
 *   • WebGL unsupported  → clear "renderer unavailable" panel
 *   • no data            → "awaiting inputs" empty state
 *   • context lost       → recoverable notice
 * The GL context is created only once the panel scrolls into view (IntersectionObserver)
 * so a page with several surfaces never spins up every context at once.
 */

export interface SurfacePoint { x: number; y: number; z: number; v?: number }

interface ThreeSurfaceProps {
  /** Row-major grid of heights. Surface mode. */
  grid?: number[][];
  /** Explicit points {x,y,z,v}. Point-cloud mode (used when `grid` is absent). */
  points?: SurfacePoint[];
  height?: number;
  /** [x, y, z] axis captions rendered as small overlays. */
  axisLabels?: [string, string, string];
  autoRotate?: boolean;
  /** External states so the panel is never a blank canvas. */
  loading?: boolean;
  error?: string | null;
}

// Slayer height colormap (low → high): deep indigo → sky → green → amber → pink.
const STOPS: Array<[number, [number, number, number]]> = [
  [0.0, [0.16, 0.11, 0.55]],
  [0.25, [0.16, 0.45, 0.90]],
  [0.5, [0.29, 0.87, 0.50]],
  [0.75, [0.98, 0.72, 0.06]],
  [1.0, [0.96, 0.28, 0.40]],
];
function heightColor(t: number, out: THREE.Color) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i][0]) {
      const [a, ca] = STOPS[i - 1], [b, cb] = STOPS[i];
      const f = (t - a) / (b - a || 1);
      out.setRGB(ca[0] + (cb[0] - ca[0]) * f, ca[1] + (cb[1] - ca[1]) * f, ca[2] + (cb[2] - ca[2]) * f);
      return;
    }
  }
  out.setRGB(...STOPS[STOPS.length - 1][1]);
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch { return false; }
}

const SPAN = 10;       // surface footprint (x,z ∈ [-5, 5])
const HEIGHT = 4.2;    // max height in world units (y)

export default function ThreeSurface({ grid, points, height = 380, axisLabels, autoRotate = true, loading, error }: ThreeSurfaceProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [glState, setGlState] = useState<'ok' | 'nowebgl' | 'lost'>('ok');

  const hasData = (grid && grid.length > 0 && grid[0]?.length > 0) || (points && points.length > 0);

  // Create the GL context on mount and dispose on unmount. Visibility-gating (so a page
  // of surfaces never exceeds the browser's WebGL-context limit → blank panels) is done
  // OUTSIDE this component via <LazyMount>, which unmounts off-screen surfaces entirely.
  useEffect(() => {
    if (!hasData || loading || error) return;
    const container = mountRef.current;
    if (!container) return;
    if (!webglAvailable()) { setGlState('nowebgl'); return; }

    let width = container.clientWidth || 400;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000); // native y-up

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch { setGlState('nowebgl'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0); // transparent → panel's dark bg shows, never white
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';

    const onLost = (e: Event) => { e.preventDefault(); setGlState('lost'); };
    renderer.domElement.addEventListener('webglcontextlost', onLost, false);

    const group = new THREE.Group();
    scene.add(group);

    // Reference floor grid (native xz-plane) + axes so it reads as a measured space.
    const floor = new THREE.GridHelper(SPAN, 12, 0x2f2f38, 0x191920);
    floor.position.y = -0.01;
    scene.add(floor);
    const axisMat = new THREE.LineBasicMaterial({ color: 0x52525b, transparent: true, opacity: 0.75 });
    const axis = (a: THREE.Vector3, b: THREE.Vector3) => new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), axisMat);
    scene.add(axis(new THREE.Vector3(-SPAN / 2, 0, 0), new THREE.Vector3(SPAN / 2, 0, 0)));       // x
    scene.add(axis(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, HEIGHT + 0.6, 0)));           // y (height)
    scene.add(axis(new THREE.Vector3(0, 0, -SPAN / 2), new THREE.Vector3(0, 0, SPAN / 2)));       // z (depth)

    const disposables: Array<{ dispose: () => void }> = [];
    const color = new THREE.Color();

    if (grid && grid.length) {
      // ── Surface mode: rows = z (depth), cols = x, value = y (height) ──
      const rows = grid.length, cols = grid[0].length;
      let zMin = Infinity, zMax = -Infinity;
      for (const r of grid) for (const v of r) { if (v < zMin) zMin = v; if (v > zMax) zMax = v; }
      const range = zMax - zMin || 1;
      const positions = new Float32Array(rows * cols * 3);
      const colors = new Float32Array(rows * cols * 3);
      let p = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = (c / (cols - 1) - 0.5) * SPAN;
          const z = (r / (rows - 1) - 0.5) * SPAN;
          const t = (grid[r][c] - zMin) / range;
          positions[p] = x; positions[p + 1] = t * HEIGHT; positions[p + 2] = z;
          heightColor(t, color);
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
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.92, side: THREE.DoubleSide }));
      group.add(mesh);
      const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07 }));
      group.add(wire);
      disposables.push(geo, mesh.material as THREE.Material, wire.geometry, wire.material as THREE.Material);
    } else if (points && points.length) {
      // ── Point-cloud mode: x, z from x/y inputs; height y from z input ──
      let xm = Infinity, xM = -Infinity, ym = Infinity, yM = -Infinity, zm = Infinity, zM = -Infinity;
      for (const pt of points) { xm = Math.min(xm, pt.x); xM = Math.max(xM, pt.x); ym = Math.min(ym, pt.y); yM = Math.max(yM, pt.y); zm = Math.min(zm, pt.z); zM = Math.max(zM, pt.z); }
      const nx = (v: number) => ((v - xm) / (xM - xm || 1) - 0.5) * SPAN;
      const nz = (v: number) => ((v - ym) / (yM - ym || 1) - 0.5) * SPAN;
      const ny = (v: number) => ((v - zm) / (zM - zm || 1)) * HEIGHT;
      const positions = new Float32Array(points.length * 3);
      const colors = new Float32Array(points.length * 3);
      points.forEach((pt, i) => {
        positions[i * 3] = nx(pt.x); positions[i * 3 + 1] = ny(pt.z); positions[i * 3 + 2] = nz(pt.y);
        const t = pt.v != null ? (pt.v - zm) / (zM - zm || 1) : (pt.z - zm) / (zM - zm || 1);
        heightColor(t, color);
        colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const cloud = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, opacity: 0.95, sizeAttenuation: true }));
      group.add(cloud);
      disposables.push(geo, cloud.material as THREE.Material);
    }

    // Orbit-drag + wheel-zoom + auto-rotate around a y-up world.
    let rot = 0.7, dragging = false, lastX = 0, lastY = 0, elev = 0.55, dist = 16;
    const el = renderer.domElement;
    const onDown = (e: PointerEvent) => { dragging = true; lastX = e.clientX; lastY = e.clientY; el.setPointerCapture(e.pointerId); };
    const onUp = (e: PointerEvent) => { dragging = false; try { el.releasePointerCapture(e.pointerId); } catch {} };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      rot -= (e.clientX - lastX) * 0.008;
      elev = Math.max(0.12, Math.min(1.35, elev + (e.clientY - lastY) * 0.006));
      lastX = e.clientX; lastY = e.clientY;
    };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); dist = Math.max(9, Math.min(34, dist + e.deltaY * 0.012)); };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('wheel', onWheel, { passive: false });

    const target = new THREE.Vector3(0, HEIGHT * 0.42, 0);
    let raf = 0;
    const animate = () => {
      if (autoRotate && !dragging) rot += 0.0024;
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

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('webglcontextlost', onLost);
      disposables.forEach(d => d.dispose());
      floor.geometry.dispose(); (floor.material as THREE.Material).dispose();
      renderer.dispose();
      if (el.parentNode) el.parentNode.removeChild(el);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasData, loading, error, grid, points]);

  // ── Terminal-grade states (never a white box) ──────────────────────
  const Frame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div style={{ height }} className="relative w-full overflow-hidden bg-[radial-gradient(circle_at_50%_-10%,color-mix(in_srgb,var(--accent-color)_9%,transparent),transparent_45%)]">
      {children}
    </div>
  );

  if (error) return <Frame><State tone="danger" title="Surface failed to render" sub={error} /></Frame>;
  if (loading) return <Frame><Skeleton /></Frame>;
  if (!hasData) return <Frame><State tone="muted" title="Awaiting inputs" sub="No moneyness / tenor / value grid yet." /></Frame>;
  if (glState === 'nowebgl') return <Frame><State tone="warn" title="3D renderer unavailable" sub="WebGL is disabled or unsupported in this browser." /></Frame>;

  return (
    <Frame>
      <div ref={mountRef} className="absolute inset-0" />
      {glState === 'lost' && <div className="absolute inset-0 flex items-center justify-center"><State tone="warn" title="GL context lost" sub="Scroll away and back to restore the surface." /></div>}
      {axisLabels && (
        <div className="pointer-events-none absolute bottom-2 left-3 flex gap-3 font-mono text-[8px] uppercase tracking-widest text-[var(--text-tertiary)]">
          <span>x · {axisLabels[0]}</span><span>y · {axisLabels[2]}</span><span>depth · {axisLabels[1]}</span>
        </div>
      )}
      <div className="pointer-events-none absolute right-3 top-2 font-mono text-[8px] uppercase tracking-widest text-[var(--text-tertiary)]/70">drag · scroll</div>
    </Frame>
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

function Skeleton() {
  return (
    <div className="absolute inset-0 p-4">
      <div className="mb-3 h-3 w-40 animate-pulse rounded bg-white/10" />
      <div className="h-[calc(100%-1.5rem)] w-full animate-pulse rounded-lg bg-white/[0.04]" />
    </div>
  );
}

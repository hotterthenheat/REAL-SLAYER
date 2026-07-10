import { useEffect, useRef, type ReactNode } from 'react';

/**
 * CursorSpotlight — reveals its children only around the pointer, like a torch
 * moving over a dark surface. The child layer is always mounted; a radial CSS
 * mask centred on the (rAF-lerped) cursor position carves out the visible pool
 * of light, and the layer's opacity eases in/out as the pointer enters/leaves
 * the watched parent. Everything is mask + opacity on ONE wrapper node — no
 * re-renders per mousemove, no layout, compositor-only.
 *
 * On coarse pointers (touch) there is no cursor to follow: the layer renders as
 * a faint static wash instead, so the surface never reads as pure black.
 */
interface Props {
  children: ReactNode;
  /** radius of the revealed pool, px. */
  radius?: number;
  /** peak layer opacity inside the pool. */
  strength?: number;
  /** render as a faint static wash (touch / reduced motion). */
  staticFallback?: boolean;
  className?: string;
}

export function CursorSpotlight({ children, radius = 340, strength = 1, staticFallback = false, className = '' }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || staticFallback) return;
    const parent = el.parentElement ?? el;

    const target = { x: -9999, y: -9999, o: 0 };
    // `r` is the live pool radius — it swells with pointer speed so the light
    // feels like it flows/stretches as you move, then eases back when you stop.
    const cur = { x: -9999, y: -9999, o: 0, r: radius };
    let last = { x: -9999, y: -9999 };
    let speed = 0; // rAF-smoothed pointer speed, px/frame
    let raf = 0;

    const move = (e: PointerEvent) => {
      const rect = parent.getBoundingClientRect();
      const nx = e.clientX - rect.left;
      const ny = e.clientY - rect.top;
      if (last.x > -9998) {
        // ease the measured step into `speed` so a single fast flick doesn't spike
        const step = Math.hypot(nx - last.x, ny - last.y);
        speed += (Math.min(48, step) - speed) * 0.35;
      }
      last = { x: nx, y: ny };
      target.x = nx;
      target.y = ny;
      target.o = 1;
      // first entry: jump straight to the cursor so the pool doesn't streak in
      // from the previous corner
      if (cur.o < 0.02) { cur.x = nx; cur.y = ny; }
    };
    const leave = () => { target.o = 0; };

    const loop = () => {
      // tighter position tracking + quicker fade-in = a more fluid, connected feel
      cur.x += (target.x - cur.x) * 0.2;
      cur.y += (target.y - cur.y) * 0.2;
      cur.o += (target.o - cur.o) * 0.14;
      // pool grows up to +24% at speed, eases back toward base when the cursor rests
      const targetR = radius * (1 + Math.min(0.24, (speed / 48) * 0.24));
      cur.r += (targetR - cur.r) * 0.14;
      speed *= 0.86; // decay so the swell settles once movement stops
      const mask = `radial-gradient(circle ${cur.r.toFixed(1)}px at ${cur.x.toFixed(1)}px ${cur.y.toFixed(1)}px, rgba(0,0,0,1) 0%, rgba(0,0,0,0.72) 50%, transparent 80%)`;
      el.style.opacity = String(strength * cur.o);
      el.style.maskImage = mask;
      (el.style as any).webkitMaskImage = mask;
      raf = requestAnimationFrame(loop);
    };

    parent.addEventListener('pointermove', move);
    parent.addEventListener('pointerleave', leave);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      parent.removeEventListener('pointermove', move);
      parent.removeEventListener('pointerleave', leave);
    };
  }, [radius, strength, staticFallback]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 ${className}`}
      style={staticFallback ? { opacity: 0.15 } : { opacity: 0 }}
    >
      {children}
    </div>
  );
}

export default CursorSpotlight;

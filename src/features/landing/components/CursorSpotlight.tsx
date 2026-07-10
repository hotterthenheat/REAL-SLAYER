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

export function CursorSpotlight({ children, radius = 300, strength = 0.9, staticFallback = false, className = '' }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || staticFallback) return;
    const parent = el.parentElement ?? el;

    const target = { x: -9999, y: -9999, o: 0 };
    const cur = { x: -9999, y: -9999, o: 0 };
    let raf = 0;

    const move = (e: PointerEvent) => {
      const r = parent.getBoundingClientRect();
      target.x = e.clientX - r.left;
      target.y = e.clientY - r.top;
      target.o = 1;
      // first entry: jump straight to the cursor so the pool doesn't streak in
      // from the previous corner
      if (cur.o < 0.02) { cur.x = target.x; cur.y = target.y; }
    };
    const leave = () => { target.o = 0; };

    const loop = () => {
      cur.x += (target.x - cur.x) * 0.16;
      cur.y += (target.y - cur.y) * 0.16;
      cur.o += (target.o - cur.o) * 0.1;
      const mask = `radial-gradient(circle ${radius}px at ${cur.x.toFixed(1)}px ${cur.y.toFixed(1)}px, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.55) 46%, transparent 74%)`;
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
      style={staticFallback ? { opacity: 0.12 } : { opacity: 0 }}
    >
      {children}
    </div>
  );
}

export default CursorSpotlight;

import { useEffect, useRef } from 'react';

interface Options {
  /** max rotateY (deg) at full horizontal deflection. */
  maxRotY?: number;
  /** max rotateX (deg) at full vertical deflection. */
  maxRotX?: number;
  /** max translate (px) at full deflection. */
  maxShift?: number;
  /** disable entirely (reduced motion / coarse pointer). */
  disabled?: boolean;
}

/**
 * Smooth pointer-driven depth for a single wrapper element. Returns a ref to
 * attach to the stage wrapper; the hook writes `transform` on THAT node only
 * (rotateX/rotateY/translate) via its own rAF lerp, so it never competes with the
 * per-layer transforms GSAP owns inside. Eases back to centre on pointer-leave.
 */
export function usePointerParallax<T extends HTMLElement = HTMLDivElement>({
  maxRotY = 3,
  maxRotX = 2,
  maxShift = 14,
  disabled = false,
}: Options = {}) {
  const ref = useRef<T | null>(null);
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) {
      if (el) el.style.transform = '';
      return;
    }
    const parent = el.parentElement ?? el;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      const r = parent.getBoundingClientRect();
      // -1..1 relative to the element centre
      target.current.x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      target.current.y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    };
    const onLeave = () => {
      target.current.x = 0;
      target.current.y = 0;
    };
    const loop = () => {
      current.current.x += (target.current.x - current.current.x) * 0.08;
      current.current.y += (target.current.y - current.current.y) * 0.08;
      const { x, y } = current.current;
      el.style.transform =
        `perspective(1400px) rotateY(${(x * maxRotY).toFixed(2)}deg) ` +
        `rotateX(${(-y * maxRotX).toFixed(2)}deg) ` +
        `translate3d(${(x * maxShift).toFixed(1)}px, ${(y * maxShift * 0.6).toFixed(1)}px, 0)`;
      raf = requestAnimationFrame(loop);
    };
    parent.addEventListener('pointermove', onMove);
    parent.addEventListener('pointerleave', onLeave);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      parent.removeEventListener('pointermove', onMove);
      parent.removeEventListener('pointerleave', onLeave);
      if (el) el.style.transform = '';
    };
  }, [maxRotY, maxRotX, maxShift, disabled]);

  return ref;
}

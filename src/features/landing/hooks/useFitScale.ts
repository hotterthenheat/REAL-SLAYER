import { useEffect, useRef, useState } from 'react';

/**
 * useFitScale — lay a composition out at a FIXED design size and scale the whole
 * thing uniformly to fit its responsive container. Returns a ref for the outer
 * (responsive) box and the current scale = boxWidth / designWidth.
 *
 * This is how a fixed-pixel design (absolute panel positions, fixed type + SVG)
 * keeps a perfect aspect ratio at every width: instead of stretching individual
 * elements (which distorts type and overlaps panels), one `transform: scale()` on
 * the design layer shrinks everything together. The outer box holds the aspect
 * ratio via CSS; the inner box is the exact design size scaled into it.
 */
export function useFitScale<T extends HTMLElement = HTMLDivElement>(designWidth: number) {
  const ref = useRef<T | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setScale((prev) => (Math.abs(prev - w / designWidth) < 0.001 ? prev : w / designWidth));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [designWidth]);

  return { ref, scale };
}

import { useEffect, useRef, useState } from 'react';
import { useLandingMotion } from '../motion/LandingMotionProvider';
import { DUR } from '../motion/motionTokens';

/**
 * CountUp — the landing's signature "data settling into place" mark. A number
 * that ramps 0 → target on mount with the same expo-out hand as every reveal, so
 * when a feature scrolls in its scores/rates *populate* rather than just appear.
 *
 * Because the six previews mount only when their row is first seen, wrapping a
 * static figure in <CountUp> makes it count up exactly on reveal — no separate
 * viewport wiring. Under reduced motion it renders the final value immediately.
 *
 * `flicker` shows a few random intermediate digits for the first stretch (a
 * terminal booting a feed) before locking onto the ramp — used sparingly.
 */
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

interface Props {
  value: number;
  duration?: number; // seconds; defaults to DUR.count
  decimals?: number;
  prefix?: string;
  suffix?: string;
  flicker?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function CountUp({ value, duration, decimals = 0, prefix = '', suffix = '', flicker = false, className, style }: Props) {
  const { reduced } = useLandingMotion();
  const [display, setDisplay] = useState(reduced ? value : 0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      return;
    }
    const durMs = (duration ?? DUR.count) * 1000;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durMs);
      let v = value * easeOutExpo(t);
      if (flicker && t < 0.5) v = value * (0.35 + Math.random() * 0.8);
      setDisplay(v);
      if (t < 1) {
        raf.current = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
      }
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, duration, flicker, reduced]);

  const text = display.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (
    <span className={className} style={{ fontVariantNumeric: 'tabular-nums', ...style }}>
      {prefix}
      {text}
      {suffix}
    </span>
  );
}

export default CountUp;

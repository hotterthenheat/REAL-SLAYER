import { useEffect, useState } from 'react';

/**
 * LaunchTransition — a brief holographic "gate" played once when entering the
 * terminal from the landing: a spectral silver bar wipes across a black veil,
 * then the veil lifts to reveal the desk. Purely cosmetic and NON-BLOCKING —
 * navigation has already happened underneath (pointer-events are off and a timer
 * always resolves), so if anything is off the terminal is still there and usable.
 * Honors prefers-reduced-motion by resolving immediately.
 */
export function LaunchTransition({ onDone, duration = 720 }: { onDone: () => void; duration?: number }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { onDone(); return; }
    const tLeave = setTimeout(() => setLeaving(true), Math.max(0, duration - 260));
    const tDone = setTimeout(onDone, duration);
    return () => { clearTimeout(tLeave); clearTimeout(tDone); };
  }, [duration, onDone]);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-[120] flex flex-col items-center justify-center gap-4 pointer-events-none select-none"
      style={{
        background: 'var(--bg-base, #0A0B0D)',
        opacity: leaving ? 0 : 1,
        transition: 'opacity 260ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div
        className="slayer-holo-text text-[13px] font-mono font-bold uppercase tracking-[0.34em]"
        style={{ opacity: leaving ? 0 : 1, transition: 'opacity 200ms ease-out' }}
      >
        slayer_terminal
      </div>
      <div className="relative w-[min(460px,68vw)] overflow-hidden rounded-full" style={{ height: 2 }}>
        <div className="slayer-launch-wipe slayer-holo-fill absolute inset-y-0 left-0 w-full" />
      </div>
    </div>
  );
}

export default LaunchTransition;

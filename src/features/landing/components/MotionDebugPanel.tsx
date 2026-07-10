import { useEffect, useRef, useState } from 'react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useLandingMotion } from '../motion/LandingMotionProvider';

interface Row { id: string; progress: number; active: boolean; }
interface Snapshot { rows: Row[]; scroll: number; fps: number; pinned: string | null; }

/**
 * Dev-only motion debug overlay (rendered only when ?motionDebug=1). Enumerates
 * every named ScrollTrigger with its normalized progress + active flag, the global
 * scroll progress, the current responsive motion mode, reduced-motion status, a
 * rolling FPS estimate, and which scene is currently pinned. Never shipped to
 * normal visitors (the provider gates it on the query flag).
 */
export function MotionDebugPanel() {
  const { mode, reduced, coarsePointer, scrollerRef } = useLandingMotion();
  const [snap, setSnap] = useState<Snapshot>({ rows: [], scroll: 0, fps: 0, pinned: null });
  const frames = useRef<number[]>([]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = () => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      frames.current.push(1000 / Math.max(1, dt));
      if (frames.current.length > 30) frames.current.shift();
      const fps = Math.round(frames.current.reduce((a, b) => a + b, 0) / frames.current.length);

      const triggers = ScrollTrigger.getAll().filter((t) => t.vars.id);
      const rows: Row[] = triggers.map((t) => ({ id: String(t.vars.id), progress: t.progress, active: t.isActive }));
      const pinned = triggers.find((t) => t.isActive && (t as any).pin)?.vars.id ?? null;
      const el = scrollerRef.current;
      const scroll = el && el.scrollHeight > el.clientHeight ? el.scrollTop / (el.scrollHeight - el.clientHeight) : 0;

      setSnap({ rows, scroll, fps, pinned: pinned ? String(pinned) : null });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [scrollerRef]);

  const bar = (v: number) => (
    <span style={{ display: 'inline-block', width: 46, height: 4, background: 'rgba(255,255,255,0.14)', borderRadius: 2, verticalAlign: 'middle' }}>
      <span style={{ display: 'block', height: '100%', width: `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`, background: '#6A93B5', borderRadius: 2 }} />
    </span>
  );

  return (
    <div
      style={{
        position: 'fixed', left: 10, bottom: 10, zIndex: 9999, width: 250, padding: '10px 12px',
        background: 'rgba(8,9,10,0.92)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 8,
        fontFamily: 'var(--font-brand, monospace)', fontSize: 10, color: '#E5E5E5', lineHeight: 1.7, pointerEvents: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, color: '#6A93B5', letterSpacing: '0.14em' }}>
        <span>MOTION DEBUG</span><span>{snap.fps} fps</span>
      </div>
      <div>mode: <b>{mode}</b>{coarsePointer ? ' · touch' : ''}{reduced ? ' · reduced' : ''}</div>
      <div>scroll: {bar(snap.scroll)} {(snap.scroll * 100).toFixed(0)}%</div>
      <div style={{ marginTop: 4, opacity: 0.7 }}>pinned: {snap.pinned ?? '—'}</div>
      <div style={{ marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 6 }}>
        {snap.rows.length === 0 && <div style={{ opacity: 0.5 }}>no triggers</div>}
        {snap.rows.map((r) => (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 6, color: r.active ? '#3F9C79' : 'rgba(229,229,229,0.55)' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.id.replace('landing-', '')}</span>
            {bar(r.progress)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default MotionDebugPanel;

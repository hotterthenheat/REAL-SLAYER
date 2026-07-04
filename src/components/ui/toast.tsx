import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';

/**
 * Slayer terminal toasts — a tiny, dependency-free Sonner. Reserved for status
 * that matters to a trader mid-flow: saved layouts, failed data fetches,
 * completed exports, errors. Not for chatty confirmations of obvious actions.
 *
 *   import { toast } from '@/src/components/ui/toast'
 *   toast.success('Layout saved')
 *   toast.error('Market data failed to load')
 *
 * Mount <Toaster/> once at the app root.
 */

export type ToastType = 'success' | 'error' | 'info' | 'warning';
export interface ToastRecord {
  id: number;
  type: ToastType;
  title: string;
  description?: string;
  duration: number;
}

type Listener = (toasts: ToastRecord[]) => void;

let toasts: ToastRecord[] = [];
let seq = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(toasts);
}

function dismiss(id: number) {
  toasts = toasts.filter(t => t.id !== id);
  emit();
}

function push(type: ToastType, title: string, opts?: { description?: string; duration?: number }) {
  const id = ++seq;
  const duration = opts?.duration ?? (type === 'error' ? 6000 : 3600);
  toasts = [...toasts, { id, type, title, description: opts?.description, duration }];
  emit();
  if (duration > 0 && typeof window !== 'undefined') {
    window.setTimeout(() => dismiss(id), duration);
  }
  return id;
}

export const toast = {
  success: (title: string, opts?: { description?: string; duration?: number }) => push('success', title, opts),
  error: (title: string, opts?: { description?: string; duration?: number }) => push('error', title, opts),
  info: (title: string, opts?: { description?: string; duration?: number }) => push('info', title, opts),
  warning: (title: string, opts?: { description?: string; duration?: number }) => push('warning', title, opts),
  dismiss,
};

const META: Record<ToastType, { Icon: typeof Info; color: string }> = {
  success: { Icon: CheckCircle2, color: 'var(--success)' },
  error: { Icon: XCircle, color: 'var(--danger)' },
  info: { Icon: Info, color: 'var(--info)' },
  warning: { Icon: AlertTriangle, color: 'var(--warning)' },
};

function ToastCard({ t }: { t: ToastRecord }) {
  const { Icon, color } = META[t.type];
  return (
    <div
      role="status"
      className="pointer-events-auto flex w-[340px] max-w-[calc(100vw-2rem)] items-start gap-2.5 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 shadow-[0_12px_36px_-12px_rgba(0,0,0,0.75)] backdrop-blur-md"
      style={{ animation: 'sl-toast-in 200ms cubic-bezier(0.16,1,0.3,1)' }}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} />
      <Icon className="mt-[1px] h-4 w-4 shrink-0" style={{ color }} />
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[12px] font-semibold leading-tight text-[var(--text-primary)]">{t.title}</div>
        {t.description && (
          <div className="mt-0.5 text-[11px] leading-snug text-[var(--text-tertiary)]">{t.description}</div>
        )}
      </div>
      <button
        onClick={() => dismiss(t.id)}
        aria-label="Dismiss"
        className="shrink-0 rounded p-0.5 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function Toaster() {
  const [items, setItems] = useState<ToastRecord[]>(toasts);
  useEffect(() => {
    const l: Listener = ts => setItems([...ts]);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  if (typeof document === 'undefined') return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[10000] flex flex-col-reverse gap-2" aria-live="polite">
      {items.map(t => <ToastCard key={t.id} t={t} />)}
      <style>{`@keyframes sl-toast-in{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}

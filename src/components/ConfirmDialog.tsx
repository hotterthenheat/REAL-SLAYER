import { AlertDialog } from 'radix-ui';
import { AlertTriangle } from 'lucide-react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red, destructive styling + alertdialog semantics for irreversible actions. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Accessible, token-styled confirmation modal — a branded replacement for the
 * native window.confirm(). Built on radix AlertDialog: it traps focus, locks scroll,
 * returns focus to the trigger on close, and carries proper alertdialog semantics.
 * Escape and backdrop click cancel; the confirm button is focused on open. Same
 * props as before, so existing callers are unchanged.
 */

const ANIM = `
@keyframes sl-confirm-overlay-in{from{opacity:0}to{opacity:1}}
@keyframes sl-confirm-overlay-out{from{opacity:1}to{opacity:0}}
@keyframes sl-confirm-content-in{from{opacity:0;transform:translate(-50%,-46%) scale(.97)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
@keyframes sl-confirm-content-out{from{opacity:1;transform:translate(-50%,-50%) scale(1)}to{opacity:0;transform:translate(-50%,-46%) scale(.97)}}
[data-slayer-confirm-overlay][data-state=open]{animation:sl-confirm-overlay-in 140ms ease-out}
[data-slayer-confirm-overlay][data-state=closed]{animation:sl-confirm-overlay-out 130ms ease-in}
[data-slayer-confirm-content][data-state=open]{animation:sl-confirm-content-in 180ms cubic-bezier(0.16,1,0.3,1)}
[data-slayer-confirm-content][data-state=closed]{animation:sl-confirm-content-out 140ms ease-in}
@media (prefers-reduced-motion: reduce){[data-slayer-confirm-overlay],[data-slayer-confirm-content]{animation:none!important}}
`;

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay
          data-slayer-confirm-overlay=""
          className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-md"
        />
        <AlertDialog.Content
          data-slayer-confirm-content=""
          className="fixed left-1/2 top-1/2 z-[121] w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] shadow-[0_24px_80px_rgba(0,0,0,0.6)] focus:outline-none"
        >
          <style>{ANIM}</style>
          <div className="p-5">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg shrink-0 border ${danger ? 'bg-[var(--danger)]/10 border-[var(--danger)]/30' : 'bg-[var(--surface-2)] border-[var(--border)]'}`}>
                <AlertTriangle className={`w-5 h-5 ${danger ? 'text-[var(--danger)]' : 'text-[var(--text-secondary)]'}`} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <AlertDialog.Title className="text-[var(--text-primary)] font-sans font-bold text-base leading-tight">{title}</AlertDialog.Title>
                <AlertDialog.Description className="text-[var(--text-secondary)] text-[13px] leading-relaxed mt-1.5">{message}</AlertDialog.Description>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-[var(--border)] bg-[var(--surface-2)]/40">
            <AlertDialog.Cancel asChild>
              <button
                onClick={onCancel}
                className="px-3.5 py-2 text-[12px] font-semibold rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)]"
              >
                {cancelLabel}
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                onClick={onConfirm}
                className={`px-3.5 py-2 text-[12px] font-bold rounded-lg transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] ${danger ? 'bg-[var(--danger)] text-white hover:opacity-90' : 'bg-[var(--text-primary)] text-[var(--surface)] hover:opacity-90'}`}
              >
                {confirmLabel}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export default ConfirmDialog;

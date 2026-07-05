import React from 'react';
import { Dialog as RadixDialog } from 'radix-ui';
import { X } from 'lucide-react';

/**
 * Slayer terminal Dialog — a modal for focused, interruptive tasks (edit a saved
 * layout, confirm an account change, a short form). Built on radix Dialog, so it
 * brings a proper focus trap, scroll lock, focus return to the trigger, Escape-to-
 * close, and aria-labelledby/ describedby wiring — the things hand-rolled portals
 * routinely miss. Controlled via `open` / `onOpenChange`.
 *
 *   <Dialog open={open} onOpenChange={setOpen} title="Rename layout">
 *     …body…
 *   </Dialog>
 *
 * For destructive yes/no guards use ConfirmDialog (alertdialog semantics). For side
 * panels of secondary controls use Sheet.
 */

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Optional supporting line under the title. */
  description?: string;
  /** Hide the title visually but keep it for screen readers. */
  hideTitle?: boolean;
  children?: React.ReactNode;
  /** Footer actions row, right-aligned. */
  footer?: React.ReactNode;
  /** Max width utility class, e.g. "max-w-md". */
  widthClass?: string;
}

const ANIM = `
@keyframes sl-dialog-overlay-in{from{opacity:0}to{opacity:1}}
@keyframes sl-dialog-content-in{from{opacity:0;transform:translate(-50%,-48%) scale(.97)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
[data-slayer-dialog-overlay][data-state=open]{animation:sl-dialog-overlay-in 140ms ease-out}
[data-slayer-dialog-content][data-state=open]{animation:sl-dialog-content-in 180ms cubic-bezier(0.16,1,0.3,1)}
@media (prefers-reduced-motion: reduce){[data-slayer-dialog-overlay],[data-slayer-dialog-content]{animation:none!important}}
`;

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  hideTitle,
  children,
  footer,
  widthClass = 'max-w-md',
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay
          data-slayer-dialog-overlay=""
          className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-md"
        />
        <RadixDialog.Content
          data-slayer-dialog-content=""
          className={`fixed left-1/2 top-1/2 z-[121] w-[calc(100vw-2rem)] ${widthClass} -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] shadow-[0_24px_80px_rgba(0,0,0,0.6)] focus:outline-none`}
        >
          <style>{ANIM}</style>
          <div className="flex items-start justify-between gap-3 px-5 pt-5">
            <div className="min-w-0">
              <RadixDialog.Title
                className={hideTitle
                  ? 'sr-only'
                  : 'font-mono text-[13px] font-black uppercase tracking-widest text-[var(--text-primary)]'}
              >
                {title}
              </RadixDialog.Title>
              {description && (
                <RadixDialog.Description className="mt-1.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">
                  {description}
                </RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close
              aria-label="Close"
              className="-mr-1 -mt-1 shrink-0 rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)]"
            >
              <X className="h-4 w-4" />
            </RadixDialog.Close>
          </div>
          {children && <div className="px-5 py-4 text-[13px] leading-relaxed text-[var(--text-secondary)]">{children}</div>}
          {footer && (
            <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface-2)]/40 px-5 py-3.5">
              {footer}
            </div>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export default Dialog;

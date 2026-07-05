import React, { useId } from 'react';
import type { ZodType } from 'zod';

/**
 * Accessible form primitives (shadcn Field pattern, Slayer-styled). Every field ties its
 * label to the control, exposes helper/description text, surfaces validation errors with
 * role="alert", and sets aria-invalid + aria-describedby so screen readers and keyboard
 * users get the same feedback sighted users do. Keep the terminal look; add the wiring.
 */

export function FieldError({ children, id }: { children?: React.ReactNode; id?: string }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-[10px] font-medium text-[var(--danger)] leading-snug">
      {children}
    </p>
  );
}

interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label: string;
  value: string;
  onChange: (v: string) => void;
  description?: string;
  error?: string | null;
  /** Hide the visible label but keep it for screen readers. */
  srOnlyLabel?: boolean;
}

export function TextField({ label, value, onChange, description, error, srOnlyLabel, className = '', ...rest }: TextFieldProps) {
  const id = useId();
  const descId = description ? `${id}-desc` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={`text-[10px] font-black uppercase tracking-widest text-[var(--text-tertiary)] ${srOnlyLabel ? 'sr-only' : ''}`}>
        {label}
      </label>
      {description && <p id={descId} className="text-[10px] text-[var(--text-tertiary)] leading-snug">{description}</p>}
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={[descId, errId].filter(Boolean).join(' ') || undefined}
        className={`rounded-md border bg-[var(--surface-2)] px-3 py-2 font-mono text-[12px] text-[var(--text-primary)] transition-colors placeholder:text-[var(--text-tertiary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] ${
          error ? 'border-[var(--danger)]/60' : 'border-[var(--border)] focus-visible:border-[var(--border-strong)]'
        } ${className}`}
        {...rest}
      />
      <FieldError id={errId}>{error}</FieldError>
    </div>
  );
}

/** Validate a value against a Zod schema; returns the first error message or null. */
export function zodError(schema: ZodType, value: unknown): string | null {
  const r = schema.safeParse(value);
  if (r.success) return null;
  return r.error.issues[0]?.message ?? 'Invalid value';
}

/** Async submit states for a form action button. */
export type SubmitState = 'idle' | 'loading' | 'success' | 'error';

'use client';

import * as React from 'react';

import { cn } from '../lib/cn';

export interface FieldProps {
  id: string;
  label: string;
  /** Guidance shown under the label; hidden once an error replaces it. */
  hint?: string;
  error?: string;
  required?: boolean;
  /** Hide the visible label but keep it for screen readers. */
  labelHidden?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Label + hint + error scaffolding shared by every form control, so that the
 * aria wiring is written once. Controls receive ids via `useFieldIds`.
 */
export function Field({
  id,
  label,
  hint,
  error,
  required,
  labelHidden,
  className,
  children,
}: FieldProps) {
  const { hintId, errorId } = useFieldIds(id);

  return (
    <div className={cn('flex w-full flex-col gap-1.5', className)}>
      <label htmlFor={id} className={cn('text-ink text-sm font-bold', labelHidden && 'sr-only')}>
        {label}
        {required && (
          <span className="text-danger ml-0.5" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {hint && !error && (
        <p id={hintId} className="text-muted-light text-xs">
          {hint}
        </p>
      )}

      {children}

      {error && (
        <p id={errorId} role="alert" className="text-danger text-xs font-semibold">
          {error}
        </p>
      )}
    </div>
  );
}

/** Stable derived ids so controls and their descriptions stay wired together. */
export function useFieldIds(id: string) {
  return React.useMemo(() => ({ hintId: `${id}-hint`, errorId: `${id}-error` }), [id]);
}

/** The `aria-describedby` value for a control, given which messages are showing. */
export function describedBy(id: string, hint?: string, error?: string): string | undefined {
  const ids = [hint && !error ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

/** Shared visual treatment for text-like controls. */
export const controlClassName = cn(
  'bg-surface text-ink h-11 w-full rounded-lg border px-3 text-base',
  'placeholder:text-muted-light/70',
  'focus:ring-gold focus:ring-offset-bg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1',
  'disabled:bg-border/40 disabled:text-muted-light disabled:cursor-not-allowed',
  // 16px base font stops iOS Safari zooming the viewport on focus.
  'md:text-sm',
);

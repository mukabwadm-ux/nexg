'use client';

import type * as React from 'react';

import { cn } from '../lib/cn';
import { Spinner } from './spinner';

export interface SwitchProps {
  id: string;
  /** The control's own name, e.g. "Accepting orders". */
  label: string;
  /** A line under the label — what the switch means right now. */
  description?: React.ReactNode;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  /** A change is in flight; the control locks and shows a spinner. */
  loading?: boolean;
  /** Why it is disabled. Shown in place of the description. */
  disabledReason?: string;
  className?: string;
}

/**
 * The gold pill switch from the console artboards.
 *
 * A `button` with `role="switch"`, not a checkbox: these fire an action
 * immediately rather than collecting a value for a later submit, and a
 * checkbox that saves on change without a form around it is a lie about what
 * pressing it does.
 *
 * The whole card is the hit target, which matters on a laptop trackpad — the
 * pill itself is 44x24.
 */
export function Switch({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled = false,
  loading = false,
  disabledReason,
  className,
}: SwitchProps) {
  const locked = disabled || loading;
  const descriptionId = `${id}-description`;
  const caption = locked && disabledReason ? disabledReason : description;

  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-describedby={caption ? descriptionId : undefined}
      disabled={locked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'border-border bg-surface focus-visible:ring-gold flex w-full items-center justify-between gap-3 rounded-xl border p-4 text-left transition-colors',
        locked ? 'cursor-not-allowed opacity-60' : 'hover:border-border-strong',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        className,
      )}
    >
      <span className="min-w-0">
        <span className="text-ink block text-[0.9375rem] font-extrabold">{label}</span>
        {caption && (
          <span id={descriptionId} className="text-muted-light mt-0.5 block text-xs font-semibold">
            {caption}
          </span>
        )}
      </span>

      <span
        aria-hidden="true"
        className={cn(
          'relative flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-gold' : 'bg-border-strong',
        )}
      >
        {loading ? (
          <Spinner className="text-ink absolute left-1/2 h-3 w-3 -translate-x-1/2" />
        ) : (
          <span
            className={cn(
              'block h-5 w-5 rounded-full shadow-sm transition-transform',
              checked ? 'bg-ink translate-x-[1.375rem]' : 'translate-x-0.5 bg-white',
            )}
          />
        )}
      </span>
    </button>
  );
}

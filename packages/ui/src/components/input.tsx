'use client';

import { Eye, EyeOff } from 'lucide-react';
import * as React from 'react';

import { cn } from '../lib/cn';
import { controlClassName, describedBy, Field } from './field';
import { Spinner } from './spinner';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  labelHidden?: boolean;
  /** Shows a spinner inside the control (e.g. while an address is validated). */
  loading?: boolean;
  leadingIcon?: React.ReactNode;
  /** Wrapper class; use `className` for the control itself. */
  containerClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    id,
    label,
    hint,
    error,
    labelHidden,
    loading,
    leadingIcon,
    className,
    containerClassName,
    required,
    disabled,
    type,
    ...props
  },
  ref,
) {
  /* Every password field gets an eye button to show what was typed. */
  const isPassword = type === 'password';
  const [revealed, setRevealed] = React.useState(false);
  const toggle = isPassword && !loading;

  return (
    <Field
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      labelHidden={labelHidden}
      className={containerClassName}
    >
      <div className="relative">
        {leadingIcon && (
          <span
            aria-hidden="true"
            className="text-muted-light pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
          >
            {leadingIcon}
          </span>
        )}
        <input
          ref={ref}
          id={id}
          type={isPassword && revealed ? 'text' : type}
          disabled={disabled || loading}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={cn(
            controlClassName,
            error ? 'border-danger focus:ring-danger' : 'border-border-strong',
            leadingIcon && 'pl-9',
            loading && 'pr-9',
            toggle && 'pr-11',
            className,
          )}
          {...props}
        />
        {loading && (
          <Spinner className="text-muted-light absolute right-3 top-1/2 -translate-y-1/2" />
        )}
        {toggle && (
          <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            disabled={disabled}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            aria-pressed={revealed}
            aria-controls={id}
            title={revealed ? 'Hide password' : 'Show password'}
            className="text-muted hover:text-ink focus-visible:ring-ink absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50"
          >
            {revealed ? (
              <EyeOff className="h-[18px] w-[18px]" aria-hidden="true" />
            ) : (
              <Eye className="h-[18px] w-[18px]" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
    </Field>
  );
});

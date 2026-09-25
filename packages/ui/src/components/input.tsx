'use client';

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
    ...props
  },
  ref,
) {
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
          disabled={disabled || loading}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={cn(
            controlClassName,
            error ? 'border-danger focus:ring-danger' : 'border-border-strong',
            leadingIcon && 'pl-9',
            loading && 'pr-9',
            className,
          )}
          {...props}
        />
        {loading && (
          <Spinner className="text-muted-light absolute right-3 top-1/2 -translate-y-1/2" />
        )}
      </div>
    </Field>
  );
});

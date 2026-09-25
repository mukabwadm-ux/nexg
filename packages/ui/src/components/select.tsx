'use client';

import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';

import { cn } from '../lib/cn';
import { describedBy, Field } from './field';
import { Spinner } from './spinner';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface SelectProps {
  id: string;
  label: string;
  options: readonly SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  loading?: boolean;
  labelHidden?: boolean;
  name?: string;
  className?: string;
  /** Shown on the trigger when there is nothing to choose from. */
  emptyMessage?: string;
}

export function Select({
  id,
  label,
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder = 'Select…',
  hint,
  error,
  required,
  disabled,
  loading,
  labelHidden,
  name,
  className,
  emptyMessage = 'Nothing to choose yet',
}: SelectProps) {
  const isEmpty = options.length === 0;

  return (
    <Field
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      labelHidden={labelHidden}
      className={className}
    >
      <SelectPrimitive.Root
        value={value}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        disabled={disabled || loading || isEmpty}
        name={name}
        required={required}
      >
        <SelectPrimitive.Trigger
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={cn(
            'bg-surface flex h-11 w-full items-center justify-between gap-2 rounded-lg border px-3',
            'text-ink text-base md:text-sm',
            'data-[placeholder]:text-muted-light/70',
            'focus:ring-gold focus:ring-offset-bg focus:outline-none focus:ring-2 focus:ring-offset-1',
            'disabled:bg-border/40 disabled:text-muted-light disabled:cursor-not-allowed',
            error ? 'border-danger focus:ring-danger' : 'border-border-strong',
          )}
        >
          <SelectPrimitive.Value placeholder={isEmpty ? emptyMessage : placeholder} />
          {loading ? (
            <Spinner className="text-muted-light" />
          ) : (
            <SelectPrimitive.Icon asChild>
              <ChevronDown className="text-muted-light h-4 w-4 shrink-0" aria-hidden="true" />
            </SelectPrimitive.Icon>
          )}
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={6}
            className={cn(
              'z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden',
              'border-border bg-surface shadow-raised rounded-lg border',
              'data-[state=open]:animate-fade-in',
            )}
          >
            <SelectPrimitive.Viewport className="p-1">
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className={cn(
                    'relative flex cursor-pointer select-none flex-col gap-0.5 rounded-md py-2 pl-3 pr-8',
                    'text-ink text-sm outline-none',
                    'data-[highlighted]:bg-bg data-[state=checked]:font-bold',
                    'data-[disabled]:pointer-events-none data-[disabled]:opacity-45',
                  )}
                >
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  {option.description && (
                    <span className="text-muted-light text-xs">{option.description}</span>
                  )}
                  <SelectPrimitive.ItemIndicator className="absolute right-2 top-1/2 -translate-y-1/2">
                    <Check className="text-gold-text h-4 w-4" aria-hidden="true" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </Field>
  );
}

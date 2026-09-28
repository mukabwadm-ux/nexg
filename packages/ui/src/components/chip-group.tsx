'use client';

import * as React from 'react';

import { cn } from '../lib/cn';
import { Field } from './field';
import { Skeleton } from './skeleton';

export interface ChipOption {
  value: string;
  label: string;
  /** Optional leading glyph, as on the "Popular requests" chips. */
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface ChipGroupBaseProps {
  id: string;
  label: string;
  options: readonly ChipOption[];
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  loading?: boolean;
  labelHidden?: boolean;
  className?: string;
  emptyMessage?: string;
  /**
   * `pill` is the default rounded chip. `tile` is the larger boxed control the
   * rider hero uses for vehicle choice: icon above label, ink fill when chosen.
   */
  variant?: 'pill' | 'tile';
  /**
   * Fill for the chosen chip. The rider hero uses gold, the merchant register
   * card and the console filters use ink; both are drawn that way.
   */
  selectedTone?: 'ink' | 'gold';
}

export type ChipGroupProps = ChipGroupBaseProps &
  (
    | { multiple?: false; value?: string | null; onChange?: (value: string | null) => void }
    | { multiple: true; value?: readonly string[]; onChange?: (value: string[]) => void }
  );

/**
 * The pill pickers used for city, vehicle and category (spec section 2).
 *
 * Single-select renders as a radio group, multi-select as toggle buttons. Both
 * are fully keyboard driven: arrows move between chips and wrap, Home/End jump
 * to the ends, Space and Enter select.
 */
export function ChipGroup(props: ChipGroupProps) {
  const {
    id,
    label,
    options,
    hint,
    error,
    required,
    disabled,
    loading,
    labelHidden,
    className,
    emptyMessage = 'No options available',
    variant = 'pill',
    selectedTone = 'ink',
  } = props;

  const multiple = props.multiple === true;
  const selected = React.useMemo(() => {
    if (multiple) return new Set((props.value as readonly string[] | undefined) ?? []);
    const single = props.value as string | null | undefined;
    return new Set(single ? [single] : []);
  }, [multiple, props.value]);

  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  /** Pointer activation: re-clicking an optional single-select clears it. */
  const toggle = (option: ChipOption) => {
    if (disabled || option.disabled) return;
    if (multiple) {
      const next = new Set(selected);
      if (next.has(option.value)) next.delete(option.value);
      else next.add(option.value);
      (props.onChange as ((value: string[]) => void) | undefined)?.([...next]);
    } else {
      const next = selected.has(option.value) && !required ? null : option.value;
      (props.onChange as ((value: string | null) => void) | undefined)?.(next);
    }
  };

  /**
   * Keyboard navigation: always selects, never clears. Arrowing onto a chip
   * that happens to be the current one must not deselect it — that is not how
   * a radio group behaves.
   */
  const select = (option: ChipOption) => {
    if (disabled || option.disabled || multiple) return;
    (props.onChange as ((value: string | null) => void) | undefined)?.(option.value);
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    const navigation = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
    if (!navigation.includes(event.key)) return;
    event.preventDefault();

    const enabled = options
      .map((option, position) => ({ option, position }))
      .filter((entry) => !entry.option.disabled);
    if (enabled.length === 0) return;

    const current = enabled.findIndex((entry) => entry.position === index);
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';

    let target: number;
    if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = enabled.length - 1;
    else target = (current + (forward ? 1 : -1) + enabled.length) % enabled.length;

    const next = enabled[target];
    if (!next) return;
    refs.current[next.position]?.focus();
    // Radio semantics: moving focus also moves the selection.
    select(next.option);
  };

  if (loading) {
    return (
      <Field id={id} label={label} hint={hint} labelHidden={labelHidden} className={className}>
        <div className="flex flex-wrap gap-2">
          {[72, 96, 64, 88].map((width, index) => (
            <Skeleton key={index} className="h-10 rounded-full" style={{ width }} />
          ))}
        </div>
      </Field>
    );
  }

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
      {options.length === 0 ? (
        <p className="border-border-strong text-muted-light rounded-lg border border-dashed px-3 py-4 text-center text-sm">
          {emptyMessage}
        </p>
      ) : (
        <div
          id={id}
          role={multiple ? 'group' : 'radiogroup'}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={cn('flex flex-wrap gap-2', variant === 'tile' && 'gap-2.5')}
        >
          {options.map((option, index) => {
            const isSelected = selected.has(option.value);
            const isDisabled = disabled || option.disabled;
            // Exactly one chip stays tabbable so the group is a single tab stop.
            const tabbable = multiple || isSelected || (selected.size === 0 && index === 0);

            return (
              <button
                key={option.value}
                ref={(element) => {
                  refs.current[index] = element;
                }}
                type="button"
                role={multiple ? undefined : 'radio'}
                aria-checked={multiple ? undefined : isSelected}
                aria-pressed={multiple ? isSelected : undefined}
                disabled={isDisabled}
                tabIndex={tabbable ? 0 : -1}
                onClick={() => toggle(option)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className={cn(
                  'transition-colors',
                  'focus-visible:ring-gold focus-visible:ring-offset-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-45',
                  variant === 'tile'
                    ? cn(
                        'flex min-h-[4.375rem] flex-1 basis-24 flex-col items-center justify-center gap-1.5 rounded-xl border px-3 py-3',
                        'text-sm font-bold',
                        isSelected
                          ? 'border-ink bg-ink text-gold'
                          : 'border-border-strong bg-surface text-ink hover:border-ink/40',
                      )
                    : cn(
                        'inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-full border px-4 py-2',
                        'text-sm font-semibold',
                        isSelected
                          ? selectedTone === 'gold'
                            ? 'border-gold bg-gold text-ink'
                            : 'border-ink bg-ink text-white'
                          : 'border-border-strong bg-surface text-ink hover:border-ink/40 hover:bg-bg',
                      ),
                  error && !isSelected && 'border-danger/40',
                )}
              >
                {option.icon && <span aria-hidden="true">{option.icon}</span>}
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </Field>
  );
}

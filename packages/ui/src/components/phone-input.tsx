'use client';

import type { CountryCode } from 'libphonenumber-js';
import * as React from 'react';

import { cn } from '../lib/cn';
import {
  countryFor,
  DEFAULT_PHONE_COUNTRY,
  formatAsYouType,
  fromE164,
  normaliseNationalInput,
  PHONE_COUNTRIES,
  placeholderFor,
  toE164,
} from '../lib/phone';
import { controlClassName, describedBy, Field } from './field';
import { Spinner } from './spinner';

export interface PhoneInputProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  loading?: boolean;
  labelHidden?: boolean;
  name?: string;
  className?: string;
  /** Current value in E.164, e.g. "+254712345678". */
  value?: string | null;
  defaultCountry?: CountryCode;
  /**
   * Render the dial code as a fixed label rather than a picker. The rider hero
   * in the artboard shows a plain "+254 7…" field with no dropdown; the value
   * emitted is still E.164, so nothing downstream changes.
   */
  fixedCountry?: boolean;
  /** Classes for the bordered wrapper; `className` styles the field around it. */
  wrapperClassName?: string;
  /**
   * Fires on every keystroke. `e164` is null until the number is valid for the
   * selected country, so callers can gate submission on it directly.
   */
  onChange?: (e164: string | null, meta: { national: string; country: CountryCode }) => void;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
}

/**
 * Phone entry for Kenyan M-Pesa numbers. Defaults to +254, accepts the leading
 * zero people actually type, and emits E.164 (spec section 2).
 */
export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(function PhoneInput(
  {
    id,
    label,
    hint,
    error,
    required,
    disabled,
    loading,
    labelHidden,
    name,
    className,
    value,
    defaultCountry = DEFAULT_PHONE_COUNTRY,
    fixedCountry = false,
    wrapperClassName,
    onChange,
    onBlur,
  },
  ref,
) {
  const parsed = React.useMemo(() => fromE164(value), [value]);
  const [country, setCountry] = React.useState<CountryCode>(parsed?.country ?? defaultCountry);
  const [national, setNational] = React.useState(parsed?.national ?? '');

  // Adopt an externally supplied value (form reset, resumed application).
  React.useEffect(() => {
    if (parsed && parsed.national !== national) {
      setCountry(parsed.country);
      setNational(parsed.national);
    }
    // Only re-sync when the incoming value actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed?.country, parsed?.national]);

  const emit = (nextNational: string, nextCountry: CountryCode) => {
    onChange?.(toE164(nextNational, nextCountry), {
      national: nextNational,
      country: nextCountry,
    });
  };

  const handleInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const digits = normaliseNationalInput(event.target.value);
    setNational(digits);
    emit(digits, country);
  };

  const handleCountry = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value as CountryCode;
    setCountry(next);
    emit(national, next);
  };

  const selected = countryFor(country);
  const e164 = toE164(national, country);

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
      <div
        className={cn(
          'bg-surface flex items-stretch rounded-lg border',
          'focus-within:ring-gold focus-within:ring-offset-bg focus-within:ring-2 focus-within:ring-offset-1',
          error ? 'border-danger focus-within:ring-danger' : 'border-border-strong',
          (disabled || loading) && 'bg-border/40',
          wrapperClassName,
        )}
      >
        {fixedCountry ? (
          <span className="text-ink flex items-center pl-3 text-sm font-bold">
            {selected.dialCode}
          </span>
        ) : (
          <div className="relative flex items-center">
            {/* A native select keeps the country picker usable one-handed on Android. */}
            <select
              aria-label="Country dialling code"
              value={country}
              onChange={handleCountry}
              disabled={disabled || loading}
              className={cn(
                'h-11 cursor-pointer appearance-none rounded-l-lg bg-transparent py-0 pl-3 pr-1',
                'text-ink text-sm font-bold focus:outline-none disabled:cursor-not-allowed',
              )}
            >
              {PHONE_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.dialCode}
                </option>
              ))}
            </select>
            <span aria-hidden="true" className="bg-border-strong h-5 w-px" />
          </div>
        )}

        <input
          ref={ref}
          id={id}
          name={name}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          disabled={disabled || loading}
          required={required}
          value={formatAsYouType(national, country)}
          onChange={handleInput}
          onBlur={onBlur}
          placeholder={placeholderFor(country)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={cn(
            controlClassName,
            'flex-1 border-0 bg-transparent focus:ring-0',
            loading && 'pr-9',
          )}
        />

        {loading && (
          <span className="flex items-center pr-3">
            <Spinner className="text-muted-light" />
          </span>
        )}
      </div>

      {/* What we will actually store — visible to AT, quiet for sighted users. */}
      <span className="sr-only" data-testid={`${id}-e164`}>
        {e164 ? `Will be saved as ${e164}` : `Incomplete ${selected.name} number`}
      </span>
    </Field>
  );
});

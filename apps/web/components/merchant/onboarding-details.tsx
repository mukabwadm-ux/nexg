'use client';

import {
  ONBOARDING_SECTIONS,
  isFieldRequired,
  isFieldShown,
  parseOnboardingDetails,
  type OnboardingAnswers,
  type OnboardingDetails,
  type OnboardingField,
  type OnboardingRow,
} from '@nexg/contracts/merchant-onboarding-details';
import type { Database } from '@nexg/db';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as React from 'react';

import { MapPinField } from '@/components/merchant/map-pin-field';

/**
 * The owner's onboarding template: the details every merchant gives (business
 * type, county, owner ID number, the refund policy) and the licences, permits,
 * insurance and confirmations their category's addendum asks for. Used in the
 * application (above the agreement) and on Business › Documents.
 */

/**
 * Reads the fields (and, for a saved merchant, the answers). Null where the
 * database does not have them yet (before 20270110410100) or cannot answer:
 * the form then shows nothing and the submit goes on as before.
 */
export async function loadOnboardingDetails(
  client: SupabaseClient<Database>,
  merchantId: string | null,
  categoryId: string | null,
): Promise<OnboardingDetails | null> {
  const { data, error } = await client.rpc('rpc_merchant_onboarding_read', {
    ...(merchantId ? { p_merchant_id: merchantId } : {}),
    ...(categoryId ? { p_category: categoryId } : {}),
  });
  if (error || !data) return null;
  return parseOnboardingDetails(data);
}

const input =
  'border-border-strong bg-surface text-ink placeholder:text-muted-light focus:border-ink w-full rounded-lg border px-3 py-2 text-sm font-semibold outline-none disabled:opacity-60';
const labelClass = 'text-ink block text-[0.8125rem] font-bold';
const help = 'text-muted mt-1 block text-xs font-semibold leading-[1.5]';

function Required({ on }: { on: boolean }) {
  return on ? <span className="text-danger"> *</span> : null;
}

function YesNo({
  id,
  field,
  value,
  required,
  disabled,
  onChange,
}: {
  id: string;
  field: OnboardingField;
  value: string;
  required: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className={labelClass}>
        {field.label}
        <Required on={required} />
      </legend>
      <div className="mt-1.5 flex gap-2">
        {(['yes', 'no'] as const).map((choice) => (
          <label
            key={choice}
            className={`border-border-strong flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold ${
              value === choice ? 'border-ink bg-ink/5' : ''
            }`}
          >
            <input
              type="radio"
              name={id}
              value={choice}
              checked={value === choice}
              disabled={disabled}
              onChange={() => onChange(choice)}
              className="accent-gold h-4 w-4"
            />
            {choice === 'yes' ? 'Yes' : 'No'}
          </label>
        ))}
      </div>
      {field.hint ? <span className={help}>{field.hint}</span> : null}
    </fieldset>
  );
}

function Rows({
  id,
  field,
  value,
  required,
  disabled,
  onChange,
}: {
  id: string;
  field: OnboardingField;
  value: OnboardingRow[];
  required: boolean;
  disabled: boolean;
  onChange: (rows: OnboardingRow[]) => void;
}) {
  const rows = value.length ? value : [{}];
  const blank = () => Object.fromEntries(field.columns.map((c) => [c.key, ''])) as OnboardingRow;
  const set = (i: number, key: string, next: string) =>
    onChange(rows.map((row, j) => (j === i ? { ...blank(), ...row, [key]: next } : row)));
  return (
    <fieldset className="border-border rounded-xl border p-3">
      <legend className={`${labelClass} px-1`}>
        {field.label}
        <Required on={required} />
      </legend>
      {field.hint ? <span className={`${help} mb-2`}>{field.hint}</span> : null}
      <div className="grid gap-3">
        {rows.map((row, i) => (
          <div key={i} className="border-border rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-ink text-xs font-bold">
                {field.label.replace(/s$/, '')} {i + 1}
              </span>
              {rows.length > 1 ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(rows.filter((_, j) => j !== i))}
                  className="text-danger text-xs font-bold underline"
                >
                  Remove
                </button>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {field.columns.map((col) => (
                <div key={col.key}>
                  <label htmlFor={`${id}-${i}-${col.key}`} className={labelClass}>
                    {col.label}
                    <Required on={required} />
                  </label>
                  <input
                    id={`${id}-${i}-${col.key}`}
                    type={col.type === 'date' ? 'date' : 'text'}
                    value={row[col.key] ?? ''}
                    placeholder={col.placeholder}
                    disabled={disabled}
                    onChange={(event) => set(i, col.key, event.target.value)}
                    className={`${input} mt-1.5`}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={disabled || rows.length >= 50}
        onClick={() => onChange([...rows, blank()])}
        className="border-border-strong text-ink mt-3 rounded-lg border px-3 py-1.5 text-sm font-bold"
      >
        Add {field.label.replace(/s$/, '').toLowerCase()}
      </button>
    </fieldset>
  );
}

function Field({
  idPrefix,
  field,
  answers,
  disabled,
  onChange,
}: {
  idPrefix: string;
  field: OnboardingField;
  answers: OnboardingAnswers;
  disabled: boolean;
  onChange: (key: string, value: OnboardingAnswers[string]) => void;
}) {
  const id = `${idPrefix}-${field.key}`;
  const required = isFieldRequired(field, answers);
  const raw = answers[field.key];
  const value = typeof raw === 'string' ? raw : '';
  if (field.type === 'yes_no')
    return (
      <YesNo
        id={id}
        field={field}
        value={value}
        required={required}
        disabled={disabled}
        onChange={(v) => onChange(field.key, v)}
      />
    );
  if (field.type === 'rows')
    return (
      <Rows
        id={id}
        field={field}
        value={Array.isArray(raw) ? raw : []}
        required={required}
        disabled={disabled}
        onChange={(rows) => onChange(field.key, rows)}
      />
    );
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {field.label}
        <Required on={required} />
      </label>
      {field.type === 'select' ? (
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(field.key, event.target.value)}
          className={`${input} mt-1.5`}
        >
          <option value="">Choose…</option>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.type === 'long_text' ? (
        <textarea
          id={id}
          value={value}
          rows={3}
          disabled={disabled}
          placeholder={field.placeholder ?? undefined}
          onChange={(event) => onChange(field.key, event.target.value)}
          className={`${input} mt-1.5`}
        />
      ) : field.key === 'map_pin' ? (
        <MapPinField
          id={id}
          value={value}
          disabled={disabled}
          placeholder={field.placeholder ?? undefined}
          className={input}
          onChange={(next) => onChange(field.key, next)}
        />
      ) : (
        <input
          id={id}
          type={field.type === 'date' ? 'date' : 'text'}
          {...(field.type === 'number' ? { inputMode: 'numeric' as const, maxLength: 4 } : {})}
          value={value}
          disabled={disabled}
          placeholder={field.placeholder ?? undefined}
          onChange={(event) =>
            onChange(
              field.key,
              // A number field keeps digits only: letters and symbols never land.
              field.type === 'number'
                ? event.target.value.replace(/[^0-9]/g, '')
                : event.target.value,
            )
          }
          className={`${input} mt-1.5`}
        />
      )}
      {field.hint ? <span className={help}>{field.hint}</span> : null}
    </div>
  );
}

export function OnboardingDetailsFields({
  idPrefix,
  fields,
  answers,
  onChange,
  disabled = false,
  categoryLabel,
}: {
  idPrefix: string;
  fields: OnboardingField[];
  answers: OnboardingAnswers;
  onChange: (answers: OnboardingAnswers) => void;
  disabled?: boolean;
  categoryLabel?: string | null;
}) {
  const set = (key: string, value: OnboardingAnswers[string]) =>
    onChange({ ...answers, [key]: value });
  return (
    <div className="grid gap-5">
      {ONBOARDING_SECTIONS.map((section) => {
        const shown = fields.filter((f) => f.section === section.key && isFieldShown(f, answers));
        if (!shown.length) return null;
        return (
          <section key={section.key} aria-labelledby={`${idPrefix}-${section.key}`}>
            <h4 id={`${idPrefix}-${section.key}`} className="text-ink mb-2 text-sm font-extrabold">
              {section.key === 'compliance' && categoryLabel
                ? `${section.title} · ${categoryLabel}`
                : section.title}
            </h4>
            <div className="grid gap-3">
              {shown.map((field) => (
                <Field
                  key={field.key}
                  idPrefix={idPrefix}
                  field={field}
                  answers={answers}
                  disabled={disabled}
                  onChange={set}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

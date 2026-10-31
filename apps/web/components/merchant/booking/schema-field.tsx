'use client';

import { useId } from 'react';

import { fromKenyaInput, humanize, localDateTime } from './format';
import { buttonClass, inputClass } from './panel';
import type { JsonSchema } from './types';

/** Render the typed onboarding schemas without exposing a JSON editor. */
export function SchemaField({
  label,
  schema,
  value,
  onChange,
  required = false,
  depth = 0,
}: {
  label: string;
  schema: JsonSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  required?: boolean;
  depth?: number;
}) {
  const id = useId();
  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') : schema.type;
  const options = schema.anyOf ?? schema.oneOf;
  const option = options?.find((s) => s.type !== 'null');
  if (option && !schema.type)
    return (
      <SchemaField
        label={label}
        schema={option}
        value={value}
        onChange={onChange}
        required={required}
        depth={depth}
      />
    );
  if (schema.const !== undefined) return null;
  if (depth > 6)
    return (
      <p className="text-muted text-sm">
        {label}: complete this detail with your business setup team.
      </p>
    );

  if (type === 'object' || schema.properties) {
    const object =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    return (
      <fieldset className="border-border space-y-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-bold">
          {label}
          {required ? ' *' : ''}
        </legend>
        {schema.description ? (
          <p className="text-muted text-xs leading-relaxed">{schema.description}</p>
        ) : null}
        {Object.entries(schema.properties ?? {}).map(([key, child]) => (
          <SchemaField
            key={key}
            label={child.title ?? humanize(key)}
            schema={child}
            value={object[key]}
            required={schema.required?.includes(key)}
            depth={depth + 1}
            onChange={(next) => onChange({ ...object, [key]: next })}
          />
        ))}
      </fieldset>
    );
  }

  if (type === 'array') {
    const values = Array.isArray(value) ? value : [];
    if (schema.items?.enum)
      return (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-bold">
            {label}
            {required ? ' *' : ''}
          </legend>
          {schema.items.enum.map((entry) => (
            <label key={String(entry)} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-ink h-4 w-4"
                checked={values.includes(entry)}
                onChange={(event) =>
                  onChange(
                    event.target.checked ? [...values, entry] : values.filter((x) => x !== entry),
                  )
                }
              />
              {humanize(String(entry))}
            </label>
          ))}
        </fieldset>
      );
    return (
      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-bold">
          {label}
          {required ? ' *' : ''}
        </legend>
        {values.map((entry, index) => (
          <div key={index} className="space-y-2">
            <SchemaField
              label={`${label} ${index + 1}`}
              schema={schema.items ?? { type: 'string' }}
              value={entry}
              onChange={(next) => onChange(values.map((v, i) => (i === index ? next : v)))}
              depth={depth + 1}
            />
            <button
              type="button"
              className="text-muted text-xs underline"
              onClick={() => onChange(values.filter((_, i) => i !== index))}
            >
              Remove {label.toLowerCase()} {index + 1}
            </button>
          </div>
        ))}
        <button
          type="button"
          className={buttonClass}
          disabled={schema.maxItems !== undefined && values.length >= schema.maxItems}
          onClick={() => onChange([...values, schema.items?.type === 'object' ? {} : ''])}
        >
          Add {label.toLowerCase()}
        </button>
      </fieldset>
    );
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-bold">
        {label}
        {required ? ' *' : ''}
      </label>
      {type === 'boolean' ? (
        <select
          id={id}
          className={inputClass}
          value={value === true ? 'yes' : value === false ? 'no' : ''}
          onChange={(event) =>
            onChange(event.target.value === '' ? undefined : event.target.value === 'yes')
          }
        >
          <option value="">Not answered</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      ) : schema.enum ? (
        <select
          id={id}
          className={inputClass}
          value={value === undefined ? '' : String(value)}
          onChange={(event) => onChange(event.target.value || undefined)}
        >
          <option value="">Choose an answer</option>
          {schema.enum.map((entry) => (
            <option key={String(entry)} value={String(entry)}>
              {humanize(String(entry))}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          className={inputClass}
          type={
            type === 'integer' || type === 'number'
              ? 'number'
              : schema.format === 'date'
                ? 'date'
                : schema.format === 'date-time'
                  ? 'datetime-local'
                  : 'text'
          }
          value={
            schema.format === 'date-time' && typeof value === 'string' && value
              ? localDateTime(value)
              : typeof value === 'string' || typeof value === 'number'
                ? value
                : ''
          }
          min={schema.minimum}
          max={schema.maximum}
          step={type === 'integer' ? 1 : type === 'number' ? 'any' : undefined}
          maxLength={schema.maxLength}
          onChange={(event) =>
            onChange(
              event.target.value === ''
                ? undefined
                : type === 'integer' || type === 'number'
                  ? Number(event.target.value)
                  : schema.format === 'date-time'
                    ? fromKenyaInput(event.target.value)
                    : event.target.value,
            )
          }
        />
      )}
      {schema.description ? (
        <p className="text-muted text-xs leading-relaxed">{schema.description}</p>
      ) : null}
    </div>
  );
}

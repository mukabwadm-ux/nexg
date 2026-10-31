'use client';

import { useState } from 'react';
import { fromKenyaInput, kenyaDateLabel, kenyaTime, localDateTime } from './format';
import { buttonClass, Field, inputClass, primaryClass } from './panel';
import type { BookingOccurrence, BookingOffering, BookingResource } from './types';

export function ManageItemForm({
  item,
  kind,
  disabled,
  error,
  onSave,
  onAddClosure,
  onAddOccurrence,
  onRemoveClosure,
}: {
  item: BookingOffering | BookingResource;
  kind: 'resource' | 'offering';
  disabled: boolean;
  error: string | null;
  onSave: (body: unknown) => Promise<void>;
  onAddClosure?: () => void;
  onAddOccurrence?: () => void;
  onRemoveClosure?: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState(item.name);
  const [active, setActive] = useState(item.active);
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({ name, active, expectedVersion: item.version ?? 1 });
      }}
    >
      <Field label="Name">
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={160}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="accent-ink"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
        Available for new bookings
      </label>
      <p className="text-muted text-xs leading-relaxed">
        Existing booking records stay in your history. Structural changes to capacity, pricing or
        fulfilment need a new {kind === 'resource' ? 'resource' : 'offering'} revision.
      </p>
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
      <button type="submit" className={primaryClass} disabled={disabled}>
        Save changes
      </button>
      {onAddClosure ? (
        <button
          type="button"
          className={`${buttonClass} ml-2`}
          disabled={disabled}
          onClick={onAddClosure}
        >
          Block unavailable time
        </button>
      ) : null}
      {onAddOccurrence ? (
        <button
          type="button"
          className={`${buttonClass} ml-2`}
          disabled={disabled}
          onClick={onAddOccurrence}
        >
          Add dated session
        </button>
      ) : null}
      {kind === 'resource' && (item as BookingResource).closures?.length ? (
        <section className="space-y-3 pt-3">
          <h3 className="text-sm font-bold">Unavailable periods</h3>
          {(item as BookingResource).closures!.map((closure) => (
            <div key={closure.id} className="border-border rounded-lg border p-3 text-xs">
              <p className="font-bold">{closure.reason}</p>
              <p className="text-muted mt-1">
                {kenyaDateLabel(closure.startTime)} · {kenyaTime(closure.startTime)} →{' '}
                {kenyaDateLabel(closure.endTime)} · {kenyaTime(closure.endTime)}
              </p>
              <button
                type="button"
                className="text-gold-text mt-2 font-bold underline"
                disabled={disabled}
                onClick={() => {
                  if (window.confirm('Remove this unavailable period and reopen its capacity?'))
                    void onRemoveClosure?.(closure.id);
                }}
              >
                Remove unavailable period
              </button>
            </div>
          ))}
        </section>
      ) : null}
    </form>
  );
}

export function DatedSessionForm({
  offering,
  occurrence,
  disabled,
  error,
  onSave,
}: {
  offering: BookingOffering;
  occurrence?: BookingOccurrence | null;
  disabled: boolean;
  error: string | null;
  onSave: (body: unknown) => Promise<void>;
}) {
  const [start, setStart] = useState(localDateTime(occurrence?.startTime ?? null));
  const [end, setEnd] = useState(localDateTime(occurrence?.endTime ?? null));
  const [published, setPublished] = useState(occurrence?.published ?? true);
  const [localError, setLocalError] = useState('');
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setLocalError('');
        const form = new FormData(event.currentTarget);
        try {
          void onSave({
            startTime: fromKenyaInput(start),
            endTime: fromKenyaInput(end),
            capacity: Number(form.get('capacity')),
            published,
            expectedVersion: offering.version ?? 1,
            ...(occurrence
              ? { occurrenceId: occurrence.id, expectedOccurrenceVersion: occurrence.version ?? 1 }
              : {}),
          });
        } catch (e) {
          setLocalError(e instanceof Error ? e.message : 'Review the session dates.');
        }
      }}
    >
      <p className="text-sm font-bold">{offering.name}</p>
      <Field label="Session start · EAT">
        <input
          type="datetime-local"
          className={inputClass}
          required
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </Field>
      <Field label="Session end · EAT">
        <input
          type="datetime-local"
          className={inputClass}
          required
          min={start}
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
      </Field>
      <Field label="Available places">
        <input
          name="capacity"
          type="number"
          className={inputClass}
          required
          min={1}
          max={100000}
          defaultValue={occurrence?.capacity}
        />
      </Field>
      <p className="text-muted text-xs leading-relaxed">
        This dated session uses the offering’s actual resource bundle. Capacity cannot exceed its
        configured place pool or conflict with another use of its instructor or resources.
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="accent-ink mt-0.5"
          checked={published}
          onChange={(event) => setPublished(event.target.checked)}
        />
        <span>Publish this actual dated session for customer bookings</span>
      </label>
      {occurrence ? (
        <p className="text-muted text-xs">
          A session with live attendees must be resolved before changing its date, resources,
          capacity or publication.
        </p>
      ) : null}
      {localError || error ? (
        <p role="alert" className="text-danger text-sm">
          {localError || error}
        </p>
      ) : null}
      <button type="submit" className={primaryClass} disabled={disabled}>
        {occurrence
          ? 'Save session changes'
          : published
            ? 'Publish dated session'
            : 'Save draft session'}
      </button>
    </form>
  );
}

export function ResourceClosureForm({
  resource,
  disabled,
  error,
  onSave,
}: {
  resource: BookingResource;
  disabled: boolean;
  error: string | null;
  onSave: (body: unknown) => Promise<void>;
}) {
  const [start, setStart] = useState(localDateTime(new Date().toISOString()));
  const [end, setEnd] = useState('');
  const [localError, setLocalError] = useState('');
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setLocalError('');
        const form = new FormData(event.currentTarget);
        try {
          void onSave({
            startTime: fromKenyaInput(start),
            endTime: fromKenyaInput(end),
            reason: form.get('reason'),
            expectedVersion: resource.version ?? 1,
          });
        } catch (e) {
          setLocalError(e instanceof Error ? e.message : 'Review the unavailable dates.');
        }
      }}
    >
      <p className="text-sm font-bold">{resource.name}</p>
      <Field label="Unavailable from · EAT">
        <input
          type="datetime-local"
          className={inputClass}
          required
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </Field>
      <Field label="Available again · EAT">
        <input
          type="datetime-local"
          className={inputClass}
          required
          min={start}
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
      </Field>
      <Field label="Reason">
        <textarea
          name="reason"
          className={inputClass}
          required
          minLength={3}
          maxLength={1000}
          rows={3}
        />
      </Field>
      <p className="text-muted text-xs leading-relaxed">
        Use this for leave, maintenance or another actual closure. A closure cannot silently replace
        a confirmed booking.
      </p>
      {localError || error ? (
        <p role="alert" className="text-danger text-sm">
          {localError || error}
        </p>
      ) : null}
      <button type="submit" className={primaryClass} disabled={disabled}>
        Block this time
      </button>
    </form>
  );
}

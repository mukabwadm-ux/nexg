'use client';

import * as React from 'react';

/**
 * The shape every partner server action returns.
 *
 * Declared here rather than imported from one portal's actions
 * file: this kit is used by the host portal and the merchant
 * portal, and a component reaching into `@/app/host/actions` to
 * borrow a type is how the two get coupled.
 */
export interface Outcome {
  ok: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

/**
 * The pieces every partner form is built from.
 *
 * One rule runs through all of them: the message a write comes
 * back with is the database's, shown verbatim. Those sentences
 * were written for a host on a phone — "This package needs 12
 * hours", "There are 3 bookings here still to come" — and a
 * form that replaced them with "Something went wrong" would
 * throw away the only part of the refusal worth reading.
 */

/* ════════════════════════════════════════════════ the drawer */

/**
 * A right-side drawer, or a full sheet on a phone.
 *
 * Open state lives in the URL on the pages where a form should
 * be linkable ("add your first unit" in an email), and in React
 * state where it should not. This component takes either.
 */
export function Drawer({
  open,
  onClose,
  title,
  lead,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  /* Escape closes it. A drawer that can only be dismissed by
     finding a small × is one people close by reloading. */
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-surface relative flex h-full w-full max-w-[32rem] flex-col overflow-y-auto shadow-2xl"
      >
        <div className="border-border bg-surface sticky top-0 z-10 flex items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            <h2 className="text-[1.0625rem] font-extrabold tracking-tight">{title}</h2>
            {lead ? (
              <p className="text-muted mt-1 text-[0.75rem] font-semibold leading-[1.6]">{lead}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-light hover:text-ink shrink-0 text-lg font-extrabold leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="flex-1 px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════ the fields */

export function Field({
  label,
  hint,
  children,
  wide,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="text-muted-light text-[0.6875rem] font-extrabold uppercase tracking-wide">
        {label}
      </span>
      <span className="mt-1.5 block">{children}</span>
      {hint ? (
        <span className="text-muted-light mt-1 block text-[0.6875rem] font-semibold leading-[1.5]">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

const INPUT =
  'border-border-strong bg-bg focus:border-ink w-full rounded-lg border px-3 py-2 text-[0.875rem] font-semibold outline-none transition-colors';

export function Text(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={INPUT} />;
}

export function Area(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} rows={props.rows ?? 3} className={`${INPUT} resize-y`} />;
}

export function Select({
  options,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  options: { value: string; label: string }[];
}) {
  return (
    <select {...props} className={INPUT}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

/* ════════════════════════════════════════════ submit and say */

/**
 * The submit button, and the one place a result is reported.
 *
 * `pending` disables it rather than hiding it, and the label
 * changes — a button that vanishes mid-save reads as a crash.
 */
export function Submit({
  children,
  pending,
  tone = 'ink',
  onClick,
  type = 'submit',
}: {
  children: React.ReactNode;
  pending?: boolean;
  tone?: 'ink' | 'danger' | 'quiet';
  onClick?: () => void;
  type?: 'submit' | 'button';
}) {
  const cls =
    tone === 'danger'
      ? 'bg-danger text-white'
      : tone === 'quiet'
        ? 'border-border-strong border text-ink'
        : 'bg-ink text-white';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={pending}
      className={`rounded-lg px-4 py-2.5 text-[0.8125rem] font-extrabold transition-opacity disabled:opacity-50 ${cls}`}
    >
      {pending ? 'Saving…' : children}
    </button>
  );
}

/** What the write said. Green, amber or red — never silent. */
export function Said({ outcome }: { outcome: Outcome | null }) {
  if (!outcome?.message) return null;
  return (
    <p
      role="status"
      className={`rounded-lg px-3 py-2.5 text-[0.75rem] font-semibold leading-[1.6] ${
        outcome.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
      }`}
    >
      {outcome.message}
    </p>
  );
}

/**
 * The hook every form uses.
 *
 * It keeps the pending flag and the last outcome together,
 * because the two are always read together and holding them in
 * two `useState`s is how a form ends up showing "Saving…" over
 * last attempt's error.
 */
export function useAction(): {
  pending: boolean;
  outcome: Outcome | null;
  run: (fn: () => Promise<Outcome>, onDone?: (o: Outcome) => void) => void;
  reset: () => void;
} {
  const [pending, setPending] = React.useState(false);
  const [outcome, setOutcome] = React.useState<Outcome | null>(null);

  const run = React.useCallback(
    (fn: () => Promise<Outcome>, onDone?: (o: Outcome) => void) => {
      setPending(true);
      setOutcome(null);
      void fn()
        .then((o) => {
          setOutcome(o);
          onDone?.(o);
        })
        .catch(() =>
          setOutcome({
            ok: false,
            /* A thrown action means the request never reached
               Postgres, which is a different problem from a
               refusal and should not read like one. */
            message: 'That did not reach us. Check your connection and try again.',
          }),
        )
        .finally(() => setPending(false));
    },
    [],
  );

  return { pending, outcome, run, reset: () => setOutcome(null) };
}

/** A row of buttons at the foot of a drawer. */
export function Actions({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 flex flex-wrap items-center gap-2">{children}</div>;
}

/**
 * A destructive action that asks for the name back.
 *
 * The database asks for it too and is the real check; this is
 * here so the host finds out before pressing rather than after.
 */
export function ConfirmByName({
  name,
  label,
  pending,
  onConfirm,
}: {
  name: string;
  label: string;
  pending?: boolean;
  onConfirm: (typed: string) => void;
}) {
  const [typed, setTyped] = React.useState('');
  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase();
  return (
    <div className="border-danger/40 bg-danger/5 space-y-3 rounded-xl border p-4">
      <p className="text-danger text-[0.8125rem] font-extrabold">{label}</p>
      <p className="text-muted text-[0.75rem] font-semibold leading-[1.6]">
        Type <span className="text-ink font-extrabold">{name}</span> to confirm.
      </p>
      <Text value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={name} />
      <Submit tone="danger" pending={pending} type="button" onClick={() => onConfirm(typed)}>
        {matches ? 'Remove it' : 'Type the name first'}
      </Submit>
    </div>
  );
}

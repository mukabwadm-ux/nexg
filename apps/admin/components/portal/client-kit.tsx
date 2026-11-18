'use client';

import {
  Button,
  cn,
  DateRangePicker,
  DetailPanel,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
  useToast,
} from '@nexg/ui';
import { Download, MoreHorizontal, Search, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { toCsv } from '@/lib/portal';

export interface Outcome {
  ok: boolean;
  message?: string;
}

/**
 * Runs a server action, says how it went in a toast, and refreshes the page
 * so every figure on it is re-read from the database.
 */
export function useRunner() {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [busy, setBusy] = React.useState(false);

  const run = React.useCallback(
    async (action: () => Promise<Outcome>, success?: string): Promise<boolean> => {
      setBusy(true);
      try {
        const r = await action();
        if (!r.ok) {
          toast({ tone: 'danger', title: 'Not saved', description: r.message });
          return false;
        }
        toast({ tone: 'success', title: success ?? r.message ?? 'Saved' });
        startTransition(() => router.refresh());
        return true;
      } catch {
        toast({
          tone: 'danger',
          title: 'Not saved',
          description:
            'The console could not reach the server. Check the connection and try again.',
        });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [router, toast],
  );

  return { run, busy: busy || pending };
}

/* ─────────────────────────────────────────────────────────── the period */

/** The header's period picker; it writes ?from=&to= and keeps the open view. */
export function RangeControl({
  from,
  to,
  showPreset = false,
  tone = 'dark',
}: {
  from: string;
  to: string;
  /** "Last 30 days (Nov 1 – Nov 30, 2026)" when the range is a preset. */
  showPreset?: boolean;
  /** Light when it sits on a white card rather than the black header. */
  tone?: 'dark' | 'light';
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <DateRangePicker
      tone={tone}
      showPreset={showPreset}
      value={{ from, to }}
      onChange={(r) => {
        const next = new URLSearchParams(params.toString());
        next.set('from', r.from);
        next.set('to', r.to);
        router.push(`${pathname}?${next.toString()}`);
      }}
    />
  );
}

/* ─────────────────────────────────────────────────────────── row menus */

export interface MenuAction {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  /** Draws a line above this item. */
  separated?: boolean;
  /** Opens a popover or drawer: the menu then leaves focus to it. */
  opensOverlay?: boolean;
}

/** The "…" on a row or card. Hidden entirely when nothing is allowed. */
export function ActionMenu({
  label,
  actions,
  className,
}: {
  label: string;
  actions: (MenuAction | false | null | undefined)[];
  className?: string;
}) {
  const items = actions.filter(Boolean) as MenuAction[];
  const handOff = React.useRef(false);
  if (items.length === 0) return null;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'text-muted hover:bg-bg hover:text-ink data-[state=open]:bg-bg data-[state=open]:text-ink flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
            'focus-visible:ring-gold focus-visible:outline-none focus-visible:ring-2',
            className,
          )}
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        onClick={(e) => e.stopPropagation()}
        onCloseAutoFocus={(e) => {
          if (handOff.current) e.preventDefault();
          handOff.current = false;
        }}
      >
        {items.map((a) => (
          <React.Fragment key={a.label}>
            {a.separated && <DropdownMenuSeparator />}
            <DropdownMenuItem
              icon={a.icon}
              tone={a.tone}
              disabled={a.disabled}
              onSelect={() => {
                handOff.current = Boolean(a.opensOverlay);
                a.onSelect();
              }}
            >
              {a.label}
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A small icon button for row actions (view, download). */
export function IconAction({
  label,
  onClick,
  children,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'text-muted hover:bg-bg hover:text-ink flex h-9 w-9 items-center justify-center rounded-lg transition-colors [&>svg]:h-[1.15rem] [&>svg]:w-[1.15rem]',
        'focus-visible:ring-gold focus-visible:outline-none focus-visible:ring-2 disabled:opacity-40',
      )}
    >
      {children}
    </button>
  );
}

/* ───────────────────────────────────────────────────────────── confirm */

/**
 * Asks before a step that is hard to take back, in place rather than in a
 * modal. With `reason`, the person has to say why (the RPC requires it).
 */
export function ConfirmAction({
  trigger,
  anchor,
  title,
  body,
  confirmLabel,
  tone = 'danger',
  reason,
  onConfirm,
  open: controlledOpen,
  onOpenChange,
}: {
  /** A button that opens it. */
  trigger?: React.ReactNode;
  /** Or what it hangs off when opened from elsewhere (a row's menu). */
  anchor?: React.ReactNode;
  title: string;
  body?: React.ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'black';
  reason?: { label: string; required?: boolean; placeholder?: string };
  onConfirm: (reason: string) => Promise<boolean | void>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [innerOpen, setInnerOpen] = React.useState(false);
  const open = controlledOpen ?? innerOpen;
  const setOpen = onOpenChange ?? setInnerOpen;
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const id = React.useId();

  React.useEffect(() => {
    if (!open) setText('');
  }, [open]);

  const blocked = Boolean(reason?.required && !text.trim());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {trigger ? (
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      ) : (
        <PopoverAnchor asChild>
          <span className="inline-flex">{anchor}</span>
        </PopoverAnchor>
      )}
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))]">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (blocked) return;
            setBusy(true);
            const done = await onConfirm(text.trim());
            setBusy(false);
            if (done !== false) setOpen(false);
          }}
        >
          <p className="text-[0.9375rem] font-extrabold">{title}</p>
          {body && <div className="text-muted mt-1 text-sm leading-relaxed">{body}</div>}
          {reason && (
            <div className="mt-3">
              <label htmlFor={id} className="text-sm font-bold">
                {reason.label}
                {reason.required && <span className="text-danger ml-0.5">*</span>}
              </label>
              <textarea
                id={id}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder={reason.placeholder}
                className="border-border-strong bg-surface placeholder:text-muted-light/70 focus:ring-gold mt-1.5 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
              />
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={tone === 'danger' ? 'danger' : 'black'}
              size="sm"
              loading={busy}
              disabled={blocked}
            >
              {confirmLabel}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/* ────────────────────────────────────────────────────────── list tools */

export function SearchBox({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  return (
    <label
      className={cn(
        'border-border-strong bg-surface focus-within:ring-gold flex h-11 min-w-0 items-center gap-2 rounded-xl border px-3 focus-within:ring-2',
        className,
      )}
    >
      <Search className="text-muted-light h-4 w-4 shrink-0" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="text-ink placeholder:text-muted-light/80 min-w-0 flex-1 bg-transparent text-base focus:outline-none md:text-sm [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="text-muted-light hover:text-ink rounded-full p-0.5"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </label>
  );
}

/** A compact native select for list filters ("All file types"). */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <label className={cn('relative block min-w-[8.5rem]', className)}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-border-strong bg-surface text-ink focus:ring-gold h-11 w-full min-w-0 cursor-pointer appearance-none rounded-xl border pl-3.5 pr-9 text-sm font-semibold focus:outline-none focus:ring-2"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="text-muted pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2"
      >
        <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    </label>
  );
}

/** Downloads rows as a CSV file built in the browser from what is shown. */
export function ExportButton({
  filename,
  rows,
  label = 'Export',
}: {
  filename: string;
  rows: () => (string | number | null | undefined)[][];
  label?: string;
}) {
  return (
    <Button
      variant="gold"
      size="md"
      leadingIcon={<Download className="h-4 w-4" />}
      onClick={() => {
        /* A byte-order mark first, so Excel reads the file as UTF-8. */
        const blob = new Blob([String.fromCharCode(0xfeff), toCsv(rows())], {
          type: 'text/csv;charset=utf-8',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}
    >
      {label}
    </Button>
  );
}

/* ─────────────────────────────────────────────────────────── form panel */

/**
 * A form in the console's side drawer: title, fields, and Cancel / Save at
 * the foot. `onSubmit` returns true when it worked, which closes the drawer.
 */
export function FormPanel({
  open,
  onOpenChange,
  title,
  subtitle,
  submitLabel,
  busy,
  onSubmit,
  children,
  width = 'md',
  danger,
  secondary,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  submitLabel: string;
  busy?: boolean;
  onSubmit: () => Promise<boolean>;
  children: React.ReactNode;
  width?: 'md' | 'lg';
  danger?: boolean;
  /** A second way to submit the same form, such as "Save as draft". */
  secondary?: { label: string; onSubmit: () => Promise<boolean> };
}) {
  const formId = React.useId();
  const intent = React.useRef<'primary' | 'secondary'>('primary');
  return (
    <DetailPanel
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      subtitle={subtitle}
      width={width}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {secondary && (
            <Button
              type="submit"
              form={formId}
              variant="outline"
              disabled={busy}
              onClick={() => (intent.current = 'secondary')}
            >
              {secondary.label}
            </Button>
          )}
          <Button
            type="submit"
            form={formId}
            variant={danger ? 'danger' : 'black'}
            loading={busy}
            onClick={() => (intent.current = 'primary')}
          >
            {submitLabel}
          </Button>
        </div>
      }
    >
      <form
        id={formId}
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const submit =
            intent.current === 'secondary' && secondary ? secondary.onSubmit : onSubmit;
          intent.current = 'primary';
          if (await submit()) onOpenChange(false);
        }}
      >
        {children}
      </form>
    </DetailPanel>
  );
}

/* ──────────────────────────────────────────────────────── plain fields */

const control =
  'border-border-strong bg-surface text-ink placeholder:text-muted-light/70 focus:ring-gold w-full rounded-lg border px-3 text-base focus:outline-none focus:ring-2 md:text-sm disabled:bg-border/40 disabled:text-muted-light';

export function TextField({
  label,
  hint,
  required,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = React.useId();
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-bold">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </label>
      <input
        id={id}
        required={required}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={cn(control, 'h-11')}
        {...props}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-muted-light text-xs">
          {hint}
        </p>
      )}
    </div>
  );
}

export function TextArea({
  label,
  hint,
  required,
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  const id = React.useId();
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-bold">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </label>
      <textarea
        id={id}
        required={required}
        rows={3}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={cn(control, 'py-2.5')}
        {...props}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-muted-light text-xs">
          {hint}
        </p>
      )}
    </div>
  );
}

export function SelectField({
  label,
  hint,
  required,
  options,
  placeholder,
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  const id = React.useId();
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-bold">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </label>
      <div className="relative">
        <select
          id={id}
          required={required}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={cn(control, 'h-11 cursor-pointer appearance-none pr-9')}
          {...props}
        >
          {placeholder != null && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="text-muted pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2"
        >
          <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="text-muted-light text-xs">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Two fields side by side from a phone's width up. */
export function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

/** KES typed in shillings, stored in cents. Empty stays empty. */
export function toCents(value: string): number | null {
  const clean = value.replace(/[,\s]/g, '');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
}

export function fromCents(cents: number | null | undefined): string {
  return cents == null ? '' : String(Math.round(cents) / 100);
}

/** A list that shows its first `step` rows and a Show more button. */
export function useShowMore<T>(rows: T[], step = 25) {
  const [limit, setLimit] = React.useState(step);
  React.useEffect(() => setLimit(step), [rows.length, step]);
  return {
    shown: rows.slice(0, limit),
    more:
      rows.length > limit ? (
        <div className="flex justify-center pt-3">
          <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + step)}>
            Show {Math.min(step, rows.length - limit)} more
            {rows.length - limit > step ? ` of ${rows.length - limit}` : ''}
          </Button>
        </div>
      ) : null,
  };
}

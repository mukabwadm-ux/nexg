'use client';

import {
  Box,
  Check,
  ChevronUp,
  CircleHelp,
  Clock,
  CreditCard,
  FileText,
  MapPin,
  PauseCircle,
  Pencil,
  PlayCircle,
  Store,
  Users,
} from 'lucide-react';
import * as React from 'react';

export type HomeSetupRowStatus = 'complete' | 'missing' | 'provided' | 'waiting' | 'invalid';
export type HomeSetupIcon =
  | 'business'
  | 'hours'
  | 'team'
  | 'offerings'
  | 'documents'
  | 'payout'
  | 'launch'
  | 'specialty'
  | 'location';

export interface HomeSetupRow {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  status: HomeSetupRowStatus;
  statusLabel?: string;
  onAction?: () => void;
  icon?: HomeSetupIcon;
  required?: boolean;
  /** Allows a host to wrap its action in a drawer or a link. */
  renderAction?: React.ReactNode;
  /** Accessible name for the pencil edit button; defaults to actionLabel. */
  editLabel?: string;
  /**
   * Grouped rows (for example one per selected business category). The row's
   * pencil expands them inline, each with its own status and action.
   */
  subRows?: HomeSetupRow[];
  /** Shown under the expanded subRows, e.g. a link to change the selection. */
  subRowsFooter?: React.ReactNode;
}

export interface HomeSetupStatusItem {
  value: string;
  note: string;
}

export interface HomeSetupStatus {
  business?: HomeSetupStatusItem;
  location?: HomeSetupStatusItem;
  acceptingWork?: HomeSetupStatusItem;
}

export interface HomeSetupViewProps {
  businessName: string;
  rows: HomeSetupRow[];
  previewLabel?: string;
  reviewState?: 'setup' | 'review' | 'changes';
  status?: HomeSetupStatus;
  onLocation?: () => void;
  onHelp?: () => void;
  headerNotice?: React.ReactNode;
  footer?: React.ReactNode;
  greeting?: string;
  locationAction?: React.ReactNode;
  helpAction?: React.ReactNode;
}

const rowIcons = {
  business: Store,
  hours: Clock,
  team: Users,
  offerings: Box,
  documents: FileText,
  payout: CreditCard,
  launch: PlayCircle,
  specialty: Box,
  location: MapPin,
};

/** Shared Home presentation. Routing, account data and drawers belong to its host. */
export function HomeSetupView({
  businessName,
  rows,
  previewLabel,
  reviewState = 'setup',
  status,
  onLocation,
  onHelp,
  headerNotice,
  footer,
  greeting,
  locationAction,
  helpAction,
}: HomeSetupViewProps) {
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(() => new Set());
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const requiredRows = rows.filter((row) => row.required !== false);
  const completed = requiredRows.filter((row) => row.status === 'complete').length;
  const total = requiredRows.length;
  const remaining = total - completed;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  const review = reviewState === 'review';
  const changes = reviewState === 'changes';
  const business = status?.business ?? {
    value: review ? 'Under review' : changes ? 'Changes needed' : 'Setting up',
    note: review
      ? 'Your submitted information is being reviewed.'
      : changes
        ? 'Your submitted information needs updates.'
        : 'Complete your setup to go live.',
  };
  const location = status?.location ?? {
    value: previewLabel ? 'Not visible' : 'Setup in progress',
    note: previewLabel ? 'Your location is not visible yet.' : 'Check your location details below.',
  };
  const acceptingWork = status?.acceptingWork ?? {
    value: 'Not yet',
    note: 'Complete setup to start receiving work.',
  };

  return (
    <main className="mx-auto w-full max-w-[100rem] space-y-2.5 px-4 py-2.5 sm:px-6 lg:px-7">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-[22px] font-extrabold leading-tight tracking-tight sm:text-[24px]">
            {changes
              ? 'One document needs your attention'
              : `${greeting ?? 'Welcome'}, ${businessName}`}
          </h1>
          <p className="text-muted mt-0.5 text-[12px]">Let’s get your business set up.</p>
        </div>
        {previewLabel ? (
          <span className="bg-gold-soft text-gold-text rounded-full px-3 py-1 text-xs font-bold">
            {previewLabel}
          </span>
        ) : null}
      </header>

      {headerNotice}

      <section
        aria-label="Business status"
        className="border-border bg-surface grid gap-3 rounded-xl border px-4 py-3 sm:grid-cols-3 sm:gap-0"
      >
        <SetupStatus icon={Store} label="Business" {...business} />
        <SetupStatus icon={MapPin} label="Location" {...location} divider />
        <SetupStatus icon={PauseCircle} label="Accepting work" {...acceptingWork} divider />
      </section>

      <section
        className="border-border bg-surface overflow-hidden rounded-xl border"
        aria-labelledby="setup-title"
      >
        <div className="bg-ink flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-white">
          <div>
            <h2 id="setup-title" className="text-base font-extrabold">
              {review
                ? 'Your business is under review'
                : changes
                  ? 'Review and update your documents'
                  : 'Finish setting up to go live'}
            </h2>
            <p className="mt-0.5 text-xs text-white/70">
              {review
                ? 'Your submitted information is being reviewed.'
                : changes
                  ? 'One submitted document needs your attention.'
                  : 'Complete the remaining steps to get ready.'}
            </p>
          </div>
          {review || changes ? (
            <span className="rounded-lg bg-blue-100 px-3 py-2 text-xs font-bold text-blue-900">
              {review ? 'Submitted · awaiting review' : 'Submitted · changes needed'}
            </span>
          ) : (
            <div className="min-w-[180px] text-xs">
              <p>
                {completed} of {total} completed · {remaining} remaining
              </p>
              <div className="mt-2 flex items-center gap-2">
                <div
                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20"
                  role="progressbar"
                  aria-label="Setup progress"
                  aria-valuemin={0}
                  aria-valuemax={total}
                  aria-valuenow={completed}
                >
                  <div
                    className="bg-gold h-full rounded-full"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="text-gold font-bold">{percentage}%</span>
              </div>
            </div>
          )}
        </div>
        <ol className="divide-border divide-y px-3">
          {rows.map((row, index) => {
            const Icon = rowIcons[row.icon ?? 'business'];
            const grouped = Boolean(row.subRows?.length);
            const open = grouped && expanded.has(row.id);
            const panelId = `setup-row-${row.id.replace(/[^a-z0-9_-]/gi, '-')}-items`;
            // A grouped row's pencil opens its items inline instead of navigating.
            const shown: HomeSetupRow = grouped ? { ...row, onAction: () => toggle(row.id) } : row;
            return (
              <li key={row.id} className="py-1.5">
                <div className="grid min-h-[48px] grid-cols-[30px_24px_1fr_auto] items-center gap-2 sm:grid-cols-[30px_24px_140px_1fr_145px]">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${numberColors[row.status]}`}
                  >
                    {index + 1}
                  </span>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="text-xs font-extrabold">{row.title}</span>
                  <span className="text-muted col-start-3 text-xs sm:col-auto">
                    {row.description}
                  </span>
                  {row.renderAction !== undefined ? (
                    row.renderAction
                  ) : (
                    <RowAction
                      row={shown}
                      expanded={grouped ? open : undefined}
                      controls={grouped ? panelId : undefined}
                    />
                  )}
                </div>
                {open ? (
                  <div
                    id={panelId}
                    className="border-border bg-canvas mb-1 ml-0 mt-2 rounded-lg border sm:ml-[62px]"
                  >
                    <ul className="divide-border divide-y">
                      {row.subRows!.map((item) => (
                        <li
                          key={item.id}
                          className="grid grid-cols-[1fr_auto] items-center gap-2 px-3 py-2 sm:grid-cols-[180px_1fr_145px]"
                        >
                          <span className="text-xs font-extrabold">{item.title}</span>
                          <span className="text-muted col-start-1 text-xs sm:col-auto">
                            {item.description}
                          </span>
                          {item.renderAction !== undefined ? (
                            item.renderAction
                          ) : (
                            <RowAction row={item} />
                          )}
                        </li>
                      ))}
                    </ul>
                    {row.subRowsFooter ? (
                      <div className="border-border border-t px-3 py-2">{row.subRowsFooter}</div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {locationAction ?? (
          <button
            type="button"
            onClick={onLocation}
            disabled={!onLocation}
            className="border-border bg-surface flex items-center gap-3 rounded-xl border p-3 text-left focus-visible:outline focus-visible:outline-2 disabled:cursor-default"
          >
            <MapPin className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-extrabold">Your location</span>
              <span className="text-muted block text-xs">View your location details.</span>
            </span>
            <span className="bg-gold-soft text-gold-text rounded-full px-3 py-1 text-xs font-bold">
              {location.value}
            </span>
          </button>
        )}
        {helpAction ?? (
          <button
            type="button"
            onClick={onHelp}
            disabled={!onHelp}
            className="border-border bg-surface flex items-center gap-3 rounded-xl border p-3 text-left focus-visible:outline focus-visible:outline-2 disabled:cursor-default"
          >
            <CircleHelp className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-extrabold">Need help?</span>
              <span className="text-muted block text-xs">Get support with your setup.</span>
            </span>
            <span className="bg-gold text-ink rounded-lg px-3 py-2 text-xs font-bold">
              Contact support →
            </span>
          </button>
        )}
      </div>

      {footer}
    </main>
  );
}

const numberColors: Record<HomeSetupRowStatus, string> = {
  complete: 'bg-green-100 text-green-800',
  waiting: 'bg-gray-100 text-gray-600',
  invalid: 'bg-red-100 text-red-800',
  provided: 'bg-blue-100 text-blue-900',
  missing: 'bg-orange-100 text-amber-900',
};

const pillColors: Record<HomeSetupRowStatus, string> = {
  complete: 'bg-green-600 text-white',
  provided: 'bg-blue-100 text-blue-900',
  invalid: 'bg-red-100 text-red-800',
  waiting: 'bg-gray-100 text-gray-600',
  missing: 'bg-gold-soft text-gold-text',
};

/** A waiting row whose label only restates what its button does ("Add when needed"). */
function labelIsInstruction(row: HomeSetupRow) {
  return (
    !row.statusLabel ||
    row.statusLabel === row.actionLabel ||
    /^(add|set up|choose)\b/i.test(row.statusLabel)
  );
}

/**
 * One control per row, never the same words twice:
 * - something to do: a single button ("Add offerings →");
 * - something saved or pending: a status pill, plus a pencil to edit when the row is editable.
 */
function RowAction({
  row,
  expanded,
  controls,
}: {
  row: HomeSetupRow;
  expanded?: boolean;
  controls?: string;
}) {
  const cell = 'col-start-4 flex items-center justify-end gap-1.5 sm:col-auto sm:justify-start';
  if (
    row.onAction &&
    (row.status === 'missing' || (row.status === 'waiting' && labelIsInstruction(row)))
  ) {
    const tone =
      row.status === 'missing' ? 'bg-gold text-ink' : 'border-border text-ink border bg-surface';
    return (
      <div className={cell}>
        <button
          type="button"
          onClick={row.onAction}
          className={`${tone} w-full rounded-lg px-2 py-2 text-xs font-bold focus-visible:outline focus-visible:outline-2`}
        >
          {row.actionLabel} →
        </button>
      </div>
    );
  }
  const complete = row.status === 'complete';
  const label =
    row.statusLabel ??
    (complete
      ? 'Completed'
      : row.status === 'provided'
        ? 'Provided · awaiting review'
        : row.status === 'invalid'
          ? 'Needs changes'
          : row.status === 'missing'
            ? row.actionLabel
            : 'Pending');
  const Toggle = expanded ? ChevronUp : Pencil;
  return (
    <div className={cell}>
      <span
        className={`inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-full px-2 py-1.5 text-center text-xs font-bold ${pillColors[row.status]}`}
      >
        {complete ? <Check className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
        {label}
      </span>
      {row.onAction ? (
        <button
          type="button"
          onClick={row.onAction}
          aria-label={row.editLabel ?? row.actionLabel}
          title={row.editLabel ?? row.actionLabel}
          aria-expanded={expanded}
          aria-controls={controls}
          className="border-border text-ink hover:bg-gold-soft bg-surface flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border focus-visible:outline focus-visible:outline-2"
        >
          <Toggle className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function SetupStatus({
  icon: Icon,
  label,
  value,
  note,
  divider,
}: HomeSetupStatusItem & { icon: typeof Store; label: string; divider?: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 ${divider ? 'sm:border-border sm:border-l sm:pl-4' : ''}`}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-extrabold">{label}</span>
          <span className="bg-gold-soft text-gold-text rounded-full px-2.5 py-1 text-xs font-bold">
            {value}
          </span>
        </div>
        <p className="text-muted mt-1 text-xs">{note}</p>
      </div>
    </div>
  );
}

import {
  Box,
  Check,
  CircleHelp,
  Clock,
  CreditCard,
  FileText,
  MapPin,
  PauseCircle,
  PlayCircle,
  Store,
  Users,
} from 'lucide-react';
import * as React from 'react';

export type HomeSetupRowStatus = 'complete' | 'missing' | 'provided' | 'waiting' | 'invalid';
export type HomeSetupIcon = 'business' | 'hours' | 'team' | 'offerings' | 'documents' | 'payout' | 'launch' | 'specialty' | 'location';

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
  const requiredRows = rows.filter((row) => row.required !== false);
  const completed = requiredRows.filter((row) => row.status === 'complete').length;
  const total = requiredRows.length;
  const remaining = total - completed;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  const review = reviewState === 'review';
  const changes = reviewState === 'changes';
  const business = status?.business ?? {
    value: review ? 'Under review' : changes ? 'Changes needed' : 'Setting up',
    note: review ? 'Your submitted information is being reviewed.' : changes ? 'Your submitted information needs updates.' : 'Complete your setup to go live.',
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
          <h1 className="text-[22px] font-extrabold leading-tight tracking-tight sm:text-[24px]">{changes ? 'One document needs your attention' : `${greeting ?? 'Welcome'}, ${businessName}`}</h1>
          <p className="text-muted mt-0.5 text-[12px]">Let’s get your business set up.</p>
        </div>
        {previewLabel ? <span className="bg-gold-soft text-gold-text rounded-full px-3 py-1 text-xs font-bold">{previewLabel}</span> : null}
      </header>

      {headerNotice}

      <section aria-label="Business status" className="border-border bg-surface grid gap-3 rounded-xl border px-4 py-3 sm:grid-cols-3 sm:gap-0">
        <SetupStatus icon={Store} label="Business" {...business} />
        <SetupStatus icon={MapPin} label="Location" {...location} divider />
        <SetupStatus icon={PauseCircle} label="Accepting work" {...acceptingWork} divider />
      </section>

      <section className="border-border bg-surface overflow-hidden rounded-xl border" aria-labelledby="setup-title">
        <div className="bg-ink flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-white">
          <div>
            <h2 id="setup-title" className="text-base font-extrabold">{review ? 'Your business is under review' : changes ? 'Review and update your documents' : 'Finish setting up to go live'}</h2>
            <p className="mt-0.5 text-xs text-white/70">{review ? 'Your submitted information is being reviewed.' : changes ? 'One submitted document needs your attention.' : 'Complete the remaining steps to get ready.'}</p>
          </div>
          {review || changes ? (
            <span className="rounded-lg bg-blue-100 px-3 py-2 text-xs font-bold text-blue-900">{review ? 'Submitted · awaiting review' : 'Submitted · changes needed'}</span>
          ) : (
            <div className="min-w-[180px] text-xs">
              <p>{completed} of {total} completed · {remaining} remaining</p>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={completed}>
                  <div className="bg-gold h-full rounded-full" style={{ width: `${percentage}%` }} />
                </div>
                <span className="text-gold font-bold">{percentage}%</span>
              </div>
            </div>
          )}
        </div>
        <ol className="divide-border divide-y px-3">
          {rows.map((row, index) => {
            const Icon = rowIcons[row.icon ?? 'business'];
            const numberColor = row.status === 'complete' ? 'bg-green-100 text-green-800' : row.status === 'waiting' ? 'bg-gray-100 text-gray-600' : row.status === 'invalid' ? 'bg-red-100 text-red-800' : row.status === 'provided' ? 'bg-blue-100 text-blue-900' : 'bg-orange-100 text-amber-900';
            return (
              <li key={row.id} className="grid min-h-[48px] grid-cols-[30px_24px_1fr_auto] items-center gap-2 py-1.5 sm:grid-cols-[30px_24px_140px_1fr_145px]">
                <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${numberColor}`}>{index + 1}</span>
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs font-extrabold">{row.title}</span>
                <span className="text-muted col-start-3 text-xs sm:col-auto">{row.description}</span>
                {row.renderAction !== undefined ? row.renderAction : <RowAction row={row} />}
              </li>
            );
          })}
        </ol>
      </section>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {locationAction ?? (
          <button type="button" onClick={onLocation} disabled={!onLocation} className="border-border bg-surface flex items-center gap-3 rounded-xl border p-3 text-left focus-visible:outline focus-visible:outline-2 disabled:cursor-default">
            <MapPin className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1"><span className="block text-sm font-extrabold">Your location</span><span className="text-muted block text-xs">View your location details.</span></span>
            <span className="bg-gold-soft text-gold-text rounded-full px-3 py-1 text-xs font-bold">{location.value}</span>
          </button>
        )}
        {helpAction ?? (
          <button type="button" onClick={onHelp} disabled={!onHelp} className="border-border bg-surface flex items-center gap-3 rounded-xl border p-3 text-left focus-visible:outline focus-visible:outline-2 disabled:cursor-default">
            <CircleHelp className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1"><span className="block text-sm font-extrabold">Need help?</span><span className="text-muted block text-xs">Get support with your setup.</span></span>
            <span className="bg-gold text-ink rounded-lg px-3 py-2 text-xs font-bold">Contact support →</span>
          </button>
        )}
      </div>

      {footer}
    </main>
  );
}

function RowAction({ row }: { row: HomeSetupRow }) {
  const action = <button type="button" onClick={row.onAction} disabled={!row.onAction} className="bg-gold text-ink rounded-lg px-2 py-2 text-xs font-bold focus-visible:outline focus-visible:outline-2 disabled:cursor-default disabled:opacity-60">{row.actionLabel} →</button>;
  if (row.status === 'complete' || row.status === 'waiting') {
    const complete = row.status === 'complete';
    const badgeClass = complete ? 'inline-flex items-center justify-center gap-1 rounded-full bg-green-100 px-2 py-1.5 text-xs font-bold text-green-800' : 'rounded-lg bg-gray-100 px-2 py-2 text-center text-xs text-gray-600';
    const badge = <span className={`${row.onAction ? '' : 'col-start-4 sm:col-auto '}${badgeClass}`}>{complete ? <Check className="h-3 w-3" aria-hidden="true" /> : null}{row.statusLabel ?? (complete ? 'Completed' : 'Pending')}</span>;
    return row.onAction ? <div className="col-start-4 grid gap-1 sm:col-auto">{badge}{action}</div> : badge;
  }
  const label = row.statusLabel ?? (row.status === 'provided' ? 'Provided · awaiting review' : row.status === 'invalid' ? 'Needs changes' : undefined);
  return (
    <div className="col-start-4 grid gap-1 sm:col-auto">
      {label ? <span className={`rounded-lg px-2 py-1 text-center text-xs font-bold ${row.status === 'invalid' ? 'bg-red-100 text-red-800' : 'bg-gold-soft text-gold-text'}`}>{label}</span> : null}
      {row.status !== 'provided' || row.onAction ? action : null}
    </div>
  );
}

function SetupStatus({ icon: Icon, label, value, note, divider }: HomeSetupStatusItem & { icon: typeof Store; label: string; divider?: boolean }) {
  return <div className={`flex items-center gap-3 ${divider ? 'sm:border-border sm:border-l sm:pl-4' : ''}`}><Icon className="h-5 w-5 shrink-0" aria-hidden="true" /><div><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-extrabold">{label}</span><span className="bg-gold-soft text-gold-text rounded-full px-2.5 py-1 text-xs font-bold">{value}</span></div><p className="text-muted mt-1 text-xs">{note}</p></div></div>;
}

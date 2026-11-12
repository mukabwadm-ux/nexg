'use client';

import { cn } from '@nexg/ui';
import { AlertCircle, CheckCircle2, CircleDashed, FileUp, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { type OwnerType, type UploadProgress, uploadDocument } from '@/lib/uploads';

import { day } from './bits';
import { useLive } from './use-live';

export interface Requirement {
  id: string;
  kind: string;
  label: string;
  help_text: string | null;
  why_text: string | null;
  has_expiry: boolean;
  essential: boolean;
  sort: number;
}

export interface OnFile {
  requirement_id: string;
  status: string;
  rejection_reason: string | null;
  expires_at: string | null;
  side: string | null;
  created_at: string;
}

export interface Asked {
  requirement_id: string;
  note: string | null;
}

/** On file and fine (green), or still needed (red). Uploaded counts as on file. */
const ON_FILE = new Set(['uploaded', 'verified']);

const WORD: Record<string, string> = {
  verified: 'Checked',
  uploaded: 'Uploaded · being checked',
  rejected: 'Send another',
  expired: 'Out of date',
};

type SideState =
  | { kind: 'idle' }
  | { kind: 'working'; progress: UploadProgress }
  | { kind: 'sent' }
  | { kind: 'failed'; message: string };

/** Keeps the page in step with the database: live where Realtime carries it, and a quiet poll. */
function useDocumentsLive(ownerId: string) {
  const router = useRouter();
  useLive([{ schema: 'public', table: 'document', filter: `owner_id=eq.${ownerId}` }]);
  React.useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const timer = window.setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [router]);
}

/**
 * Documents, for a merchant or a rider.
 *
 * One component for both, because the job is identical and two copies would
 * drift. What differs is only the list of requirements, which the database
 * already answers per owner.
 *
 * Each row uploads on its own, the moment it has what it needs, and shows
 * the upload as it happens: checking, a percentage while the bytes go, then
 * saving. A row is green once its document is on file and red while it is
 * still needed, so what is left is obvious at a glance; the summary above
 * lists exactly that. A partner on a phone in bad signal should not lose five
 * files because the sixth failed.
 *
 * Rejected first, then still wanted, then everything settled: the rejected
 * one has a sentence attached telling them exactly what to do.
 */
export function Documents({
  ownerType,
  ownerId,
  requirements,
  onFile,
  asked,
  onUploaded,
}: {
  ownerType: OwnerType;
  ownerId: string;
  requirements: Requirement[];
  onFile: OnFile[];
  asked: Asked[];
  onUploaded?: () => void;
}) {
  const router = useRouter();
  useDocumentsLive(ownerId);
  const [sides, setSides] = React.useState<Record<string, SideState>>({});
  const [dates, setDates] = React.useState<Record<string, string>>({});
  const [dateErrors, setDateErrors] = React.useState<Record<string, string>>({});

  const latest = React.useMemo(() => {
    const map = new Map<string, OnFile>();
    for (const d of onFile) {
      const key = `${d.requirement_id}:${d.side ?? '-'}`;
      const prev = map.get(key);
      if (!prev || new Date(d.created_at) > new Date(prev.created_at)) map.set(key, d);
    }
    return map;
  }, [onFile]);

  const askedFor = new Set(asked.map((a) => a.requirement_id));
  const sideKeys = (r: Requirement) => (r.kind === 'national_id' ? ['front', 'back'] : ['-']);

  /* What a side shows: a fresh upload from this screen wins over the last read. */
  const statusOf = (r: Requirement, side: string) =>
    sides[`${r.kind}:${side}`]?.kind === 'sent'
      ? 'uploaded'
      : latest.get(`${r.id}:${side}`)?.status;

  const rowOnFile = (r: Requirement) =>
    sideKeys(r).every((side) => ON_FILE.has(statusOf(r, side) ?? ''));

  const rank = (r: Requirement) => {
    const states = sideKeys(r).map((side) => statusOf(r, side));
    if (states.some((s) => s === 'rejected' || s === 'expired')) return 0;
    if (states.some((s) => s === undefined)) return r.essential ? 1 : 2;
    if (states.some((s) => s === 'uploaded')) return 3;
    return 4;
  };
  const ordered = [...requirements].sort((a, b) => rank(a) - rank(b) || a.sort - b.sort);

  const required = requirements.filter((r) => r.essential);
  const requiredDone = required.filter(rowOnFile).length;
  const pending = required.filter((r) => !rowOnFile(r));
  const share = required.length ? Math.round((requiredDone / required.length) * 100) : 100;

  async function send(req: Requirement, file: File, side: string) {
    const key = `${req.kind}:${side}`;
    if (req.has_expiry && !(dates[req.kind] ?? latest.get(`${req.id}:-`)?.expires_at)) {
      setDateErrors((e) => ({ ...e, [req.kind]: 'Put the expiry date in first.' }));
      return;
    }
    setDateErrors((e) => ({ ...e, [req.kind]: '' }));
    setSides((s) => ({ ...s, [key]: { kind: 'working', progress: { stage: 'checking' } } }));

    const expiry = dates[req.kind] ?? latest.get(`${req.id}:-`)?.expires_at?.slice(0, 10) ?? null;
    const r = await uploadDocument({
      ownerType,
      ownerId,
      kind: req.kind,
      file,
      expiresAt: req.has_expiry ? expiry : null,
      ...(side === '-' ? {} : { side: side as 'front' | 'back' }),
      onProgress: (progress) => setSides((s) => ({ ...s, [key]: { kind: 'working', progress } })),
    });

    if (!r.ok) {
      setSides((s) => ({
        ...s,
        [key]: { kind: 'failed', message: r.message ?? 'That did not go through. Try again.' },
      }));
      return;
    }
    setSides((s) => ({ ...s, [key]: { kind: 'sent' } }));
    onUploaded?.();
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* ───────────────────────────── what is done and what is left */}
      <section
        aria-label="Document progress"
        className={cn(
          'rounded-2xl border p-5 transition-colors duration-500',
          pending.length === 0 ? 'border-success/30 bg-success-bg' : 'border-border bg-surface',
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-full transition-colors duration-500',
                pending.length === 0 ? 'bg-success text-white' : 'bg-danger-bg text-danger',
              )}
            >
              {pending.length === 0 ? (
                <CheckCircle2 className="animate-doc-pop h-6 w-6" />
              ) : (
                <FileUp className="h-5 w-5" />
              )}
            </span>
            <div>
              <p className="text-[0.9375rem] font-extrabold">
                {pending.length === 0
                  ? 'All required documents are uploaded'
                  : `${pending.length} required document${pending.length === 1 ? '' : 's'} still to upload`}
              </p>
              <p className="text-muted text-[0.8125rem] font-semibold">
                {requiredDone} of {required.length} required uploaded
                {requirements.length > required.length &&
                  ` · ${requirements.length - required.length} optional`}
              </p>
            </div>
          </div>
          <span className="text-lg font-extrabold tabular-nums" aria-hidden="true">
            {share}%
          </span>
        </div>

        <div
          role="progressbar"
          aria-label="Required documents uploaded"
          aria-valuemin={0}
          aria-valuemax={required.length}
          aria-valuenow={requiredDone}
          className="bg-bg mt-4 h-2.5 overflow-hidden rounded-full"
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-700 ease-out',
              pending.length === 0 ? 'bg-success' : 'bg-gold',
            )}
            style={{ width: `${share}%` }}
          />
        </div>

        {pending.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Still to upload">
            {pending.map((r) => (
              <li key={r.id}>
                <a
                  href={`#doc-${r.kind}`}
                  className="bg-danger-bg text-danger hover:ring-danger/40 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition hover:ring-2"
                >
                  <AlertCircle aria-hidden="true" className="h-3.5 w-3.5" />
                  {r.label}
                </a>
              </li>
            ))}
          </ul>
        )}

        <p className="text-muted mt-4 text-[0.8125rem] font-semibold">
          Send a clear photo of the whole thing: all four corners in frame, flat, in daylight. Most
          of what comes back comes back because a corner is missing.
        </p>
      </section>

      {/* ───────────────────────────────────────────── one per document */}
      <ul className="space-y-3">
        {ordered.map((req) => {
          const done = rowOnFile(req);
          const needed = !done && req.essential;
          const wanted = askedFor.has(req.id);

          return (
            <li
              key={req.id}
              id={`doc-${req.kind}`}
              className={cn(
                'scroll-mt-24 rounded-2xl border p-4 transition-colors duration-500',
                done
                  ? 'border-success/35 bg-success-bg/60'
                  : needed
                    ? 'border-danger/30 bg-danger-bg/40'
                    : 'border-border bg-surface',
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors duration-500',
                    done
                      ? 'bg-success text-white'
                      : needed
                        ? 'bg-danger text-white'
                        : 'bg-bg text-muted-light',
                  )}
                >
                  {done ? (
                    <CheckCircle2 key="done" className="animate-doc-pop h-5 w-5" />
                  ) : needed ? (
                    <AlertCircle className="h-5 w-5" />
                  ) : (
                    <CircleDashed className="h-5 w-5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-extrabold">
                    {req.label}
                    {!req.essential && (
                      <span className="text-muted-light text-[0.6875rem] font-bold">optional</span>
                    )}
                    {wanted && (
                      <span className="bg-gold-soft text-gold-text rounded-full px-2 py-0.5 text-[0.625rem] font-extrabold">
                        WE ASKED FOR THIS
                      </span>
                    )}
                  </p>
                  {req.why_text && (
                    <p className="text-muted mt-0.5 text-[0.8125rem] font-semibold">
                      {req.why_text}
                    </p>
                  )}
                  <p
                    className={cn(
                      'mt-1 text-xs font-extrabold',
                      done ? 'text-success' : needed ? 'text-danger' : 'text-muted-light',
                    )}
                  >
                    {done ? 'On file' : needed ? 'Not uploaded yet' : 'Not uploaded'}
                  </p>
                </div>
              </div>

              {req.has_expiry && (
                <label className="mt-3 block">
                  <span className="text-[0.6875rem] font-extrabold uppercase tracking-[0.06em]">
                    Expiry date
                  </span>
                  <input
                    type="date"
                    value={
                      dates[req.kind] ?? latest.get(`${req.id}:-`)?.expires_at?.slice(0, 10) ?? ''
                    }
                    min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}
                    onChange={(e) => setDates((d) => ({ ...d, [req.kind]: e.target.value }))}
                    className="border-border-strong bg-surface mt-1 w-full max-w-xs rounded-lg border px-3 py-2 text-[0.875rem] font-semibold"
                  />
                  {dateErrors[req.kind] && (
                    <span className="text-danger mt-1 block text-[0.75rem] font-bold">
                      {dateErrors[req.kind]}
                    </span>
                  )}
                </label>
              )}

              <div className="mt-3 grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(16rem,1fr))]">
                {sideKeys(req).map((side) => (
                  <SideUpload
                    key={side}
                    req={req}
                    side={side}
                    have={latest.get(`${req.id}:${side}`)}
                    state={sides[`${req.kind}:${side}`] ?? { kind: 'idle' }}
                    onFile={(file) => void send(req, file, side)}
                  />
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const STAGE: Record<UploadProgress['stage'], string> = {
  checking: 'Checking your account…',
  sending: 'Uploading',
  recording: 'Saving…',
};

function SideUpload({
  req,
  side,
  have,
  state,
  onFile,
}: {
  req: Requirement;
  side: string;
  have: OnFile | undefined;
  state: SideState;
  onFile: (file: File) => void;
}) {
  const [dragging, setDragging] = React.useState(false);
  const inputId = React.useId();
  const working = state.kind === 'working';
  const status = state.kind === 'sent' ? 'uploaded' : have?.status;
  const good = ON_FILE.has(status ?? '');
  const percent =
    state.kind !== 'working'
      ? 0
      : state.progress.stage === 'checking'
        ? 6
        : state.progress.stage === 'recording'
          ? 100
          : Math.max(8, Math.round(state.progress.fraction * 100));
  const name = side === 'front' ? 'Front' : side === 'back' ? 'Back' : 'The document';

  return (
    <div className="bg-surface/80 rounded-xl p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.8125rem] font-bold">{name}</p>
        <span
          className={cn(
            'rounded-full px-2.5 py-0.5 text-[0.6875rem] font-extrabold transition-colors duration-500',
            good
              ? 'bg-success text-white'
              : status === 'rejected' || status === 'expired'
                ? 'bg-danger text-white'
                : req.essential
                  ? 'bg-danger-bg text-danger'
                  : 'bg-bg text-muted',
          )}
        >
          {status ? (WORD[status] ?? status) : 'Not uploaded'}
        </span>
      </div>

      {have?.status === 'rejected' && have.rejection_reason && state.kind !== 'sent' && (
        <p className="text-danger mt-1.5 text-[0.8125rem] font-bold">{have.rejection_reason}</p>
      )}
      {have?.status === 'verified' && have.expires_at && (
        <p className="text-muted mt-1 text-[0.75rem] font-semibold">
          Good until {day(have.expires_at)}
          {new Date(have.expires_at).getTime() - Date.now() < 30 * 86_400_000 && (
            <span className="text-gold-text font-bold"> · that is inside the month</span>
          )}
        </p>
      )}

      {working ? (
        <div className="mt-2.5" role="status" aria-live="polite">
          <div className="flex items-center justify-between text-xs font-bold">
            <span>{STAGE[state.progress.stage]}</span>
            <span className="text-muted tabular-nums">{percent}%</span>
          </div>
          <div className="bg-bg mt-1.5 h-2.5 overflow-hidden rounded-full">
            <div
              className="bg-gold animate-doc-stripes h-full rounded-full bg-[length:1rem_1rem] transition-[width] duration-300 ease-out [background-image:linear-gradient(45deg,rgb(255_255_255/0.35)_25%,transparent_25%,transparent_50%,rgb(255_255_255/0.35)_50%,rgb(255_255_255/0.35)_75%,transparent_75%,transparent)]"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      ) : state.kind === 'sent' ? (
        <p
          role="status"
          className="text-success animate-doc-rise mt-2.5 flex items-center gap-1.5 text-[0.8125rem] font-extrabold"
        >
          <CheckCircle2 aria-hidden="true" className="animate-doc-pop h-4 w-4" />
          Uploaded. It&apos;s with us for checking.
        </p>
      ) : (
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) onFile(file);
          }}
          className={cn(
            'mt-2.5 flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-3 py-3 transition-colors',
            dragging
              ? 'border-gold bg-gold-soft'
              : good
                ? 'border-success/30 hover:border-success/60'
                : 'border-border-strong hover:border-ink',
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              good ? 'bg-success-bg text-success' : 'bg-ink text-white',
            )}
          >
            {good ? <RefreshCw className="h-4 w-4" /> : <FileUp className="h-4 w-4" />}
          </span>
          <span className="min-w-0">
            <span className="block text-[0.8125rem] font-extrabold">
              {good ? 'Replace this file' : 'Choose a file or drop it here'}
            </span>
            <span className="text-muted-light block text-[0.6875rem] font-semibold">
              {good
                ? 'The old one stays on file. Nothing a reviewer looked at is overwritten.'
                : 'Photo or PDF · JPG, PNG, WebP'}
            </span>
          </span>
          <input
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="sr-only"
            aria-label={`Upload ${req.label}${side === '-' ? '' : ` ${side}`}`}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
              e.target.value = '';
            }}
          />
        </label>
      )}

      {state.kind === 'failed' && (
        <p role="alert" className="text-danger mt-1.5 text-[0.75rem] font-bold">
          {state.message}
        </p>
      )}
    </div>
  );
}

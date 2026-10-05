'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { type OwnerType, uploadDocument } from '@/lib/uploads';

import { Panel, Pill, day } from './bits';

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

const TONE: Record<string, string> = {
  verified: 'bg-success-bg text-success',
  uploaded: 'bg-info-bg text-info',
  rejected: 'bg-danger-bg text-danger',
  expired: 'bg-danger-bg text-danger',
};

const WORD: Record<string, string> = {
  verified: 'CHECKED',
  uploaded: 'WITH US',
  rejected: 'SEND ANOTHER',
  expired: 'OUT OF DATE',
};

/**
 * Documents, for a merchant or a rider.
 *
 * One component for both, because the job is identical and two
 * copies would drift. What differs is only the list of
 * requirements, which the database already answers per owner.
 *
 * Each row uploads on its own, the moment it has what it needs.
 * A partner on a phone in bad signal should not lose five files
 * because the sixth failed.
 *
 * The order is deliberate: anything rejected comes first, because
 * that is the one with a sentence attached telling them exactly
 * what to do, and it is the thing standing between them and
 * working.
 */
export function Documents({
  ownerType,
  ownerId,
  requirements,
  onFile,
  asked,
}: {
  ownerType: OwnerType;
  ownerId: string;
  requirements: Requirement[];
  onFile: OnFile[];
  asked: Asked[];
}) {
  const router = useRouter();
  const [busyKind, setBusyKind] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string | undefined>>({});
  const [dates, setDates] = React.useState<Record<string, string>>({});
  const [done, setDone] = React.useState<Record<string, boolean>>({});

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

  /* Rejected first, then still wanted, then everything settled. */
  const rank = (r: Requirement) => {
    const sides = r.kind === 'national_id' ? ['front', 'back'] : ['-'];
    const states = sides.map((s) => latest.get(`${r.id}:${s}`)?.status);
    if (states.some((s) => s === 'rejected' || s === 'expired')) return 0;
    if (states.some((s) => s === undefined)) return 1;
    if (states.some((s) => s === 'uploaded')) return 2;
    return 3;
  };

  const ordered = [...requirements].sort((a, b) => rank(a) - rank(b) || a.sort - b.sort);

  async function send(req: Requirement, file: File, side: string | null) {
    const key = `${req.kind}:${side ?? '-'}`;
    if (req.has_expiry && !dates[req.kind]) {
      setErrors((e) => ({ ...e, [key]: 'Put the expiry date in first.' }));
      return;
    }
    setBusyKind(key);
    setErrors((e) => ({ ...e, [key]: '' }));

    const r = await uploadDocument({
      ownerType,
      ownerId,
      kind: req.kind,
      file,
      expiresAt: req.has_expiry ? dates[req.kind] : null,
      side: (side as 'front' | 'back' | undefined) ?? undefined,
    });

    setBusyKind(null);
    if (!r.ok) {
      setErrors((e) => ({ ...e, [key]: r.message }));
      return;
    }
    setDone((d) => ({ ...d, [key]: true }));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Panel title="Your documents" note={`${requirements.length} asked for`}>
        <p className="text-muted text-[0.8125rem] font-semibold">
          Send a clear photo of the whole thing — all four corners in frame, flat, in daylight. Most
          of what comes back comes back because a corner is missing.
        </p>
      </Panel>

      <ul className="space-y-3">
        {ordered.map((req) => {
          const sides = req.kind === 'national_id' ? ['front', 'back'] : [null];
          const wanted = askedFor.has(req.id);

          return (
            <li key={req.id} className="border-border bg-surface rounded-2xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-extrabold">
                    {req.label}
                    {!req.essential && (
                      <span className="text-muted-light text-[0.6875rem] font-bold">optional</span>
                    )}
                    {wanted && <Pill tone="bg-gold-soft text-gold-text">WE ASKED FOR THIS</Pill>}
                  </p>
                  {req.why_text && (
                    <p className="text-muted mt-0.5 text-[0.8125rem] font-semibold">
                      {req.why_text}
                    </p>
                  )}
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
                    className="border-border-strong mt-1 w-full max-w-xs rounded-lg border px-3 py-2 text-[0.875rem] font-semibold"
                  />
                </label>
              )}

              <div className="mt-3 space-y-2">
                {sides.map((side) => {
                  const key = `${req.kind}:${side ?? '-'}`;
                  const have = latest.get(`${req.id}:${side ?? '-'}`);
                  const uploading = busyKind === key;
                  const justDone = done[key];

                  return (
                    <div key={key} className="bg-bg rounded-xl p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[0.8125rem] font-bold">
                          {side ? (side === 'front' ? 'Front' : 'Back') : 'The document'}
                        </p>
                        {justDone ? (
                          <Pill tone={TONE.uploaded}>SENT · WITH US</Pill>
                        ) : have ? (
                          <Pill tone={TONE[have.status]}>
                            {WORD[have.status] ?? have.status.toUpperCase()}
                          </Pill>
                        ) : (
                          <Pill tone="bg-bg text-muted-light">NOT SENT</Pill>
                        )}
                      </div>

                      {have?.status === 'rejected' && have.rejection_reason && (
                        <p className="text-danger mt-1.5 text-[0.8125rem] font-bold">
                          {have.rejection_reason}
                        </p>
                      )}
                      {have?.status === 'verified' && have.expires_at && (
                        <p className="text-muted mt-1 text-[0.75rem] font-semibold">
                          Good until {day(have.expires_at)}
                          {new Date(have.expires_at).getTime() - Date.now() < 30 * 86_400_000 && (
                            <span className="text-gold-text font-bold">
                              {' '}
                              · that is inside the month
                            </span>
                          )}
                        </p>
                      )}

                      <label className="mt-2 block">
                        <span className="sr-only">
                          Upload {req.label} {side ?? ''}
                        </span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          disabled={uploading}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void send(req, f, side);
                            e.target.value = '';
                          }}
                          className="text-muted file:bg-ink w-full text-[0.8125rem] font-semibold file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:px-3 file:py-2 file:text-[0.75rem] file:font-extrabold file:text-white disabled:opacity-40"
                        />
                      </label>

                      {uploading && (
                        <p className="text-muted mt-1 text-[0.75rem] font-semibold">Sending…</p>
                      )}
                      {errors[key] && (
                        <p className="text-danger mt-1 text-[0.75rem] font-bold">{errors[key]}</p>
                      )}
                      {have && !justDone && (
                        <p className="text-muted-light mt-1 text-[0.75rem] font-semibold">
                          Sending another replaces this one. The old one stays on file — nothing a
                          reviewer has looked at is overwritten.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

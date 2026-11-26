'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

export interface ReviewDocument {
  id: string;
  label: string;
  required: boolean;
  fileName: string;
  status: 'uploaded' | 'approved' | 'rejected';
  rejectionReason: string | null;
  uploadedAt: string;
  /** YYYY-MM-DD, null when the document does not expire. */
  expiresOn: string | null;
  url: string | null;
}

type ReviewAction = (input: {
  hostId: string;
  documentId: string;
  approve: boolean;
  reason: string;
  expiresOn?: string;
}) => Promise<{ error?: string; success?: boolean }>;

type ExpiryAction = (input: {
  hostId: string;
  documentId: string;
  expiresOn: string;
}) => Promise<{ error?: string; success?: boolean }>;

const TONE: Record<ReviewDocument['status'], string> = {
  uploaded: 'bg-[#FFF4D6] text-[#5B4708]',
  approved: 'bg-[#E3F5EA] text-[#1E5B3A]',
  rejected: 'bg-[#FDE8E8] text-[#8A1C1C]',
};

/** Today in Nairobi as YYYY-MM-DD. */
function nairobiToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
}

/** Same rule as fn_host_document_expiry_state: expired before today, expiring within 60 days. */
function expiryState(doc: ReviewDocument): 'expired' | 'expiring' | null {
  if (!doc.expiresOn || doc.status === 'rejected') return null;
  const today = nairobiToday();
  if (doc.expiresOn < today) return 'expired';
  const soon = new Date(`${today}T12:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + 60);
  if (doc.status === 'approved' && doc.expiresOn <= soon.toISOString().slice(0, 10))
    return 'expiring';
  return null;
}

function dateLabel(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * One row per current document: open it, then approve (with its expiry date,
 * if it has one) or reject with a reason. Staff can correct the date later.
 */
export function HostDocumentReview({
  hostId,
  documents,
  missing,
  action,
  expiryAction,
}: {
  hostId: string;
  documents: ReviewDocument[];
  missing: string[];
  action: ReviewAction;
  expiryAction: ExpiryAction;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [rejecting, setRejecting] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [dates, setDates] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(documents.map((doc) => [doc.id, doc.expiresOn ?? ''])),
  );

  React.useEffect(() => {
    setDates(Object.fromEntries(documents.map((doc) => [doc.id, doc.expiresOn ?? ''])));
  }, [documents]);

  async function run(documentId: string, call: () => Promise<{ error?: string }>) {
    setBusy(documentId);
    setError(null);
    try {
      const result = await call();
      if (result.error) {
        setError(result.error);
        return;
      }
      setRejecting(null);
      setReason('');
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const review = (documentId: string, approve: boolean) =>
    run(documentId, () =>
      action({
        hostId,
        documentId,
        approve,
        reason,
        ...(approve ? { expiresOn: dates[documentId] ?? '' } : {}),
      }),
    );

  const saveDate = (documentId: string) =>
    run(documentId, () => expiryAction({ hostId, documentId, expiresOn: dates[documentId] ?? '' }));

  return (
    <section className="mt-7">
      <h2 className="text-sm font-extrabold">Documents</h2>
      <p className="text-muted mt-1 text-sm font-semibold">
        The ID or passport and proof of authority must be approved before you can activate the host.
        Enter the expiry date printed on a document when it has one; leave it empty when it does not
        expire. The host is emailed 30 and 7 days before it expires.
      </p>

      {missing.length > 0 ? (
        <p className="bg-surface mt-3 rounded-lg p-3 text-sm font-semibold">
          Not uploaded yet: {missing.join(', ')}.
        </p>
      ) : null}

      <ul className="mt-3 space-y-3">
        {documents.map((doc) => {
          const state = expiryState(doc);
          const date = dates[doc.id] ?? '';
          const dateChanged = date !== (doc.expiresOn ?? '');
          return (
            <li key={doc.id} className="border-border-strong rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-extrabold">
                    {doc.label}
                    {doc.required ? '' : ' (optional)'}
                  </p>
                  <p className="text-muted truncate text-xs font-semibold">
                    {doc.url ? (
                      <a href={doc.url} target="_blank" rel="noreferrer" className="underline">
                        {doc.fileName}
                      </a>
                    ) : (
                      doc.fileName
                    )}{' '}
                    · uploaded {new Date(doc.uploadedAt).toLocaleDateString('en-KE')}
                    {doc.expiresOn ? ` · expires ${dateLabel(doc.expiresOn)}` : ''}
                  </p>
                </div>
                <span className="flex gap-1.5">
                  {state === 'expired' ? (
                    <span className="rounded bg-[#FDE8E8] px-2 py-1 text-xs font-extrabold text-[#8A1C1C]">
                      expired
                    </span>
                  ) : state === 'expiring' ? (
                    <span className="rounded bg-[#FFF4D6] px-2 py-1 text-xs font-extrabold text-[#5B4708]">
                      expires soon
                    </span>
                  ) : null}
                  <span className={`rounded px-2 py-1 text-xs font-extrabold ${TONE[doc.status]}`}>
                    {doc.status}
                  </span>
                </span>
              </div>
              {doc.status === 'rejected' && doc.rejectionReason ? (
                <p className="text-muted mt-2 text-xs font-semibold">
                  Reason: {doc.rejectionReason}
                </p>
              ) : null}

              {doc.status !== 'rejected' && rejecting !== doc.id ? (
                <label className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold">
                  Expiry date
                  <input
                    type="date"
                    value={date}
                    onChange={(event) =>
                      setDates((current) => ({ ...current, [doc.id]: event.target.value }))
                    }
                    className="border-border-strong focus:border-ink rounded-lg border bg-white px-2 py-1 text-xs font-semibold outline-none"
                  />
                  {date ? (
                    <button
                      type="button"
                      onClick={() => setDates((current) => ({ ...current, [doc.id]: '' }))}
                      className="text-muted font-semibold underline"
                    >
                      Does not expire
                    </button>
                  ) : (
                    <span className="text-muted font-semibold">Does not expire</span>
                  )}
                  {doc.status === 'approved' && dateChanged ? (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void saveDate(doc.id)}
                      className="bg-ink rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {busy === doc.id ? 'Saving…' : 'Save date'}
                    </button>
                  ) : null}
                </label>
              ) : null}

              {doc.status !== 'approved' ? (
                rejecting === doc.id ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      rows={2}
                      maxLength={500}
                      placeholder="What should the host fix? They will see this."
                      className="border-border-strong focus:border-ink block w-full rounded-lg border bg-white p-2 text-sm font-medium outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void review(doc.id, false)}
                        className="rounded-lg bg-[#8A1C1C] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                      >
                        Send back to host
                      </button>
                      <button
                        type="button"
                        onClick={() => setRejecting(null)}
                        className="rounded-lg px-3 py-1.5 text-xs font-bold"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void review(doc.id, true)}
                      className="bg-ink rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {busy === doc.id ? 'Saving…' : 'Approve'}
                    </button>
                    {doc.status !== 'rejected' ? (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => {
                          setRejecting(doc.id);
                          setReason('');
                        }}
                        className="border-border-strong rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-50"
                      >
                        Reject
                      </button>
                    ) : null}
                  </div>
                )
              ) : null}
            </li>
          );
        })}
      </ul>

      {error ? (
        <p role="alert" className="text-danger mt-3 text-sm font-semibold">
          {error}
        </p>
      ) : null}
    </section>
  );
}

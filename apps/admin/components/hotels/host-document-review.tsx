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
  url: string | null;
}

type ReviewAction = (input: {
  hostId: string;
  documentId: string;
  approve: boolean;
  reason: string;
}) => Promise<{ error?: string; success?: boolean }>;

const TONE: Record<ReviewDocument['status'], string> = {
  uploaded: 'bg-[#FFF4D6] text-[#5B4708]',
  approved: 'bg-[#E3F5EA] text-[#1E5B3A]',
  rejected: 'bg-[#FDE8E8] text-[#8A1C1C]',
};

/** One row per current document: open it, then approve or reject with a reason. */
export function HostDocumentReview({
  hostId,
  documents,
  missing,
  action,
}: {
  hostId: string;
  documents: ReviewDocument[];
  missing: string[];
  action: ReviewAction;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [rejecting, setRejecting] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  async function review(documentId: string, approve: boolean) {
    setBusy(documentId);
    setError(null);
    try {
      const result = await action({ hostId, documentId, approve, reason });
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

  return (
    <section className="mt-7">
      <h2 className="text-sm font-extrabold">Documents</h2>
      <p className="text-muted mt-1 text-sm font-semibold">
        The ID or passport and proof of authority must be approved before you can activate the host.
      </p>

      {missing.length > 0 ? (
        <p className="bg-surface mt-3 rounded-lg p-3 text-sm font-semibold">
          Not uploaded yet: {missing.join(', ')}.
        </p>
      ) : null}

      <ul className="mt-3 space-y-3">
        {documents.map((doc) => (
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
                </p>
              </div>
              <span className={`rounded px-2 py-1 text-xs font-extrabold ${TONE[doc.status]}`}>
                {doc.status}
              </span>
            </div>
            {doc.status === 'rejected' && doc.rejectionReason ? (
              <p className="text-muted mt-2 text-xs font-semibold">Reason: {doc.rejectionReason}</p>
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
        ))}
      </ul>

      {error ? (
        <p role="alert" className="text-danger mt-3 text-sm font-semibold">
          {error}
        </p>
      ) : null}
    </section>
  );
}

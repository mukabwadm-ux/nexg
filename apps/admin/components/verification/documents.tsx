'use client';

import { DetailPanel } from '@nexg/ui';
import { AlertCircle, CheckCircle2, Circle, Clock3, Eye } from 'lucide-react';
import * as React from 'react';

import { DocumentReview, type ReviewDocument } from '@/components/document-review';

type Result = Promise<{ ok: boolean; message: string }>;

export interface DocumentActions {
  onVerify: (documentId: string) => Result;
  onReject: (documentId: string, reason: string) => Result;
  onRemind: (kind: string) => Result;
  onFiled: (input: {
    kind: string;
    storagePath: string;
    mime: string;
    sizeBytes: number;
    receivedVia: string;
  }) => Result;
}

function StatusIcon({ status }: { status: ReviewDocument['status'] }) {
  if (status === 'verified')
    return (
      <CheckCircle2 aria-hidden="true" className="h-5 w-5 shrink-0 fill-[#1E9E45] text-white" />
    );
  if (status === 'uploaded')
    return (
      <Clock3 aria-hidden="true" className="h-5 w-5 shrink-0 text-[#D18F00]" strokeWidth={2.2} />
    );
  if (status === 'rejected' || status === 'expired')
    return (
      <AlertCircle aria-hidden="true" className="h-5 w-5 shrink-0 fill-[#C62D22] text-white" />
    );
  return <Circle aria-hidden="true" className="text-border-strong h-5 w-5 shrink-0" />;
}

const SAY: Record<ReviewDocument['status'], string> = {
  verified: 'verified',
  uploaded: 'uploaded, waiting for review',
  rejected: 'rejected',
  expired: 'expired',
  missing: 'not uploaded',
};

/**
 * "Submitted Documents" in the review pane: one row per document asked
 * for, its state as an icon, and the eye opening it in the same review
 * drawer the merchant page uses (view the file, verify, reject with a
 * reason, chase it, or upload it on the merchant's behalf).
 */
export function VerificationDocuments({
  documents,
  storagePrefix,
  actions,
}: {
  documents: ReviewDocument[];
  storagePrefix: string;
  actions: DocumentActions;
}) {
  const [open, setOpen] = React.useState<string | null>(null);
  const current = documents.find((d) => d.kind === open) ?? null;

  if (documents.length === 0) {
    return (
      <p className="text-muted py-3 text-[0.875rem] font-semibold">
        Nothing is asked for this merchant yet.
      </p>
    );
  }

  return (
    <>
      <ul>
        {documents.map((d) => (
          <li
            key={d.kind}
            className="border-border flex items-center justify-between gap-3 border-b py-2.5 last:border-b-0"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <StatusIcon status={d.status} />
              <span className="text-ink text-[0.875rem] font-semibold leading-snug">
                {d.label}
                {!d.required && <span className="text-muted-light font-semibold"> (optional)</span>}
              </span>
              <span className="sr-only">: {SAY[d.status]}</span>
            </span>
            <button
              type="button"
              onClick={() => setOpen(d.kind)}
              aria-label={`Review ${d.label}`}
              title={d.status === 'missing' ? 'Chase or upload it' : 'View and review'}
              className="text-ink rounded-md p-1 hover:text-[#B57A00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A800]"
            >
              <Eye aria-hidden="true" className="h-5 w-5" />
            </button>
          </li>
        ))}
      </ul>

      <DetailPanel
        open={current !== null}
        onOpenChange={(next) => !next && setOpen(null)}
        title={current?.label ?? 'Document'}
        subtitle={
          current
            ? `${current.required ? 'Required' : 'Optional'} · ${SAY[current.status]}`
            : undefined
        }
        width="lg"
      >
        {current && (
          <DocumentReview
            documents={[current]}
            onVerify={actions.onVerify}
            onReject={actions.onReject}
            onRemind={actions.onRemind}
            onFiled={actions.onFiled}
            storagePrefix={storagePrefix}
          />
        )}
      </DetailPanel>
    </>
  );
}

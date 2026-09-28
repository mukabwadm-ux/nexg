'use client';

import { Button, Card, Input, StatusBadge, type StatusKey, useToast } from '@nexg/ui';
import { ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

export interface ReviewDocument {
  id: string | null;
  kind: string;
  label: string;
  helpText: string | null;
  required: boolean;
  status: 'missing' | 'uploaded' | 'verified' | 'rejected' | 'expired';
  expiresAt: string | null;
  rejectionReason: string | null;
  /** Five-minute signed URL, minted server-side. Null when nothing is on file. */
  url: string | null;
  mime: string | null;
}

/* "missing" is not a document status in the database — nothing has been
 * uploaded — so it is the one case the shared badge cannot label. */
const MISSING = 'missing';

export function DocumentReview({
  documents,
  onVerify,
  onReject,
}: {
  documents: ReviewDocument[];
  onVerify: (documentId: string) => Promise<{ ok: boolean; message: string }>;
  onReject: (documentId: string, reason: string) => Promise<{ ok: boolean; message: string }>;
}) {
  const { toast } = useToast();
  const router = useRouter();

  const [busy, setBusy] = React.useState<string | null>(null);
  const [rejecting, setRejecting] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState('');

  const run = async (
    id: string,
    work: () => Promise<{ ok: boolean; message: string }>,
    successTitle: string,
  ) => {
    setBusy(id);
    const result = await work();
    setBusy(null);

    toast({
      title: result.ok ? successTitle : 'That did not go through',
      description: result.message,
      tone: result.ok ? 'success' : 'danger',
    });

    if (result.ok) {
      setRejecting(null);
      setReason('');
      router.refresh();
    }
  };

  return (
    <ul className="space-y-3">
      {documents.map((document) => (
        <li key={document.kind}>
          <Card className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[0.9375rem] font-extrabold">
                  {document.label}
                  {!document.required && (
                    <span className="text-muted-light text-[0.625rem] font-bold uppercase tracking-wide">
                      Optional
                    </span>
                  )}
                </p>
                {document.helpText && (
                  <p className="text-muted-light mt-0.5 text-xs font-semibold">
                    {document.helpText}
                  </p>
                )}
                {document.expiresAt && (
                  <p className="text-muted mt-1 text-xs font-semibold">
                    Expires {document.expiresAt}
                  </p>
                )}
                {document.status === 'rejected' && document.rejectionReason && (
                  <p className="text-danger mt-1 text-xs font-semibold">
                    {document.rejectionReason}
                  </p>
                )}
              </div>

              {document.status === MISSING ? (
                <StatusBadge tone="neutral">Not uploaded</StatusBadge>
              ) : (
                <StatusBadge status={document.status as StatusKey} />
              )}
            </div>

            {document.url && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  {/*
                   * A new tab, not an inline preview: the URL expires in five
                   * minutes and a PDF cannot be shown in an <img> anyway.
                   */}
                  <a href={document.url} target="_blank" rel="noreferrer">
                    <span className="inline-flex items-center gap-1.5">
                      View file
                      <ExternalLink className="h-3 w-3" />
                    </span>
                  </a>
                </Button>

                {document.id && document.status !== 'verified' && (
                  <>
                    <Button
                      size="sm"
                      loading={busy === document.id}
                      onClick={() => run(document.id!, () => onVerify(document.id!), 'Verified')}
                    >
                      Verify
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setRejecting((current) => (current === document.id ? null : document.id))
                      }
                    >
                      Reject
                    </Button>
                  </>
                )}
              </div>
            )}

            {rejecting === document.id && (
              <div className="border-border mt-3 border-t pt-3">
                <Input
                  id={`reason_${document.kind}`}
                  label="What is wrong with it?"
                  hint="The applicant sees this, so be specific enough to act on."
                  placeholder="The expiry date is not readable — send a clearer photo."
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="danger"
                    size="sm"
                    loading={busy === document.id}
                    onClick={() =>
                      run(document.id!, () => onReject(document.id!, reason), 'Rejected')
                    }
                  >
                    Send rejection
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setRejecting(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}

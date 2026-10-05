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
  /** When this document was last chased, and whether it can be again. */
  chase: {
    last_sent_at: string | null;
    last_channel: string | null;
    by: string | null;
    by_applicant: boolean;
    times: number | null;
    can_send_again: boolean;
    next_allowed_at: string | null;
  } | null;
}

/* "missing" is not a document status in the database — nothing has been
 * uploaded — so it is the one case the shared badge cannot label. */
const MISSING = 'missing';

/**
 * Reviewing the documents on an application.
 *
 * Each row is independent: its own draft reason, its own open state,
 * its own spinner. That sounds obvious and the first version was not
 * — it held one `reason` string and compared `busy === document.id`
 * for the whole list, which went wrong in two ways at once.
 *
 * A document nobody has uploaded has `id === null`. So
 * `busy === document.id` was `null === null` on every such row —
 * true — and every one of them rendered an open rejection box with a
 * button spinning forever. Three unuploaded documents meant three
 * open boxes, all sharing one piece of text, none of them clickable.
 *
 * Both are fixed the same way: nothing is keyed on a value that can
 * be null, and the per-row state is actually per row.
 */
export function DocumentReview({
  documents,
  onVerify,
  onReject,
  onRemind,
}: {
  documents: ReviewDocument[];
  onVerify: (documentId: string) => Promise<{ ok: boolean; message: string }>;
  onReject: (documentId: string, reason: string) => Promise<{ ok: boolean; message: string }>;
  /** Chase a document that has not arrived. */
  onRemind: (kind: string) => Promise<{ ok: boolean; message: string }>;
}) {
  const { toast } = useToast();
  const router = useRouter();

  /*
   * Keyed by `kind`, which every document has and which is already
   * the list key. `id` is null until something is uploaded, and a
   * null key is how the original managed to mean "all of them".
   */
  const [busyKind, setBusyKind] = React.useState<string | null>(null);
  const [openKinds, setOpenKinds] = React.useState<ReadonlySet<string>>(new Set());
  const [reasons, setReasons] = React.useState<Record<string, string>>({});

  const run = async (
    kind: string,
    work: () => Promise<{ ok: boolean; message: string }>,
    successTitle: string,
  ) => {
    setBusyKind(kind);
    const result = await work();
    setBusyKind(null);

    toast({
      title: result.ok ? successTitle : 'That did not go through',
      description: result.message,
      tone: result.ok ? 'success' : 'danger',
    });

    if (result.ok) {
      /* Close and clear this row only. A reviewer working through
         three documents keeps whatever they have typed in the other
         two. */
      setOpenKinds((current) => {
        const next = new Set(current);
        next.delete(kind);
        return next;
      });
      setReasons((current) => {
        const { [kind]: _removed, ...rest } = current;
        return rest;
      });
      router.refresh();
    }
  };

  const toggle = (kind: string) =>
    setOpenKinds((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  return (
    <ul className="space-y-3">
      {documents.map((document) => {
        /* Everything below reads these, so a null id can never be
           mistaken for "this row". */
        const isOpen = openKinds.has(document.kind);
        const isBusy = busyKind === document.kind;
        const reason = reasons[document.kind] ?? '';
        const reviewable = document.id !== null && document.status !== 'verified';
        /* Nothing to chase once it is in. A reviewer reminding
           somebody to send a thing they already sent is how a
           reviewer loses their trust. */
        const chaseable =
          document.status === MISSING || document.status === 'rejected' || document.status === 'expired';
        const chase = document.chase;

        return (
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

                  {reviewable && (
                    <>
                      <Button
                        size="sm"
                        loading={isBusy}
                        disabled={isBusy}
                        onClick={() =>
                          run(document.kind, () => onVerify(document.id!), 'Verified')
                        }
                      >
                        Verify
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => toggle(document.kind)}
                      >
                        {isOpen ? 'Keep it' : 'Reject'}
                      </Button>
                    </>
                  )}
                </div>
              )}

              {chaseable && (
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    loading={isBusy}
                    disabled={isBusy || chase?.can_send_again === false}
                    onClick={() => run(document.kind, () => onRemind(document.kind), 'Reminder recorded')}
                  >
                    {chase?.last_sent_at ? 'Remind again' : 'Remind them to upload'}
                  </Button>

                  {chase?.last_sent_at && (
                    <span className="text-muted-light text-[0.6875rem] font-semibold">
                      {chase.by_applicant
                        ? 'They asked us to send a link'
                        : `Chased by ${chase.by ?? 'somebody'}`}
                      {' · '}
                      {relative(chase.last_sent_at)}
                      {chase.times && chase.times > 1 ? ` · ${chase.times} times` : ''}
                      {chase.can_send_again === false && chase.next_allowed_at
                        ? ` · again after ${shortTime(chase.next_allowed_at)}`
                        : ''}
                    </span>
                  )}
                </div>
              )}

              {/*
               * Guarded on `reviewable`, not only on the open set. A
               * document with no row behind it cannot be rejected,
               * and leaving that to the state alone is what let three
               * unuploaded documents all open at once.
               */}
              {reviewable && isOpen && (
                <div className="border-border mt-3 border-t pt-3">
                  <Input
                    id={`reason_${document.kind}`}
                    label="What is wrong with it?"
                    hint="The applicant sees this, so be specific enough to act on."
                    placeholder="The expiry date is not readable — send a clearer photo."
                    value={reason}
                    onChange={(event) =>
                      setReasons((current) => ({
                        ...current,
                        [document.kind]: event.target.value,
                      }))
                    }
                  />
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      loading={isBusy}
                      /* A rejection with no reason is one the applicant
                         cannot act on, so the button waits for one. */
                      disabled={isBusy || reason.trim() === ''}
                      onClick={() =>
                        run(document.kind, () => onReject(document.id!, reason), 'Rejected')
                      }
                    >
                      Send rejection
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isBusy}
                      onClick={() => toggle(document.kind)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

/* "2 hours ago", for a line that sits beside a button. */
function relative(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 2) return 'a moment ago';
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function shortTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Nairobi',
  });
}

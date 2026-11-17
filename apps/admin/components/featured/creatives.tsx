'use client';

import { Button, Card, Input, useToast } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Chip, DASH, KIND_LABEL, Pill, when } from './shared';

/** One row of console_creative_queue_v, with its files signed for this page. */
export interface CreativeRow {
  source: 'featured' | 'promotion';
  id: string;
  merchant_id: string;
  trading_name: string | null;
  status: 'pending_review' | 'approved' | 'rejected';
  media_kind: 'image' | 'video' | null;
  media_mime: string | null;
  media_bytes: number | null;
  blurb: string | null;
  placement_kind: string | null;
  booking_status: string | null;
  wanted_start: string | null;
  promotion_name: string | null;
  promotion_kind: string | null;
  promotion_value: number | null;
  promotion_item: string | null;
  promotion_ends_at: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  rejection_reason: string | null;
  /** Signed for an hour. */
  src: string | null;
  poster: string | null;
}

type Review = (input: {
  source: 'featured' | 'promotion';
  id: string;
  approve: boolean;
  reason: string;
}) => Promise<{ ok: boolean; message?: string }>;

const STATUS: Record<CreativeRow['status'], { label: string; tone: string }> = {
  pending_review: { label: 'WAITING', tone: 'bg-gold-soft text-gold-text' },
  approved: { label: 'APPROVED', tone: 'bg-success-bg text-success' },
  rejected: { label: 'SENT BACK', tone: 'bg-danger-bg text-danger' },
};

function size(bytes: number | null) {
  if (!bytes) return DASH;
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

function benefit(row: CreativeRow) {
  if (row.promotion_value === null) return DASH;
  return row.promotion_kind === 'percent'
    ? `${row.promotion_value}% off`
    : `KES ${row.promotion_value.toLocaleString('en-KE')} off`;
}

/**
 * The file itself, at the shape it is shown in: a homepage card is 15:14,
 * a store banner 16:9. Videos get the browser's own controls here, muted to
 * start, because staff should be able to scrub through all of it; guests
 * only ever see it muted and looping.
 */
function Media({ row }: { row: CreativeRow }) {
  const shape = row.source === 'featured' ? 'aspect-[15/14]' : 'aspect-video';
  return (
    <div className={`relative ${shape} overflow-hidden rounded-xl bg-[#14120E]`}>
      {!row.src ? (
        <p className="text-muted-light absolute inset-0 flex items-center justify-center p-6 text-center text-xs font-semibold">
          {row.media_kind
            ? 'The file could not be opened. It may have been deleted.'
            : 'No image or video: the card uses the merchant’s own photo and name.'}
        </p>
      ) : row.media_kind === 'video' ? (
        <video
          src={row.src}
          poster={row.poster ?? undefined}
          controls
          muted
          loop
          playsInline
          preload="metadata"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- a signed link, valid for an hour.
        <img src={row.src} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      {row.source === 'featured' && (
        <>
          <span className="text-ink pointer-events-none absolute left-3 top-3 rounded-full bg-white px-2.5 py-1 text-[0.5625rem] font-extrabold uppercase tracking-[0.16em]">
            Sponsored
          </span>
          {/* On a video the browser's controls sit at the foot; the line and
              name are listed under the card instead of over them. */}
          {row.media_kind !== 'video' && (
            <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0b0907] via-[#0b0907]/80 to-transparent p-4 pt-10 text-white">
              <span className="text-gold block truncate text-[0.75rem] font-semibold">
                {row.blurb ?? 'Category · area'}
              </span>
              <span className="mt-1 block truncate text-lg font-extrabold">
                {row.trading_name ?? DASH}
              </span>
            </span>
          )}
        </>
      )}
    </div>
  );
}

function CreativeCard({
  row,
  canReview,
  onReview,
}: {
  row: CreativeRow;
  canReview: boolean;
  onReview: Review;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = React.useState(false);
  const [sendingBack, setSendingBack] = React.useState(false);
  const [reason, setReason] = React.useState('');

  async function decide(approve: boolean) {
    setPending(true);
    const outcome = await onReview({ source: row.source, id: row.id, approve, reason });
    setPending(false);
    toast({
      title: outcome.ok ? 'Done' : 'Not allowed',
      description: outcome.message ?? '',
      tone: outcome.ok ? 'success' : 'danger',
    });
    if (outcome.ok) {
      setSendingBack(false);
      setReason('');
      router.refresh();
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <Media row={row} />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[0.9375rem] font-extrabold">{row.trading_name ?? DASH}</p>
          <p className="text-muted text-[0.75rem] font-semibold">
            {row.source === 'featured'
              ? `${KIND_LABEL[row.placement_kind ?? ''] ?? 'Featured'} card · booking ${row.booking_status ?? DASH}`
              : `Promotion picture · ${row.promotion_name ?? DASH}`}
          </p>
        </div>
        <Pill tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Pill>
      </div>

      <dl className="text-muted grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[0.75rem] font-semibold">
        {row.source === 'featured' ? (
          <>
            <dt className="text-muted-light">Line</dt>
            <dd className="text-ink">{row.blurb ? `“${row.blurb}”` : 'None'}</dd>
          </>
        ) : (
          <>
            <dt className="text-muted-light">Offer</dt>
            <dd className="text-ink">
              {benefit(row)} · {row.promotion_item ? `on ${row.promotion_item}` : 'on everything'}
              {row.promotion_ends_at
                ? ` · ends ${new Date(row.promotion_ends_at).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    timeZone: 'Africa/Nairobi',
                  })}`
                : ''}
            </dd>
          </>
        )}
        <dt className="text-muted-light">File</dt>
        <dd>
          {row.media_kind
            ? `${row.media_kind === 'video' ? 'Video' : 'Image'} · ${row.media_mime ?? DASH} · ${size(row.media_bytes)}`
            : 'None'}
        </dd>
        <dt className="text-muted-light">Sent</dt>
        <dd>{when(row.submitted_at)}</dd>
        {row.status === 'rejected' && (
          <>
            <dt className="text-muted-light">Reason</dt>
            <dd className="text-danger">{row.rejection_reason ?? DASH}</dd>
          </>
        )}
      </dl>

      {row.status === 'pending_review' && !canReview && (
        <p className="text-muted-light mt-auto text-[0.75rem] font-semibold">
          Approving needs full access to Featured slots.
        </p>
      )}
      {row.status === 'pending_review' && canReview && (
        <div className="mt-auto space-y-2">
          {sendingBack ? (
            <>
              <Input
                id={`reason-${row.id}`}
                label="What should they change?"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="The price in the picture does not match the promotion."
                hint="Sent to the merchant word for word."
              />
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  disabled={pending || !reason.trim()}
                  loading={pending}
                  onClick={() => void decide(false)}
                >
                  Send back
                </Button>
                <Button variant="ghost" disabled={pending} onClick={() => setSendingBack(false)}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="black"
                disabled={pending}
                loading={pending}
                onClick={() => void decide(true)}
              >
                Approve
              </Button>
              <Button variant="outline" disabled={pending} onClick={() => setSendingBack(true)}>
                Send back
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/**
 * Merchants' own homepage cards and promotion pictures, waiting for review.
 * Nothing here reaches a guest until it is approved: the homepage reads only
 * approved cards and a store shows only an approved picture.
 */
export function CreativesTab({
  rows,
  filter,
  city,
  canReview,
  onReview,
}: {
  rows: CreativeRow[];
  filter: string;
  city: string | null;
  canReview: boolean;
  onReview: Review;
}) {
  const waiting = rows.filter((row) => row.status === 'pending_review');
  const shown =
    filter === 'approved'
      ? rows.filter((row) => row.status === 'approved')
      : filter === 'rejected'
        ? rows.filter((row) => row.status === 'rejected')
        : filter === 'all'
          ? rows
          : waiting;
  const href = (next: string) =>
    `/featured?tab=creatives&filter=${next}${city ? `&city=${city}` : ''}`;

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Chip on={!['approved', 'rejected', 'all'].includes(filter)} href={href('waiting')}>
          Waiting {waiting.length}
        </Chip>
        <Chip on={filter === 'approved'} href={href('approved')}>
          Approved
        </Chip>
        <Chip on={filter === 'rejected'} href={href('rejected')}>
          Sent back
        </Chip>
        <Chip on={filter === 'all'} href={href('all')}>
          All
        </Chip>
      </div>
      <p className="text-muted mt-3 max-w-3xl text-[0.8125rem] font-semibold leading-relaxed">
        Merchants’ own images and videos for homepage cards and promotion banners. Guests see them
        only once approved; videos always play muted and looping for guests. Turn down anything
        misleading, unreadable, or showing a price that does not match.
      </p>
      {shown.length === 0 ? (
        <Card className="mt-5 p-6">
          <p className="text-muted text-sm font-semibold">
            {filter === 'approved' || filter === 'rejected' || filter === 'all'
              ? 'Nothing here.'
              : 'Nothing is waiting for review.'}
          </p>
        </Card>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((row) => (
            <CreativeCard
              key={`${row.source}-${row.id}`}
              row={row}
              canReview={canReview}
              onReview={onReview}
            />
          ))}
        </div>
      )}
    </>
  );
}

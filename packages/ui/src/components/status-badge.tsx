import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/cn';
import { Spinner } from './spinner';

const statusBadgeVariants = cva(
  cn(
    'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1',
    'text-micro font-bold uppercase leading-none',
  ),
  {
    variants: {
      tone: {
        /** Verified, active, live. */
        success: 'bg-success-bg text-success',
        /** Expiring, awaiting verification, under review. */
        warning: 'bg-warning-bg text-warning',
        /** Expired, rejected, paused, delisted. */
        danger: 'bg-danger-bg text-danger',
        /** Applied, draft — no judgement yet. */
        neutral: 'bg-border/60 text-muted',
        /** Emphasis without a status meaning. */
        ink: 'bg-ink text-white',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

/**
 * The lifecycle statuses this slice can render, mapped to a tone. Keys match
 * the `rider_status`, `partner_status` and `document_status` enums in spec
 * section 3.1 so callers can pass a database value straight through.
 */
export const STATUS_TONES = {
  // partner_status / rider_status
  applied: 'neutral',
  documents_pending: 'warning',
  under_review: 'warning',
  live: 'success',
  active: 'success',
  paused: 'danger',
  suspended: 'danger',
  delisted: 'danger',
  offboarded: 'neutral',
  // document_status
  uploaded: 'neutral',
  verified: 'success',
  rejected: 'danger',
  expired: 'danger',
} as const satisfies Record<string, NonNullable<VariantProps<typeof statusBadgeVariants>['tone']>>;

export type StatusKey = keyof typeof STATUS_TONES;

/** Human labels for the same keys, matching the copy on the artboards. */
export const STATUS_LABELS: Record<StatusKey, string> = {
  applied: 'Applied',
  documents_pending: 'Documents pending',
  under_review: 'Under review',
  live: 'Live',
  active: 'Active',
  paused: 'Paused',
  suspended: 'Suspended',
  delisted: 'Delisted',
  offboarded: 'Offboarded',
  uploaded: 'Uploaded',
  verified: 'Verified',
  rejected: 'Rejected',
  expired: 'Expired',
};

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusBadgeVariants> {
  /** A known lifecycle status; sets both the tone and the default label. */
  status?: StatusKey;
  /** Overrides the label derived from `status`. */
  children?: React.ReactNode;
  /** Shows a spinner in place of the dot while a decision is in flight. */
  loading?: boolean;
}

export function StatusBadge({
  status,
  tone,
  loading = false,
  className,
  children,
  ...props
}: StatusBadgeProps) {
  const resolvedTone = tone ?? (status ? STATUS_TONES[status] : 'neutral');
  const label = children ?? (status ? STATUS_LABELS[status] : 'Unknown');

  return (
    <span className={cn(statusBadgeVariants({ tone: resolvedTone }), className)} {...props}>
      {loading && <Spinner className="h-3 w-3" label="" aria-hidden="true" />}
      {label}
    </span>
  );
}

export { statusBadgeVariants };

import { cn } from '../lib/cn';
import { Skeleton } from './skeleton';

/**
 * What the console shows in place of a number that has no value yet.
 *
 * Spec ground rule 3: no invented business numbers. Where a figure is not
 * configured, the UI renders this marker — never a plausible-looking zero.
 */
export const VALUE_PLACEHOLDER = '[—]';

export interface KpiTileProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Uppercase micro-label, e.g. "DOCUMENTS ON FILE". */
  label: string;
  /**
   * The figure. `null` or `undefined` renders `[—]`, which is the correct and
   * expected state until the backing setting exists.
   */
  value?: string | number | null;
  /** Caption under the value, e.g. "across [—] riders". */
  caption?: React.ReactNode;
  /** Tints the caption to flag attention, matching the artboards. */
  captionTone?: 'muted' | 'success' | 'warning' | 'danger';
  /** Optional unit rendered after the value, e.g. "d" or "%". */
  unit?: string;
  loading?: boolean;
  /** Replaces the value with a short error note. */
  error?: string;
}

const captionTones = {
  muted: 'text-muted-light',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
} as const;

/** A single figure in the console KPI strip (see the pipeline artboards). */
export function KpiTile({
  label,
  value,
  caption,
  captionTone = 'muted',
  unit,
  loading = false,
  error,
  className,
  ...props
}: KpiTileProps) {
  const isUnset = value === null || value === undefined || value === '';

  return (
    <div
      className={cn(
        'border-border bg-surface shadow-card flex min-w-0 flex-col justify-between rounded-xl border p-4',
        className,
      )}
      {...props}
    >
      <p className="label-micro">{label}</p>

      {loading ? (
        <Skeleton className="mt-2 h-8 w-20" />
      ) : error ? (
        <p className="text-danger mt-2 text-sm font-semibold">{error}</p>
      ) : (
        <p
          className={cn(
            'mt-1 text-3xl font-extrabold leading-tight tracking-tight',
            isUnset ? 'text-muted-light' : 'text-ink',
          )}
        >
          {isUnset ? VALUE_PLACEHOLDER : value}
          {unit && !isUnset && <span className="ml-1 text-2xl">{unit}</span>}
        </p>
      )}

      {caption && !loading && (
        <p className={cn('mt-1 text-xs leading-snug', captionTones[captionTone])}>{caption}</p>
      )}
    </div>
  );
}

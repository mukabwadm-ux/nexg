import type * as React from 'react';

import { cn } from '../lib/cn';

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0–100. Values outside are clamped; null draws an empty track. */
  value: number | null;
  /** What is being measured, for screen readers ("Storage used"). */
  label: string;
  tone?: 'gold' | 'success' | 'danger' | 'ink';
}

/** A thin meter: storage used, a budget spent, an order received. */
export function Progress({ value, label, tone = 'gold', className, ...props }: ProgressProps) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value == null ? undefined : Math.round(pct)}
      className={cn('bg-border/70 h-2 w-full overflow-hidden rounded-full', className)}
      {...props}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500 ease-out',
          tone === 'gold' && 'bg-gradient-to-r from-[#F0B90B] to-[#FDD128]',
          tone === 'success' && 'bg-success',
          tone === 'danger' && 'bg-danger',
          tone === 'ink' && 'bg-ink',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

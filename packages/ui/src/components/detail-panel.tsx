'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '../lib/cn';
import { EmptyState } from './empty-state';
import { Skeleton } from './skeleton';

export interface DetailPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Sub-heading under the title, e.g. "Boda · Westlands". */
  subtitle?: React.ReactNode;
  /** Status badge or tags shown beside the title. */
  meta?: React.ReactNode;
  /** Sticky action bar at the foot — Verify, Reject, Activate. */
  footer?: React.ReactNode;
  loading?: boolean;
  /** Renders an error state in place of the body. */
  error?: string;
  /** Renders an empty state in place of the body. */
  empty?: string;
  width?: 'md' | 'lg';
  children?: React.ReactNode;
}

/**
 * The right-side drawer used across the console for document review and record
 * detail (spec section 2, artboards B7 and A13).
 *
 * Radix Dialog handles the focus trap, Escape, scroll lock and restoring focus
 * to whatever opened the panel. On a 390px viewport it becomes full width.
 */
export function DetailPanel({
  open,
  onOpenChange,
  title,
  subtitle,
  meta,
  footer,
  loading = false,
  error,
  empty,
  width = 'md',
  children,
}: DetailPanelProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'bg-ink/30 fixed inset-0 z-40 backdrop-blur-[1px]',
            'data-[state=open]:animate-fade-in',
          )}
        />
        <Dialog.Content
          className={cn(
            'bg-surface shadow-panel fixed inset-y-0 right-0 z-50 flex w-full flex-col',
            'focus:outline-none',
            'data-[state=open]:animate-slide-in-right data-[state=closed]:animate-slide-out-right',
            width === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-md',
          )}
        >
          <header className="border-border flex items-start gap-3 border-b px-4 py-4 sm:px-5">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-ink truncate text-lg font-extrabold leading-tight">
                {title}
              </Dialog.Title>
              {subtitle && (
                <Dialog.Description className="text-muted-light mt-0.5 truncate text-sm">
                  {subtitle}
                </Dialog.Description>
              )}
              {meta && <div className="mt-2 flex flex-wrap items-center gap-1.5">{meta}</div>}
            </div>

            <Dialog.Close
              aria-label="Close panel"
              className={cn(
                'text-muted-light flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                'hover:bg-bg hover:text-ink transition-colors',
                'focus-visible:ring-gold focus-visible:outline-none focus-visible:ring-2',
              )}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Dialog.Close>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            {loading ? (
              <div aria-busy="true" className="space-y-3">
                <Skeleton className="h-40 w-full rounded-lg" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : error ? (
              <EmptyState
                tone="error"
                size="sm"
                title="Could not load this record"
                description={error}
              />
            ) : empty ? (
              <EmptyState size="sm" title={empty} />
            ) : (
              children
            )}
          </div>

          {footer && (
            <footer className="border-border bg-bg/60 flex flex-wrap items-center gap-2 border-t px-4 py-3 sm:px-5">
              {footer}
            </footer>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** A labelled row inside a detail panel body. */
export function DetailRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-2', className)}>
      <dt className="text-muted-light shrink-0 text-xs font-bold uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-ink min-w-0 text-right text-sm">{children}</dd>
    </div>
  );
}

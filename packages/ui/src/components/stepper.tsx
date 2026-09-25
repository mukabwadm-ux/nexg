import { Check } from 'lucide-react';

import { cn } from '../lib/cn';

export interface Step {
  /** Short label, e.g. "About you". */
  label: string;
  /** Optional one-line description shown on wider viewports. */
  description?: string;
}

export interface StepperProps {
  steps: readonly Step[];
  /** 1-based index of the step in progress. */
  current: number;
  /** Renders the current step as failed rather than in progress. */
  error?: boolean;
  className?: string;
}

/**
 * Progress header for the rider and merchant application flows
 * ("Step 1 of 3 — About you", spec section 4.2).
 *
 * On a 390px viewport the labels collapse to a compact counter plus the current
 * step name; from `sm` up the full rail is shown.
 */
export function Stepper({ steps, current, error = false, className }: StepperProps) {
  const total = steps.length;
  const clamped = Math.min(Math.max(current, 1), total);
  const active = steps[clamped - 1];

  return (
    <nav aria-label="Progress" className={cn('w-full', className)}>
      {/* Mobile: counter + current label. */}
      <div className="sm:hidden">
        <p className="text-ink text-sm font-bold">
          Step {clamped} of {total}
          {active ? ` — ${active.label}` : ''}
        </p>
        <div
          className="bg-border mt-2 h-1.5 w-full overflow-hidden rounded-full"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={clamped}
          aria-valuetext={`Step ${clamped} of ${total}${active ? `: ${active.label}` : ''}`}
        >
          <div
            className={cn('h-full rounded-full transition-all', error ? 'bg-danger' : 'bg-gold')}
            style={{ width: `${(clamped / total) * 100}%` }}
          />
        </div>
      </div>

      {/* From sm up: the full rail. */}
      <ol className="hidden sm:flex sm:items-start sm:gap-2">
        {steps.map((step, index) => {
          const position = index + 1;
          const isComplete = position < clamped;
          const isCurrent = position === clamped;
          const isFailed = isCurrent && error;

          return (
            <li key={step.label} className="flex flex-1 items-start gap-3">
              <div className="flex flex-1 flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                      isFailed && 'bg-danger text-white',
                      !isFailed && isComplete && 'bg-ink text-white',
                      !isFailed && isCurrent && 'bg-gold text-ink',
                      !isComplete &&
                        !isCurrent &&
                        'border-border-strong bg-surface text-muted-light border',
                    )}
                  >
                    {isComplete ? <Check className="h-4 w-4" /> : position}
                  </span>
                  <span
                    className={cn(
                      'h-px flex-1 transition-colors',
                      isComplete ? 'bg-ink' : 'bg-border',
                      position === total && 'hidden',
                    )}
                  />
                </div>
                <div>
                  <p
                    className={cn(
                      'text-sm font-bold',
                      isCurrent || isComplete ? 'text-ink' : 'text-muted-light',
                    )}
                  >
                    {step.label}
                    {isCurrent && <span className="sr-only"> (current step)</span>}
                    {isComplete && <span className="sr-only"> (completed)</span>}
                  </p>
                  {step.description && (
                    <p className="text-muted-light mt-0.5 text-xs">{step.description}</p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

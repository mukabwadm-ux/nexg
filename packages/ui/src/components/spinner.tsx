import { cn } from '../lib/cn';

export interface SpinnerProps extends React.SVGProps<SVGSVGElement> {
  /** Accessible label; omit only when an adjacent element already announces the wait. */
  label?: string;
}

/** Indeterminate loading indicator used inside buttons, tables and panels. */
export function Spinner({ className, label = 'Loading', ...props }: SpinnerProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label={label}
      className={cn('h-4 w-4 animate-spin', className)}
      {...props}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

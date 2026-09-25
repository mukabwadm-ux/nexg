import { cn } from '../lib/cn';
import { Button } from './button';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Decorative glyph; hidden from assistive technology. */
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: { label: string; onClick?: () => void; href?: string };
  /** Renders in the danger tone, for "we could not load this" cases. */
  tone?: 'empty' | 'error';
  size?: 'sm' | 'md';
}

/**
 * Shown when a list, table or panel has nothing to display — and, in the
 * `error` tone, when loading it failed.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = 'empty',
  size = 'md',
  className,
  ...props
}: EmptyStateProps) {
  const isError = tone === 'error';

  return (
    <div
      role={isError ? 'alert' : undefined}
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed text-center',
        size === 'sm' ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-12',
        isError ? 'border-danger/30 bg-danger-bg/50' : 'border-border-strong bg-bg/60',
        className,
      )}
      {...props}
    >
      {icon && (
        <span
          aria-hidden="true"
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-full',
            isError ? 'bg-danger-bg text-danger' : 'bg-border/60 text-muted-light',
          )}
        >
          {icon}
        </span>
      )}

      <p className={cn('text-base font-bold', isError ? 'text-danger' : 'text-ink')}>{title}</p>

      {description && (
        <p className="text-muted-light max-w-sm text-sm leading-relaxed">{description}</p>
      )}

      {action &&
        (action.href ? (
          <Button asChild variant="outline" size="sm" className="mt-1">
            <a href={action.href}>{action.label}</a>
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="mt-1" onClick={action.onClick}>
            {action.label}
          </Button>
        ))}
    </div>
  );
}

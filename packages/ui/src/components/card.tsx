import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/cn';
import { Skeleton } from './skeleton';

const cardVariants = cva('rounded-xl border transition-shadow', {
  variants: {
    tone: {
      /** White panel on the cream page — the default everywhere. */
      surface: 'border-border bg-surface shadow-card',
      /** Cream panel, for nesting inside a white card. */
      muted: 'border-border bg-bg',
      /** Gold panel — the numbered "how it works" cards. */
      gold: 'bg-gold text-ink border-transparent',
      /** Dark panel — the "Host, ride, list or join." band. */
      ink: 'bg-ink border-transparent text-white',
    },
    interactive: {
      true: cn(
        'hover:shadow-raised cursor-pointer',
        'focus-within:ring-gold focus-within:ring-offset-bg focus-within:ring-2 focus-within:ring-offset-2',
      ),
      false: '',
    },
    padded: {
      true: 'p-4 sm:p-5',
      false: '',
    },
  },
  defaultVariants: { tone: 'surface', interactive: false, padded: true },
});

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  asChild?: never;
}

export function Card({ tone, interactive, padded, className, ...props }: CardProps) {
  return <div className={cn(cardVariants({ tone, interactive, padded }), className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('mb-3 flex items-start justify-between gap-3', className)} {...props} />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  // Content arrives through props.children, which the rule cannot see statically.
  // eslint-disable-next-line jsx-a11y/heading-has-content
  return <h3 className={cn('text-base font-bold leading-tight', className)} {...props} />;
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-muted text-sm', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('text-muted text-sm', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-4 flex items-center gap-2', className)} {...props} />;
}

/** Loading placeholder with the same footprint as a populated card. */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className} aria-busy="true">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="mt-3 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-4/5" />
      <Skeleton className="mt-4 h-9 w-28 rounded-lg" />
    </Card>
  );
}

export { cardVariants };

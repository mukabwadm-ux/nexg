'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';

import { cn } from '../lib/cn';

const tagVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full border text-xs font-semibold',
  {
    variants: {
      tone: {
        neutral: 'border-border-strong bg-surface text-muted',
        gold: 'border-gold/40 bg-gold-soft text-gold-text',
        /**
         * The gold pill on a dark band — "FEATURED MERCHANTS · NAIROBI".
         * Sampled from the artboard over #141414: fill #312A18, border
         * #725C20, text #D4A72C, which resolve to gold at 15% and 50%.
         * The cream `gold` tone is for light backgrounds and reads as a
         * bright slab against the dark.
         */
        goldOutline: 'border-gold/50 bg-gold/15 text-gold',
        ink: 'border-ink bg-ink text-white',
        /** The "SPONSORED" marker on featured merchant cards. */
        sponsored: 'border-transparent bg-white/15 text-white',
      },
      size: {
        sm: 'px-2 py-0.5',
        md: 'px-2.5 py-1',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'md' },
  },
);

export interface TagProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'onSelect'>,
    VariantProps<typeof tagVariants> {
  /** Renders a remove affordance and fires when it is used. */
  onRemove?: () => void;
  /** Label for the remove button, e.g. "Remove Nairobi filter". */
  removeLabel?: string;
}

/**
 * A small descriptive label — category, city, filter. Unlike `StatusBadge` a
 * Tag carries no lifecycle meaning, so it is safe for arbitrary metadata.
 */
export function Tag({
  tone,
  size,
  onRemove,
  removeLabel = 'Remove',
  className,
  children,
  ...props
}: TagProps) {
  return (
    <span className={cn(tagVariants({ tone, size }), className)} {...props}>
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className={cn(
            '-mr-1 ml-0.5 flex h-4 w-4 items-center justify-center rounded-full',
            'hover:bg-ink/10 transition-colors',
            'focus-visible:ring-gold focus-visible:outline-none focus-visible:ring-2',
          )}
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

export { tagVariants };

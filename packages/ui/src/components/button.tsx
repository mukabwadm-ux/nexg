'use client';

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../lib/cn';
import { Spinner } from './spinner';

const buttonVariants = cva(
  cn(
    'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg',
    'font-bold transition-colors duration-150',
    'focus-visible:ring-gold focus-visible:ring-offset-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-45',
  ),
  {
    variants: {
      variant: {
        /** Primary call to action — "Place your Order". */
        black: 'bg-ink hover:bg-ink/90 active:bg-ink/80 text-white',
        /** Accent action — the gold buttons on merchant cards. */
        gold: 'bg-gold text-ink hover:bg-gold/90 active:bg-gold/80',
        /** Secondary action sitting on cream or white. */
        outline: 'border-border-strong bg-surface text-ink hover:bg-bg active:bg-border/50 border',
        /** Low-emphasis action inside dense console rows. */
        ghost: 'text-muted hover:bg-border/50 hover:text-ink active:bg-border',
        /** Destructive review action — "Reject with reason". */
        danger: 'bg-danger hover:bg-danger/90 active:bg-danger/80 text-white',
      },
      size: {
        /** 36px — dense console rows only; pair with a larger hit area on touch. */
        sm: 'h-9 px-3 text-sm',
        /** 44px — the mobile-safe default touch target. */
        md: 'h-11 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'h-11 w-11',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'black', size: 'md', block: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render as the single child element instead of a <button> (e.g. a link). */
  asChild?: boolean;
  /** Shows a spinner and blocks interaction. Width is preserved to avoid layout shift. */
  loading?: boolean;
  /** Replaces the label while `loading`; falls back to the normal children. */
  loadingText?: string;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    block,
    asChild = false,
    loading = false,
    loadingText,
    leadingIcon,
    trailingIcon,
    children,
    disabled,
    type = 'button',
    ...props
  },
  ref,
) {
  // asChild hands rendering to the child element, which cannot accept our
  // spinner/icon wrappers — pass children straight through.
  if (asChild) {
    return (
      <Slot
        ref={ref}
        className={cn(buttonVariants({ variant, size, block }), className)}
        {...props}
      >
        {children}
      </Slot>
    );
  }

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size, block }), className)}
      {...props}
    >
      {loading ? <Spinner label="" aria-hidden="true" /> : leadingIcon}
      {loading && loadingText ? loadingText : children}
      {!loading && trailingIcon}
    </button>
  );
});

export { buttonVariants };

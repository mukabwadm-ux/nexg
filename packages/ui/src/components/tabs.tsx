'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as React from 'react';

import { cn } from '../lib/cn';

/**
 * In-place tabs (shadcn/ui's tabs on Radix) for switching views inside a
 * panel without a page load: a record's details and its history. The open
 * tab is the black pill of the admin portal designs. A page's own views are
 * links instead (?tab=), so they survive a reload and can be shared.
 */
export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className, ...props }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        'border-border bg-surface flex gap-1 overflow-x-auto rounded-xl border p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
      {...props}
    />
  );
});

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'text-muted flex min-h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-sm font-semibold transition-colors',
        'hover:bg-bg hover:text-ink',
        'focus-visible:ring-gold focus-visible:outline-none focus-visible:ring-2',
        'data-[state=active]:bg-ink data-[state=active]:font-bold data-[state=active]:text-white',
        'data-[state=active]:[&_svg]:text-gold',
        'disabled:pointer-events-none disabled:opacity-45',
        className,
      )}
      {...props}
    />
  );
});

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn(
        'focus-visible:ring-gold mt-4 rounded-lg focus-visible:outline-none focus-visible:ring-2',
        className,
      )}
      {...props}
    />
  );
});

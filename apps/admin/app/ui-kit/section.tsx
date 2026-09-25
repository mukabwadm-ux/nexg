'use client';

import { cn } from '@nexg/ui';

const SECTIONS = [
  'Button',
  'Input',
  'PhoneInput',
  'Select',
  'ChipGroup',
  'Stepper',
  'FileDrop',
  'StatusBadge',
  'Tag',
  'Card',
  'KpiTile',
  'DataTable',
  'DetailPanel',
  'Toast',
  'EmptyState',
] as const;

export type SectionName = (typeof SECTIONS)[number];

export const UI_KIT_SECTIONS = SECTIONS;

export function slugFor(name: string): string {
  return name.toLowerCase();
}

/** One component's block on the review page. */
export function Section({
  name,
  summary,
  children,
}: {
  name: SectionName;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <section id={slugFor(name)} className="scroll-mt-20">
      <div className="border-border-strong border-b pb-2">
        <h2 className="text-ink text-xl font-extrabold tracking-tight">{name}</h2>
        <p className="text-muted-light mt-0.5 text-sm">{summary}</p>
      </div>
      <div className="mt-5 flex flex-col gap-6">{children}</div>
    </section>
  );
}

/** A labelled state within a section, e.g. "Loading". */
export function State({
  label,
  note,
  className,
  children,
}: {
  label: string;
  note?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <h3 className="text-micro text-muted-light font-bold uppercase">{label}</h3>
        {note && <p className="text-muted-light/80 text-xs">{note}</p>}
      </div>
      <div className={cn('border-border bg-surface rounded-xl border p-4', className)}>
        {children}
      </div>
    </div>
  );
}

/** Horizontal wrap for small specimens. */
export function Row({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('flex flex-wrap items-center gap-3', className)}>{children}</div>;
}

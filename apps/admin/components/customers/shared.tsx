import { cn } from '@nexg/ui';
import { DatabaseZap } from 'lucide-react';
import * as React from 'react';

import { DashCard } from '@/components/portal/dash';
import { initials } from '@/lib/customers';

/** A customer's initials in the designs' gold square. Customers have no photo. */
export function CustomerAvatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center bg-gradient-to-br from-[#FFE9A8] to-[#F5C842] font-extrabold text-[#5E4300]',
        size === 'lg'
          ? 'h-16 w-16 rounded-xl text-[1.25rem]'
          : 'h-10 w-10 rounded-lg text-[0.8125rem]',
      )}
    >
      {initials(name)}
    </span>
  );
}

/**
 * Shown while production does not have the Customers functions yet: the
 * console deploys before the database change is applied, and this says so
 * rather than failing.
 */
export function WaitingForDatabase() {
  return (
    <DashCard>
      <div className="mx-auto flex max-w-[36rem] flex-col items-center py-14 text-center">
        <DatabaseZap aria-hidden="true" className="h-10 w-10 text-[#E5A800]" strokeWidth={1.6} />
        <p className="mt-4 text-[1.125rem] font-extrabold">Waiting for a database update</p>
        <p className="text-muted mt-2 text-sm font-semibold leading-relaxed">
          The Customers screens are ready, but the database they read from has not been updated yet.
          They will fill in on their own once it is; nothing needs doing on this page.
        </p>
      </div>
    </DashCard>
  );
}

/** A label and its value in the profile's details list. */
export function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted text-[0.8125rem] font-semibold">{label}</dt>
      <dd className="text-ink mt-0.5 break-words text-[0.9375rem] font-bold">{children}</dd>
    </div>
  );
}

/** "Nothing here yet" inside a card, saying what would appear. */
export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-muted py-8 text-center text-sm font-semibold">{children}</p>;
}

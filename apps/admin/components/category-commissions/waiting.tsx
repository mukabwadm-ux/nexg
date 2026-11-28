import { DatabaseZap } from 'lucide-react';

import { DashCard } from '@/components/portal/dash';

/**
 * Shown while production does not have the category commission functions
 * yet: the console deploys before the database change is applied, and this
 * says so rather than failing. Checkout keeps the presets until then.
 */
export function WaitingForDatabase() {
  return (
    <DashCard>
      <div className="mx-auto flex max-w-[36rem] flex-col items-center py-14 text-center">
        <DatabaseZap aria-hidden="true" className="h-10 w-10 text-[#E5A800]" strokeWidth={1.6} />
        <p className="mt-4 text-[1.125rem] font-extrabold">Waiting for a database update</p>
        <p className="text-muted mt-2 text-sm font-semibold leading-relaxed">
          Categories &amp; Commissions is ready, but the database it reads from has not been updated
          yet. It will fill in on its own once it is; until then checkout charges the preset rates.
        </p>
      </div>
    </DashCard>
  );
}

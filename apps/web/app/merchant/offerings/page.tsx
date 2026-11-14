import type { ReactNode } from 'react';

import { loadSetupOfferings } from '@/app/merchant/offering-setup-actions';
import { LiveOfferings } from '@/components/merchant/offerings/live';
import { CatalogueCsv } from '@/components/partner/catalogue-csv';
import type { CatalogueCsvItem } from '@/lib/catalogue-csv';
import { requireMerchant } from '@/lib/partner';
import { loadWorkspaceCatalogue } from '@/lib/merchant-workspace-catalogue';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Offerings' };

export default async function MerchantOfferingsPage({
  searchParams,
}: {
  searchParams?: { offering?: string };
}) {
  const merchant = await requireMerchant();
  const supabase = createClient();
  const catalogue = await loadWorkspaceCatalogue(supabase, merchant);
  /*
   * Older (legacy) merchants keep the catalogue CSV, which writes their
   * catalogue directly. New-form owners import from Offerings' own
   * "Import CSV", where rows become offerings they can keep editing.
   */
  let bulkUpload: ReactNode = null;
  if (merchant.access.state === 'legacy') {
    const [csvItems, csvSections] = await Promise.all([
      supabase
        .from('catalogue_item')
        .select(
          'id, section_id, name, description, price_kes, available, age_restricted, portion_size, ingredients, allergens, dietary_labels, availability_notes, handling_notes, storage_guidance, prep_time_minutes',
        )
        .eq('merchant_id', merchant.id)
        .order('sort'),
      supabase
        .from('catalogue_section')
        .select('id, name')
        .eq('merchant_id', merchant.id)
        .order('sort'),
    ]);
    bulkUpload = (
      <div className="px-4 pb-7 sm:px-6 lg:px-8">
        <CatalogueCsv
          merchantId={merchant.id}
          items={(csvItems.data as CatalogueCsvItem[] | null) ?? []}
          sections={csvSections.data ?? []}
        />
      </div>
    );
  }
  if (!catalogue.activities.length) {
    return (
      <>
        <div className="p-6">
          <h1>Offerings</h1>
          <p>Choose a business activity in Home before using the offering editor.</p>
        </div>
        {bulkUpload}
      </>
    );
  }
  const offeringId = searchParams?.offering;
  const savedDrafts = offeringId && catalogue.canEditDrafts ? await loadSetupOfferings() : null;
  const requestedActivity = savedDrafts?.ok
    ? savedDrafts.items.find((item) => item.id === offeringId)?.profileId
    : undefined;
  const initialActivityId = catalogue.activities.find(
    (activity) => activity.id === requestedActivity,
  )?.id;
  return (
    <>
      <LiveOfferings
        {...catalogue}
        initialActivityId={initialActivityId}
        initialOfferingId={offeringId}
      />
      {bulkUpload}
    </>
  );
}

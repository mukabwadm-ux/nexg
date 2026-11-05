import { loadSetupOfferings } from '@/app/merchant/offering-setup-actions';
import { LiveOfferings } from '@/components/merchant/offerings/live';
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
  const catalogue = await loadWorkspaceCatalogue(createClient(), merchant);
  if (!catalogue.activities.length) {
    return (
      <div className="p-6">
        <h1>Offerings</h1>
        <p>Choose a business activity in Home before using the offering editor.</p>
      </div>
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
    <LiveOfferings
      {...catalogue}
      initialActivityId={initialActivityId}
      initialOfferingId={offeringId}
    />
  );
}

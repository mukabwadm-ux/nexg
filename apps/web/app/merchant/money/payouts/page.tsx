import { z } from 'zod';

import { PayoutDetails } from '@/components/merchant/money/payout-details';
import { requireMerchant } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Payouts' };
export const dynamic = 'force-dynamic';

const PayoutRead = z.object({
  version: z.number().int().nonnegative(),
  payout: z.record(z.string()).nullable(),
});

/**
 * Money › Payouts: where the business owner adds or changes the account NexG
 * pays them into. "Set up payouts" on Home and in setup lands here.
 *
 * The shell entry is enough to open it: an owner still waiting for approval
 * can declare where to be paid, and a manager sees the page without the form.
 * Businesses from before the application form have their payout account set
 * up with Finance and keep changing it through support.
 */
export default async function MerchantPayouts() {
  const me = await requireMerchant({ access: 'shell' });
  const client = createClient();
  const home = await client
    .from('merchant_home_v')
    .select('payout_rail')
    .eq('merchant_id', me.id)
    .maybeSingle();
  const verifiedRail = home.error ? undefined : (home.data?.payout_rail ?? null);

  if (me.access.state === 'legacy')
    return <PayoutDetails mode="legacy" verifiedRail={verifiedRail} />;
  if (me.isAnonymous) return <PayoutDetails mode="anonymous" verifiedRail={verifiedRail} />;
  if (!me.access.setup) return <PayoutDetails mode="read-only" verifiedRail={verifiedRail} />;

  const read = await client.rpc('rpc_merchant_application_payout_read', {
    p_merchant_id: me.id,
  });
  const parsed = PayoutRead.safeParse(read.data);
  return (
    <PayoutDetails
      mode="owner"
      merchantId={me.id}
      verifiedRail={verifiedRail}
      declaration={!read.error && parsed.success ? parsed.data : undefined}
    />
  );
}

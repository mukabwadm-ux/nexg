import { RiderPageHead } from '@/components/rider/frame';
import { RiderKit, type RiderKitStatus } from '@/components/rider/rider-kit';
import { requireRider } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Rider kit' };
export const dynamic = 'force-dynamic';

export default async function RiderKitPage() {
  const me = await requireRider();
  const { data, error } = await createClient().rpc('rpc_rider_kit_status', { p_rider_id: me.id });

  return (
    <>
      <RiderPageHead
        title="Rider kit"
        lead="Your NexG branded kit. Order it here, pay at your onboarding session, and collect it there or have it delivered."
      />
      {error ? (
        <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-[0.8125rem] font-bold">
          We could not read your kit order: {error.message}
        </p>
      ) : (
        <RiderKit riderId={me.id} status={data as unknown as RiderKitStatus | null} />
      )}
    </>
  );
}

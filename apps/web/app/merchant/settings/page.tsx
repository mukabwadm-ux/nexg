import { MerchantPage, NotBuiltYet, merchantContext } from '@/components/merchant/frame';

export const metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { m, live, nav } = await merchantContext();
  if (!m) return null;

  return (
    <MerchantPage
      m={m}
      live={live}
      nav={nav}
      current="/merchant/settings"
      title="Settings"
      lead="Your profile, notifications and payout details."
    >
      <NotBuiltYet what="Settings" willHold="Business profile and photos, the delivery notes riders see, which notifications go to which role, payout details, language, and what we hold about you under the KDPA." />
    </MerchantPage>
  );
}

import { MerchantPage, NotBuiltYet, merchantContext } from '@/components/merchant/frame';

export const metadata = { title: 'Hours' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { m, live, nav } = await merchantContext();
  if (!m) return null;

  return (
    <MerchantPage
      m={m}
      live={live}
      nav={nav}
      current="/merchant/hours"
      title="Hours"
      lead="Your week, holidays, and the overrides you set on the day."
    >
      <NotBuiltYet what="Hours" willHold="Weekly opening hours per branch, which public holidays you follow, closing early today, and a busy override that adds minutes to your prep estimate so guests see it before they order rather than after." />
    </MerchantPage>
  );
}

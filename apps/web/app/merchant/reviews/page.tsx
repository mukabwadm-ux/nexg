import { MerchantPage, NotBuiltYet, merchantContext } from '@/components/merchant/frame';

export const metadata = { title: 'Reviews' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { m, live, nav } = await merchantContext();
  if (!m) return null;

  return (
    <MerchantPage
      m={m}
      live={live}
      nav={nav}
      current="/merchant/reviews"
      title="Reviews"
      lead="What guests said, and your reply."
    >
      <NotBuiltYet what="Reviews" willHold="Ratings and comments from delivered orders, with a moderated reply. Reviews feed your health band, which is what decides Featured eligibility." />
    </MerchantPage>
  );
}

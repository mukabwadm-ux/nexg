import { MerchantPage, NotBuiltYet, merchantContext } from '@/components/merchant/frame';

export const metadata = { title: 'Support' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { m, live, nav } = await merchantContext();
  if (!m) return null;

  return (
    <MerchantPage
      m={m}
      live={live}
      nav={nav}
      current="/merchant/support"
      title="Support"
      lead="The handbook, and a person."
    >
      <NotBuiltYet what="Support" willHold="How accepting and prep times work, what happens when an order goes wrong, how settlements are calculated, and a thread to merchant ops about any of it." />
    </MerchantPage>
  );
}

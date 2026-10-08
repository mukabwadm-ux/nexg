import { MerchantPage, NotBuiltYet, merchantContext } from '@/components/merchant/frame';

export const metadata = { title: 'Team' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { m, live, nav } = await merchantContext();
  if (!m) return null;

  return (
    <MerchantPage
      m={m}
      live={live}
      nav={nav}
      current="/merchant/team"
      title="Team"
      lead="Who else can see this business, and the counter phone."
    >
      <NotBuiltYet what="Team" willHold="Managers and cashiers with per-branch scope, the counter device that plays the order sound, and a log of who changed what. A cashier sees the queue and never the money." />
    </MerchantPage>
  );
}

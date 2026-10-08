import { MerchantPage, NotBuiltYet, merchantContext } from '@/components/merchant/frame';

export const metadata = { title: 'Disputes' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { m, live, nav } = await merchantContext();
  if (!m) return null;

  return (
    <MerchantPage
      m={m}
      live={live}
      nav={nav}
      current="/merchant/disputes"
      title="Disputes"
      lead="A guest said something went wrong. Each one has a reply deadline."
    >
      <NotBuiltYet what="Disputes" willHold="Open disputes with the order attached, the evidence you upload, and the deadline after which it is decided without you. Closed ones keep their outcome and the reasoning behind it." />
    </MerchantPage>
  );
}

import { HostSection, NotBuiltYet, hostContext } from '@/components/host/section';

export const metadata = { title: 'Analytics' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { home, live, nav } = await hostContext();
  if (!home) return null;

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      current="/host/analytics"
      title="Analytics"
      lead="Orders by unit, hour and category"
      headlineValue="Soon"
      headlineNote="From your QR activity"
    >
      <NotBuiltYet what="Analytics" willHold="Which units get used, at what hour, what guests order, scan-to-order conversion and repeat guests. Exports to Excel, CSV or PDF, with every export recorded against your account." />
    </HostSection>
  );
}

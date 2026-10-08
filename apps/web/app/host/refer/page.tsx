import { HostSection, NotBuiltYet, hostContext } from '@/components/host/section';

export const metadata = { title: 'Refer a Host' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { home, live, nav } = await hostContext();
  if (!home) return null;

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      current="/host/refer"
      title="Refer a Host"
      lead="Introduce another host"
      headlineValue="Soon"
      headlineNote="Terms not set yet"
    >
      <NotBuiltYet what="Refer a Host" willHold="Your referral link, who has joined through it and what stage they are at. Reward terms are not set yet, so no amount is shown rather than a placeholder somebody might count on." />
    </HostSection>
  );
}

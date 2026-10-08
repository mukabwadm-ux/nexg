import { HostSection, NotBuiltYet, hostContext } from '@/components/host/section';

export const metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { home, live, nav } = await hostContext();
  if (!home) return null;

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      current="/host/settings"
      title="Settings"
      lead="Your account and how we reach you"
      headlineValue="Soon"
      headlineNote="Account and notifications"
    >
      <NotBuiltYet what="Settings" willHold="Your contact details, which notifications go to which role, front-desk devices, language, and the billing details used for welcome packages." />
    </HostSection>
  );
}

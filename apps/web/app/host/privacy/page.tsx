import { HostSection, NotBuiltYet, hostContext } from '@/components/host/section';

export const metadata = { title: 'Data & Privacy' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { home, live, nav } = await hostContext();
  if (!home) return null;

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      current="/host/privacy"
      title="Data & Privacy"
      lead="What we hold and your rights"
      headlineValue="Soon"
      headlineNote="Your rights, in one place"
    >
      <NotBuiltYet what="Data & Privacy" willHold="The consents on your account, any data request raised against it, how long we keep guest records, and your own export of everything we hold about you under the KDPA." />
    </HostSection>
  );
}

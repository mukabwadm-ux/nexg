import type { Metadata } from 'next';

import { ConsoleShell } from '@/components/console-shell';
import { DashCanvas } from '@/components/portal/dash';
import { HOST_TAB_KEYS, HostsScreen } from '@/components/stays/hosts-screen';
import { ErrorNote, StaysHeader, WaitingForDatabase } from '@/components/stays/module';
import { oneOf, PAGE_SIZE, pageOf, staysHref, uuidOrNull } from '@/lib/stays-module';
import { staysContext } from '@/lib/stays-server';

export const metadata: Metadata = { title: 'Stays · Hosts' };
export const dynamic = 'force-dynamic';

/* Matches authz.works_hospitality(), which approving and rejecting check. */
const DECIDERS = ['ops_manager', 'partnerships', 'city_lead'];

export default async function Page({
  searchParams,
}: {
  searchParams?: {
    from?: string;
    to?: string;
    city?: string;
    tab?: string;
    q?: string;
    page?: string;
    selected?: string;
  };
}) {
  const ctx = await staysContext(searchParams);
  const { period, city } = ctx;
  const tab = oneOf(HOST_TAB_KEYS, searchParams?.tab, 'all');
  const q = (searchParams?.q ?? '').slice(0, 120);
  const page = pageOf(searchParams?.page);
  const list = await ctx.read('rpc_console_stays_hosts', {
    p_tab: tab,
    p_q: q || null,
    p_page: page,
    p_size: PAGE_SIZE,
  });

  return (
    <ConsoleShell staff={ctx.staff}>
      <StaysHeader
        screen="Hosts"
        subtitle="Hosts who registered on the website, waiting for approval, live, sent back or declined."
        period={period}
        cities={ctx.cities}
        city={city}
        noPeriod
        exportHref={staysHref('/stays/export', period, city, { report: 'hosts' })}
      />
      <DashCanvas>
        {list.waiting ? (
          <WaitingForDatabase />
        ) : list.error ? (
          <ErrorNote message={list.error} />
        ) : (
          <HostsScreen
            variant="hosts"
            data={list.data}
            period={period}
            city={city}
            tab={tab}
            q={q}
            page={page}
            size={PAGE_SIZE}
            selected={uuidOrNull(searchParams?.selected)}
            canDecide={ctx.staff.isSuperAdmin || ctx.staff.roles.some((r) => DECIDERS.includes(r))}
          />
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}

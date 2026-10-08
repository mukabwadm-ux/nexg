import { HostSection, NotBuiltYet, hostContext } from '@/components/host/section';

export const metadata = { title: 'Earnings & Invoices' };
export const dynamic = 'force-dynamic';

export default async function HostEarningsPage() {
  const { home, live, nav } = await hostContext();
  if (!home) return null;

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      current="/host/earnings"
      title="Earnings & Invoices"
      lead="What was ordered from your units, and any invoice for welcome packages you asked us to place."
      headlineValue="KES —"
      headlineNote="No statement yet"
    >
      {/*
        Stated here rather than only in the Host Agreement,
        because "what does this cost me" is the question a host
        opens this page to answer, and a page that makes them
        hunt for it reads as though there is something to find.
      */}
      <div className="border-border bg-surface rounded-xl border p-5">
        <h2 className="text-[0.9375rem] font-extrabold tracking-tight">
          Listing costs you nothing
        </h2>
        <p className="text-muted mt-1 text-[0.8125rem] font-semibold leading-[1.7]">
          Guests pay per order, the same as anybody else ordering from NexG. You are invoiced only
          for welcome packages you ask us to place in a unit. There is no commission share on
          guest orders — and if that ever changes it will be in your Host Agreement before it
          appears on this page.
        </p>
      </div>

      <NotBuiltYet
        what="The monthly statement"
        willHold="Orders attributed to each of your units for the month, any package invoices, and the statement as PDF or Excel. It is built from the first full month after you go live."
      />
    </HostSection>
  );
}

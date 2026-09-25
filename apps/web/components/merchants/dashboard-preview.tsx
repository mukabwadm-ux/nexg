import { VALUE_PLACEHOLDER } from '@nexg/ui';

/**
 * The merchant dashboard band from the `Merchants` artboard.
 *
 * Every figure is [—]: the dashboard does not exist yet and no order data
 * does either, so showing plausible sales numbers would be inventing them
 * (ground rule 3). Names are bracketed for the same reason.
 */

const NAV = ['Orders', 'Menu & catalogue', 'Opening hours', 'Payouts', 'Reviews'] as const;

const ORDERS = [
  {
    items: '2 × [Menu item], 1 × [Drink]',
    to: '[Hotel], Rm [—]',
    rider: 'Awaiting',
    state: 'Accept',
  },
  {
    items: '1 × [Menu item]',
    to: '[Apartment], Kilimani',
    rider: '[Rider] · en route',
    state: 'Preparing',
  },
  {
    items: '3 × [Menu item]',
    to: '[Hotel], Rm [—]',
    rider: '[Rider] · picked up',
    state: 'On the way',
  },
  {
    items: '1 × [Menu item], 2 × [Drink]',
    to: '[Hotel], Rm [—]',
    rider: '[Rider]',
    state: 'Delivered',
  },
] as const;

const STATE_STYLES: Record<string, string> = {
  Accept: 'bg-gold text-ink',
  Preparing: 'bg-warning-bg text-warning',
  'On the way': 'bg-ink text-white',
  Delivered: 'bg-success-bg text-success',
};

export function DashboardPreview() {
  return (
    <section className="bg-ink py-14 text-white sm:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <span className="bg-gold text-ink inline-block rounded-full px-3 py-1 text-[0.625rem] font-bold uppercase tracking-widest">
          Merchant dashboard
        </span>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <h2 className="max-w-lg text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            Every order, rider and shilling in one place.
          </h2>
          <p className="max-w-xs text-sm leading-relaxed text-white/60">
            Accept with one tap, watch the rider arrive, and see what you&apos;ve sold today without
            leaving the counter.
          </p>
        </div>

        {/* The dashboard itself. Decorative: the real thing arrives with the
            merchant portal, and a screen reader gains nothing from the mock. */}
        <div
          aria-hidden="true"
          className="bg-surface text-ink shadow-raised mt-8 overflow-hidden rounded-2xl"
        >
          <div className="flex">
            <aside className="border-border bg-bg hidden w-44 shrink-0 border-r p-3 sm:block">
              <p className="text-muted-light text-[0.625rem] font-bold uppercase tracking-widest">
                [Your business]
              </p>
              <ul className="mt-3 space-y-1">
                {NAV.map((item, index) => (
                  <li
                    key={item}
                    className={`rounded-md px-2 py-1.5 text-xs font-semibold ${
                      index === 0 ? 'bg-gold text-ink' : 'text-muted'
                    }`}
                  >
                    {item}
                  </li>
                ))}
              </ul>
              <div className="border-border bg-surface mt-6 rounded-lg border p-2">
                <p className="text-muted-light text-[0.5rem] font-bold uppercase tracking-widest">
                  Status
                </p>
                <p className="mt-1 flex items-center justify-between text-[0.6875rem] font-bold">
                  Accepting orders
                  <span className="bg-gold ml-2 h-3.5 w-6 rounded-full p-0.5">
                    <span className="bg-ink block h-2.5 w-2.5 translate-x-2.5 rounded-full" />
                  </span>
                </p>
              </div>
            </aside>

            <div className="min-w-0 flex-1 p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-extrabold">Today</p>
                <p className="text-muted-light text-[0.625rem]">Mon 21 Sep</p>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                {[
                  { label: 'Orders', value: VALUE_PLACEHOLDER },
                  { label: 'Sales', value: `KES ${VALUE_PLACEHOLDER}` },
                  { label: 'Avg prep time', value: `${VALUE_PLACEHOLDER} min` },
                  { label: 'Next payout', value: `Fri · KES ${VALUE_PLACEHOLDER}`, dark: true },
                ].map((tile) => (
                  <div
                    key={tile.label}
                    className={`rounded-lg border p-2.5 ${
                      tile.dark ? 'bg-ink border-transparent text-white' : 'border-border bg-bg'
                    }`}
                  >
                    <p
                      className={`text-[0.5rem] font-bold uppercase tracking-widest ${
                        tile.dark ? 'text-white/50' : 'text-muted-light'
                      }`}
                    >
                      {tile.label}
                    </p>
                    <p className="mt-1 text-base font-extrabold tracking-tight">{tile.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[34rem] border-collapse text-left">
                  <thead>
                    <tr className="border-border border-b">
                      {['Order', 'Items', 'Deliver to', 'Rider', 'Status'].map((heading) => (
                        <th
                          key={heading}
                          className="text-muted-light px-2 py-1.5 text-[0.5rem] font-bold uppercase tracking-widest"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ORDERS.map((order, index) => (
                      <tr key={index} className="border-border border-b last:border-0">
                        <td className="whitespace-nowrap px-2 py-2 text-[0.625rem] font-bold">
                          #[—]
                        </td>
                        <td className="px-2 py-2 text-[0.625rem]">{order.items}</td>
                        <td className="text-muted px-2 py-2 text-[0.625rem]">{order.to}</td>
                        <td className="text-muted px-2 py-2 text-[0.625rem]">{order.rider}</td>
                        <td className="px-2 py-2">
                          <span
                            className={`inline-block whitespace-nowrap rounded-md px-2 py-1 text-[0.5rem] font-bold ${
                              STATE_STYLES[order.state]
                            }`}
                          >
                            {order.state}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

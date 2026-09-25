import { Bell, Home, MessageSquare, Search, User, UtensilsCrossed } from 'lucide-react';

/**
 * The two phones in the app section of the `BookingFirst` artboard: a live map
 * behind, and the concierge home in front.
 *
 * Drawn in markup rather than shipped as a screenshot — the rider app does not
 * exist yet, so there is nothing real to photograph, and a mocked-up image
 * would be a picture of a product that has not been built. Everything inside
 * is bracketed for the same reason.
 */
export function AppPreview() {
  return (
    <div aria-hidden="true" className="relative mx-auto h-[30rem] w-full max-w-lg">
      {/* Behind: the live map. */}
      <div className="border-ink shadow-raised absolute left-2 top-8 h-[25rem] w-52 -rotate-6 overflow-hidden rounded-[1.75rem] border-[5px] bg-[#EFEBE2]">
        <div className="border-border border-b px-2.5 py-2">
          <p className="text-muted-light text-[0.5rem] font-bold uppercase tracking-widest">
            Live · concierge on the way
          </p>
        </div>
        <div className="relative h-44 bg-[#E7E2D6]">
          <svg viewBox="0 0 160 160" className="h-full w-full">
            <path
              d="M12 140 C 50 120, 60 70, 100 54 S 140 30, 150 22"
              fill="none"
              className="stroke-ink"
              strokeWidth="2"
              strokeDasharray="5 5"
            />
            <circle cx="12" cy="140" r="5" className="fill-ink" />
            <circle cx="150" cy="22" r="6" className="fill-gold" />
          </svg>
        </div>
        <div className="space-y-1.5 p-2.5">
          <div className="bg-surface flex items-center gap-1.5 rounded-lg p-1.5">
            <span className="bg-gold text-ink flex h-5 w-5 items-center justify-center rounded-full text-[0.5rem] font-bold">
              CN
            </span>
            <span className="text-[0.5rem] font-bold">[Concierge name]</span>
          </div>
          <div className="bg-ink rounded-lg px-2 py-1.5 text-center text-[0.5rem] font-bold text-white">
            Message concierge
          </div>
        </div>
      </div>

      {/* In front: the concierge home. */}
      <div className="border-ink bg-surface shadow-raised absolute right-0 top-0 h-[28rem] w-56 overflow-hidden rounded-[1.75rem] border-[5px]">
        <div className="flex items-start justify-between gap-2 px-3 pb-2 pt-3">
          <span>
            <span className="text-muted-light block text-[0.5rem]">Good evening</span>
            <span className="block text-[0.6rem] font-extrabold">Staying at [your hotel]</span>
          </span>
          <Bell className="text-muted-light h-3 w-3 shrink-0" />
        </div>

        <div className="border-border-strong text-muted-light mx-3 rounded-lg border px-2 py-1.5 text-[0.5rem]">
          What can we arrange?
        </div>

        <div className="mt-3 grid grid-cols-4 gap-1 px-3">
          {['Transfer', 'Dining', 'Shopping', 'More'].map((label, index) => (
            <span key={label} className="flex flex-col items-center gap-1">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full ${
                  index === 0 ? 'bg-gold text-ink' : 'bg-bg text-muted'
                }`}
              >
                <UtensilsCrossed className="h-3 w-3" />
              </span>
              <span className="text-[0.4rem] font-semibold">{label}</span>
            </span>
          ))}
        </div>

        <div className="mt-3 px-3">
          <p className="text-muted-light text-[0.5rem] font-bold uppercase tracking-widest">
            Active request
          </p>
          <div className="bg-ink mt-1.5 rounded-lg p-2">
            <div className="flex items-start justify-between gap-1">
              <span className="text-[0.5rem] font-bold text-white">Airport transfer</span>
              <span className="bg-gold text-ink rounded-full px-1.5 py-0.5 text-[0.4rem] font-bold">
                On the way
              </span>
            </div>
            <p className="mt-1 text-[0.45rem] text-white/50">JKIA → your hotel · Tonight</p>
            <div className="mt-2 flex items-center gap-1.5 rounded-md bg-white/10 p-1.5">
              <span className="bg-gold text-ink flex h-4 w-4 items-center justify-center rounded-full text-[0.4rem] font-bold">
                CN
              </span>
              <span className="text-[0.45rem] text-white/80">[Concierge name]</span>
            </div>
          </div>
        </div>

        <div className="mt-3 px-3">
          <div className="bg-bg flex items-center justify-between rounded-lg p-2">
            <span>
              <span className="block text-[0.5rem] font-bold">Pay how you like</span>
              <span className="text-muted-light block text-[0.45rem]">
                Card · M-Pesa · On account
              </span>
            </span>
            <span className="bg-surface rounded px-1.5 py-0.5 text-[0.4rem] font-bold">M-PESA</span>
          </div>
        </div>

        <div className="border-border bg-surface absolute inset-x-0 bottom-0 flex justify-around border-t py-2">
          {[Home, Search, MessageSquare, User].map((Icon, index) => (
            <Icon
              key={index}
              className={`h-3 w-3 ${index === 0 ? 'text-ink' : 'text-muted-light'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** App Store and Google Play badges, as the artboard shows them. */
export function StoreBadges() {
  const badges = [
    { top: 'Soon on the', bottom: 'App Store' },
    { top: 'Soon on', bottom: 'Google Play' },
  ];

  return (
    <ul className="mt-5 flex flex-wrap gap-2">
      {badges.map((badge) => (
        <li
          key={badge.bottom}
          className="bg-ink flex items-center gap-2 rounded-lg px-3 py-1.5 text-white"
        >
          <span aria-hidden="true" className="h-4 w-4 rounded-sm bg-white/20" />
          <span className="leading-tight">
            <span className="block text-[0.45rem] uppercase tracking-widest text-white/50">
              {badge.top}
            </span>
            <span className="block text-[0.7rem] font-bold">{badge.bottom}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

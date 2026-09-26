import { BarChart2, Home, MessageSquare, User } from 'lucide-react';
import { VALUE_PLACEHOLDER } from '@nexg/ui';

/**
 * The rider app phone from the `Riders` artboard: 300x620 on a 106px-padded
 * dark band, with the greeting, the two earnings tiles, the route, and a live
 * request carrying Skip and Accept.
 *
 * Earnings and distances are [—] or bracketed: the app does not exist and
 * there is no ride data, so a number here would be invented (ground rule 3).
 */
export function RiderAppPreview() {
  return (
    <div
      aria-hidden="true"
      className="border-ink/80 shadow-raised mx-auto flex h-[38.75rem] w-[18.75rem] flex-col overflow-hidden rounded-[2.25rem] border-[9px] bg-white"
    >
      {/* greeting */}
      <div className="flex items-center justify-between px-4 pb-3 pt-4">
        <span className="flex items-center gap-2">
          <svg viewBox="0 0 32 36" className="h-7 w-6 shrink-0" aria-hidden="true">
            <path
              d="M16 1c-6.6 0-12 5.2-12 11.7 0 8.2 10.2 19.1 11.2 20.2a1.1 1.1 0 0 0 1.6 0C17.8 31.8 28 20.9 28 12.7 28 6.2 22.6 1 16 1Z"
              className="fill-gold"
            />
            <circle cx="16" cy="12" r="4.4" className="fill-ink" />
          </svg>
          <span>
            <span className="text-muted-light block text-[0.6875rem]">Good morning</span>
            <span className="text-ink block text-[0.8125rem] font-extrabold">[Rider name]</span>
          </span>
        </span>
        <span className="bg-ink flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.625rem] font-bold uppercase tracking-wide text-white">
          <span className="bg-gold h-1.5 w-1.5 rounded-full" />
          Online
        </span>
      </div>

      {/* earnings */}
      <div className="mx-4 grid grid-cols-2 gap-2">
        {[
          { label: 'Today', value: `KES ${VALUE_PLACEHOLDER}` },
          { label: 'Deliveries', value: VALUE_PLACEHOLDER },
        ].map((stat) => (
          <div key={stat.label} className="border-border rounded-xl border bg-white px-3 py-2">
            <p className="text-muted-light text-[0.5625rem] font-bold uppercase tracking-widest">
              {stat.label}
            </p>
            <p className="text-ink mt-0.5 text-[0.9375rem] font-extrabold">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* route */}
      <div className="relative mx-4 mt-3 overflow-hidden rounded-xl bg-[#E7E4DC]">
        <span className="bg-surface text-ink absolute left-2.5 top-2.5 rounded-full px-2.5 py-1 text-[0.625rem] font-bold shadow-sm">
          Pickup · {VALUE_PLACEHOLDER} km
        </span>
        <svg viewBox="0 0 240 140" className="h-[8.5rem] w-full">
          <g className="stroke-ink/10" strokeWidth="1">
            <path d="M0 40h240M0 80h240M0 120h240M60 0v140M120 0v140M180 0v140" />
          </g>
          <path
            d="M24 118 C 80 104, 96 56, 150 40 S 206 22, 220 18"
            fill="none"
            className="stroke-ink"
            strokeWidth="3"
            strokeDasharray="7 7"
            strokeLinecap="round"
          />
          <circle cx="24" cy="118" r="6" className="fill-ink" />
          <circle cx="220" cy="18" r="8" className="fill-gold stroke-ink" strokeWidth="2" />
        </svg>
      </div>

      {/* live request */}
      <div className="bg-ink mx-4 mt-3 rounded-xl p-3">
        <p className="text-gold text-[0.625rem] font-bold uppercase tracking-widest">New request</p>
        <div className="mt-1 flex items-start justify-between gap-2">
          <p className="text-[0.8125rem] font-extrabold leading-snug text-white">
            Dinner · [Restaurant] → [Hotel]
          </p>
          <p className="text-gold shrink-0 text-right text-[0.75rem] font-extrabold leading-tight">
            KES
            <br />
            {VALUE_PLACEHOLDER}
          </p>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[0.625rem] text-white/50">
          <span>
            Pickup {VALUE_PLACEHOLDER} km · Drop {VALUE_PLACEHOLDER} km
          </span>
          <span>Expires in 0:42</span>
        </div>
        <div className="mt-3 flex gap-2">
          <span className="flex-1 rounded-lg border border-white/25 py-2 text-center text-[0.75rem] font-bold text-white">
            Skip
          </span>
          <span className="bg-gold text-ink flex-[2] rounded-lg py-2 text-center text-[0.75rem] font-bold">
            Accept request
          </span>
        </div>
      </div>

      {/* nav */}
      <div className="border-border mt-auto flex justify-around border-t py-4">
        {[Home, BarChart2, MessageSquare, User].map((Icon, index) => (
          <Icon
            key={index}
            className={`h-4 w-4 ${index === 0 ? 'text-ink' : 'text-muted-light'}`}
          />
        ))}
      </div>
    </div>
  );
}

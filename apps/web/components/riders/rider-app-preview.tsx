import { Home, MessageSquare, TrendingUp, User } from 'lucide-react';
import { VALUE_PLACEHOLDER } from '@nexg/ui';

/**
 * The rider app phone from the `Riders` artboard.
 *
 * Earnings and distances are [—]: the app does not exist and there is no ride
 * data, so a number here would be invented (ground rule 3).
 */
export function RiderAppPreview() {
  return (
    <div
      aria-hidden="true"
      className="bg-surface shadow-raised mx-auto h-[26rem] w-[13.5rem] overflow-hidden rounded-[1.75rem] border-[6px] border-white/15"
    >
      <div className="flex items-center justify-between px-3 pb-2 pt-3">
        <span className="flex items-center gap-1.5">
          <span className="bg-gold text-ink flex h-6 w-6 items-center justify-center rounded-full text-[0.5rem] font-bold">
            R
          </span>
          <span>
            <span className="text-muted-light block text-[0.45rem]">Good morning</span>
            <span className="block text-[0.6rem] font-extrabold">[Rider name]</span>
          </span>
        </span>
        <span className="bg-ink flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.4rem] font-bold text-white">
          <span className="bg-success h-1 w-1 rounded-full" />
          Online
        </span>
      </div>

      <div className="mx-3 grid grid-cols-2 gap-1.5">
        {[
          { label: 'Today', value: `KES ${VALUE_PLACEHOLDER}` },
          { label: 'Deliveries', value: VALUE_PLACEHOLDER },
        ].map((stat) => (
          <div key={stat.label} className="border-border bg-bg rounded-lg border p-1.5">
            <p className="text-muted-light text-[0.4rem] font-bold uppercase tracking-widest">
              {stat.label}
            </p>
            <p className="mt-0.5 text-[0.7rem] font-extrabold">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mx-3 mt-2 overflow-hidden rounded-lg bg-[#E7E2D6]">
        <p className="text-muted px-2 pt-1.5 text-[0.4rem] font-bold uppercase tracking-widest">
          Pickup · {VALUE_PLACEHOLDER} km
        </p>
        <svg viewBox="0 0 160 90" className="h-20 w-full">
          <path
            d="M10 78 C 45 64, 58 36, 96 28 S 138 16, 150 12"
            fill="none"
            className="stroke-ink"
            strokeWidth="2"
            strokeDasharray="5 5"
          />
          <circle cx="10" cy="78" r="4" className="fill-ink" />
          <circle cx="150" cy="12" r="5" className="fill-gold" />
        </svg>
      </div>

      <div className="border-gold/40 bg-gold-soft mx-3 mt-2 rounded-lg border p-2">
        <div className="flex items-start justify-between gap-2">
          <span className="text-gold-text text-[0.45rem] font-bold uppercase tracking-widest">
            New request
          </span>
          <span className="text-[0.5rem] font-extrabold">KES {VALUE_PLACEHOLDER}</span>
        </div>
        <p className="mt-1 text-[0.55rem] font-bold leading-snug">
          Dinner · [Restaurant] → [Hotel]
        </p>
        <p className="text-muted mt-0.5 text-[0.45rem]">
          Pickup {VALUE_PLACEHOLDER} km · Drop {VALUE_PLACEHOLDER} km · Expires in 0:42
        </p>
        <div className="mt-2 flex gap-1.5">
          <span className="border-border-strong bg-surface flex-1 rounded-md border py-1 text-center text-[0.5rem] font-bold">
            Skip
          </span>
          <span className="bg-gold text-ink flex-[2] rounded-md py-1 text-center text-[0.5rem] font-bold">
            Accept request
          </span>
        </div>
      </div>

      <div className="border-border mt-3 flex justify-around border-t py-2">
        {[Home, TrendingUp, MessageSquare, User].map((Icon, index) => (
          <Icon
            key={index}
            className={`h-3 w-3 ${index === 0 ? 'text-ink' : 'text-muted-light'}`}
          />
        ))}
      </div>
    </div>
  );
}

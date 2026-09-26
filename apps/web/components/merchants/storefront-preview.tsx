import { VALUE_PLACEHOLDER } from '@nexg/ui';
import { Check, ImageIcon, Star } from 'lucide-react';

/**
 * "How guests will see you" — the storefront card in the merchants hero.
 *
 * Decorative: it shows a merchant their own card before they have one, so
 * every field is bracketed and every figure is [—]. Nothing here is data.
 */
export function StorefrontPreview() {
  return (
    <div aria-hidden="true" className="relative">
      <div className="bg-surface shadow-raised rounded-2xl p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-micro text-muted-light font-bold uppercase tracking-[0.12em]">
            How guests will see you
          </p>
          <span className="bg-success-bg text-success flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-bold">
            <span className="bg-success h-1.5 w-1.5 rounded-full" />
            Open now
          </span>
        </div>

        <div className="mt-4 flex h-[11.25rem] flex-col items-center justify-center gap-2 rounded-xl bg-[#EFEAE0]">
          <ImageIcon className="text-muted-light/70 h-6 w-6" />
          <span className="text-muted-light text-[0.6875rem] font-semibold uppercase tracking-wide">
            [Your cover photo]
          </span>
        </div>

        <div className="mt-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[1.375rem] font-extrabold">[Your business name]</p>
            <p className="text-muted mt-1 text-[0.8125rem] font-bold">
              Restaurant · Westlands, Nairobi · Delivers in {VALUE_PLACEHOLDER} min
            </p>
          </div>
          <span className="bg-gold text-ink flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
            <Star className="h-[1.125rem] w-[1.125rem]" fill="currentColor" />
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {['Popular', 'Mains', 'Drinks', 'Desserts'].map((tab, index) => (
            <span
              key={tab}
              className={`rounded-full px-3.5 py-1.5 text-[0.8125rem] font-bold ${
                index === 0 ? 'bg-gold text-ink' : 'border-border-strong text-ink border bg-white'
              }`}
            >
              {tab}
            </span>
          ))}
        </div>

        <ul className="mt-3 space-y-2">
          {[1, 2].map((item) => (
            <li
              key={item}
              className="border-border flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5"
            >
              <span className="min-w-0">
                <span className="text-ink block truncate text-[0.8125rem] font-extrabold">
                  [Menu item]
                </span>
                <span className="text-muted-light block truncate text-[0.75rem] font-semibold">
                  [Short description]
                </span>
              </span>
              <span className="text-ink shrink-0 text-[0.8125rem] font-extrabold">
                KES {VALUE_PLACEHOLDER}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* The order notification, overlapping the card's lower left as drawn. */}
      <div className="bg-ink shadow-raised absolute -bottom-6 -left-4 flex items-center gap-3 rounded-2xl px-4 py-4 sm:-bottom-11 sm:-left-10">
        <span className="bg-gold text-ink flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
          <Check className="h-5 w-5" />
        </span>
        <span>
          <span className="block text-[0.875rem] font-extrabold text-white">
            New order from [Hotel]
          </span>
          <span className="block text-[0.75rem] font-semibold text-white/55">
            Rider assigned · pickup in 8 min
          </span>
        </span>
      </div>
    </div>
  );
}

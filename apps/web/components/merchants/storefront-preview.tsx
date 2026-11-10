import { VALUE_PLACEHOLDER } from '@nexg/ui';
import { Banknote, Check, ImageIcon, Star } from 'lucide-react';

/**
 * "How guests will see you": the storefront, on a phone, in the merchants
 * hero.
 *
 * Decorative: it shows a merchant their own store before they have one, so
 * every field is bracketed and every figure is [—]. Nothing here is data.
 */
export function StorefrontPreview() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-[21rem] lg:mr-0">
      {/* The phone. */}
      <div className="rounded-[2.5rem] bg-[#1a1714] p-2.5 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.7)] ring-1 ring-white/10">
        <div className="bg-surface text-ink overflow-hidden rounded-[2rem]">
          <div className="flex justify-center pt-2.5">
            <span className="h-1.5 w-16 rounded-full bg-[#1a1714]/15" />
          </div>

          <div className="px-4 pb-5 pt-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-[0.12em]">
                How guests will see you
              </p>
              <span className="bg-success-bg text-success flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.625rem] font-bold">
                <span className="bg-success h-1.5 w-1.5 rounded-full" />
                Open now
              </span>
            </div>

            <div className="from-gold/80 to-gold-soft mt-3 flex h-28 flex-col items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-br">
              <ImageIcon className="text-ink/45 h-5 w-5" />
              <span className="text-ink/55 text-[0.625rem] font-bold uppercase tracking-wide">
                [Your cover photo]
              </span>
            </div>

            <div className="mt-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[1.0625rem] font-extrabold">[Your business name]</p>
                <p className="text-muted mt-0.5 text-[0.6875rem] font-bold">
                  Restaurant · Westlands · {VALUE_PLACEHOLDER} min
                </p>
              </div>
              <span className="bg-gold text-ink flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
                <Star className="h-4 w-4" fill="currentColor" />
              </span>
            </div>

            <div className="mt-3 flex gap-1.5 overflow-hidden">
              {['Popular', 'Mains', 'Drinks', 'Desserts'].map((tab, index) => (
                <span
                  key={tab}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[0.6875rem] font-bold ${
                    index === 0 ? 'bg-ink text-white' : 'border-border-strong border bg-white'
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
                  className="border-border flex items-center justify-between gap-2 rounded-xl border px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[0.75rem] font-extrabold">
                      [Menu item]
                    </span>
                    <span className="text-muted-light block truncate text-[0.6875rem] font-semibold">
                      [Short description]
                    </span>
                  </span>
                  <span className="shrink-0 text-[0.75rem] font-extrabold">
                    KES {VALUE_PLACEHOLDER}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Settlement, pinned to the phone's upper right. */}
      <div className="bg-surface text-ink absolute -right-2 top-16 flex items-center gap-2.5 rounded-2xl px-3 py-2.5 shadow-[0_12px_30px_-10px_rgb(0_0_0/0.5)] sm:-right-10">
        <span className="bg-gold text-ink flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
          <Banknote className="h-4 w-4" />
        </span>
        <span>
          <span className="block text-[0.75rem] font-extrabold">Weekly M-Pesa settlement</span>
          <span className="text-muted block text-[0.625rem] font-semibold">
            To your till or bank
          </span>
        </span>
      </div>

      {/* The order notification, overlapping the phone's lower left. */}
      <div className="bg-ink absolute -left-2 bottom-10 flex items-center gap-3 rounded-2xl px-3.5 py-3 shadow-[0_12px_30px_-10px_rgb(0_0_0/0.6)] ring-1 ring-white/10 sm:-left-12">
        <span className="bg-gold text-ink flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
          <Check className="h-4 w-4" />
        </span>
        <span>
          <span className="block text-[0.8125rem] font-extrabold text-white">
            New order from [Hotel]
          </span>
          <span className="block text-[0.6875rem] font-semibold text-white/55">
            Rider assigned · pickup in 8 min
          </span>
        </span>
      </div>
    </div>
  );
}

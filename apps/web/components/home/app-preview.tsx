import { ArrowRight, Bell, MoreHorizontal, ShoppingBag, UtensilsCrossed } from 'lucide-react';

/**
 * The phone in the homepage's app section: the concierge home screen, with
 * two cards floating beside it ("Concierge on the way", "Pay how you like").
 *
 * Drawn in markup rather than shipped as a screenshot: the app does not exist
 * yet, so there is nothing real to photograph, and a mocked-up image would be
 * a picture of a product that has not been built. Names inside are bracketed
 * for the same reason.
 */
export function AppPreview() {
  const shortcuts = [
    { label: 'Transfer', icon: ArrowRight, on: true },
    { label: 'Dining', icon: UtensilsCrossed, on: false },
    { label: 'Shopping', icon: ShoppingBag, on: false },
    { label: 'More', icon: MoreHorizontal, on: false },
  ];

  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-[34rem] py-6">
      {/* The phone. */}
      <div className="relative ml-auto mr-6 w-[19.5rem] rounded-[2.75rem] bg-[#141414] p-2.5 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.45)]">
        <div className="relative h-[37rem] overflow-hidden rounded-[2.25rem] bg-white text-[#141414]">
          <div className="flex items-start justify-between px-5 pt-7">
            <span>
              <span className="block text-[0.6875rem] text-[#6b6560]">Good evening</span>
              <span className="mt-1 block text-lg font-extrabold">Staying at [your Airbnb]</span>
            </span>
            <Bell className="mt-1 h-3.5 w-3.5 text-[#6b6560]" fill="currentColor" />
          </div>

          <div className="mx-5 mt-4 rounded-xl border border-[#E4DED2] px-3.5 py-3 text-sm text-[#8a8178]">
            What can we arrange?
          </div>

          <div className="mt-5 grid grid-cols-4 gap-1 px-4">
            {shortcuts.map(({ label, icon: Icon, on }) => (
              <span key={label} className="flex flex-col items-center gap-2">
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-full ${
                    on ? 'bg-[#D9AE2E] text-[#141414]' : 'bg-[#F3EEE3] text-[#141414]'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-[0.6875rem] font-semibold">{label}</span>
              </span>
            ))}
          </div>

          <p className="mt-6 px-5 text-[0.625rem] font-bold uppercase tracking-[0.2em] text-[#6b6560]">
            Active request
          </p>
          <div className="mx-5 mt-2 rounded-2xl bg-[#141414] p-4 text-white">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[0.9375rem] font-extrabold">Airport transfer</span>
              <span className="rounded-full bg-[#D9AE2E] px-2.5 py-0.5 text-[0.625rem] font-bold text-[#141414]">
                On the way
              </span>
            </div>
            <p className="mt-1 text-[0.6875rem] text-white/60">JKIA → your Airbnb · Tonight</p>
            <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-white/10 p-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#D9AE2E] text-[0.625rem] font-bold text-[#141414]">
                CN
              </span>
              <span className="text-xs font-semibold">[Concierge name]</span>
            </div>
          </div>

          <div className="mx-5 mt-3 flex items-center justify-between gap-3 rounded-2xl bg-[#F6F3EC] p-4">
            <span>
              <span className="block text-[0.8125rem] font-extrabold">Pay how you like</span>
              <span className="mt-1 block text-[0.625rem] leading-relaxed text-[#8a8178]">
                M-Pesa · On delivery · On account
              </span>
            </span>
            <span className="shrink-0 rounded-lg bg-white px-2 py-1.5 text-[0.625rem] font-extrabold">
              M-PESA
            </span>
          </div>

          <div className="absolute inset-x-0 bottom-0 flex justify-around border-t border-[#EFEAE0] bg-white py-4">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="h-3 w-3 rounded-[3px] bg-[#C9C3B8]" />
            ))}
          </div>
        </div>
      </div>

      {/* Floating beside the phone. */}
      <div className="absolute left-0 top-[30%] w-[15rem] rounded-2xl bg-white p-4 text-[#141414] shadow-[0_20px_50px_-15px_rgba(0,0,0,0.35)]">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-[#8a8178]">
          Live
        </p>
        <p className="mt-1 text-[0.9375rem] font-extrabold">Concierge on the way</p>
        <p className="mt-1 text-xs text-[#6b6560]">Watch it move on the map</p>
      </div>
      <div className="absolute -right-2 bottom-0 w-[13rem] rounded-2xl bg-white p-4 text-[#141414] shadow-[0_20px_50px_-15px_rgba(0,0,0,0.35)]">
        <p className="text-xs text-[#6b6560]">Pay how you like</p>
        <p className="mt-1 text-lg font-extrabold">M-Pesa</p>
      </div>
    </div>
  );
}

/* Store marks, drawn small and plain beside each name. */
function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M16.36 12.68c-.02-2.22 1.82-3.29 1.9-3.34-1.04-1.52-2.65-1.72-3.22-1.75-1.37-.14-2.68.81-3.37.81-.7 0-1.77-.79-2.91-.77-1.5.02-2.88.87-3.65 2.21-1.56 2.7-.4 6.7 1.12 8.89.74 1.07 1.62 2.27 2.78 2.23 1.12-.05 1.54-.72 2.89-.72 1.35 0 1.73.72 2.91.7 1.2-.02 1.96-1.09 2.69-2.17.85-1.24 1.2-2.45 1.22-2.51-.03-.01-2.34-.9-2.36-3.58ZM14.14 6.16c.61-.75 1.03-1.78.91-2.81-.88.04-1.96.59-2.6 1.33-.57.66-1.07 1.71-.94 2.72.99.08 2-.5 2.63-1.24Z" />
    </svg>
  );
}

function PlayMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M5 3.5v17a1 1 0 0 0 1.5.86l14-8.5a1 1 0 0 0 0-1.72l-14-8.5A1 1 0 0 0 5 3.5Z" />
    </svg>
  );
}

/** App Store and Google Play badges, marked "Soon": neither app is out yet. */
export function StoreBadges() {
  const badges = [
    { top: 'Soon on the', bottom: 'App Store', Mark: AppleMark },
    { top: 'Soon on', bottom: 'Google Play', Mark: PlayMark },
  ];

  return (
    <ul className="mt-6 flex flex-wrap gap-3">
      {badges.map(({ top, bottom, Mark }) => (
        <li
          key={bottom}
          className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/[0.04] px-5 py-3 text-white"
        >
          <Mark />
          <span className="leading-tight">
            <span className="block text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-white/60">
              {top}
            </span>
            <span className="block text-lg font-extrabold">{bottom}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

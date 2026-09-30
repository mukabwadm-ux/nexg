import Link from 'next/link';

/**
 * The twelve tabs, in the order the overview sheet lists them.
 *
 * Every tab keeps its filters in the URL, so a link pasted into Slack
 * opens the same screen the sender was looking at. That is why the tab
 * strip is links rather than state.
 */
export const MERCHANT_TABS = [
  { key: 'directory', label: 'Directory', built: true },
  { key: 'pipeline', label: 'Pipeline', built: true },
  { key: 'health', label: 'Health', built: true },
  { key: 'disputes', label: 'Disputes', built: true },
  { key: 'hours', label: 'Hours & capacity', built: true },
  { key: 'catalogue', label: 'Catalogue ops', built: true },
  { key: 'coverage', label: 'Coverage', built: false },
  { key: 'finance', label: 'Finance', built: true },
  { key: 'comms', label: 'Comms', built: false },
  { key: 'documents', label: 'Documents', built: true },
  { key: 'acquisition', label: 'Acquisition', built: false },
  { key: 'branches', label: 'Branches', built: true },
] as const;

export type MerchantTab = (typeof MERCHANT_TABS)[number]['key'];

export function MerchantTabs({ current }: { current: string }) {
  return (
    <nav
      className="border-border -mx-4 flex gap-6 overflow-x-auto border-b px-4 sm:-mx-8 sm:px-8"
      aria-label="Merchants sections"
    >
      {MERCHANT_TABS.map((tab) =>
        tab.built ? (
          <Link
            key={tab.key}
            href={`/merchants?tab=${tab.key}`}
            className={`-mb-px shrink-0 border-b-2 pb-3 text-sm font-bold transition-colors ${
              current === tab.key
                ? 'border-gold text-ink'
                : 'text-muted hover:text-ink border-transparent'
            }`}
          >
            {tab.label}
          </Link>
        ) : (
          /* Designed, not built. Shown rather than hidden: a missing tab
             makes the console look smaller than the plan, and a tab that
             pretends to work is worse than one that says it does not. */
          <span
            key={tab.key}
            title="Designed, not built yet"
            className="text-muted-light -mb-px shrink-0 cursor-default border-b-2 border-transparent pb-3 text-sm font-bold opacity-50"
          >
            {tab.label}
          </span>
        ),
      )}
    </nav>
  );
}

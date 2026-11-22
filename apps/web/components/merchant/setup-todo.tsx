import Link from 'next/link';

/** One open item from rpc_merchant_setup_todo (fn_merchant_go_live_missing). */
export interface SetupTodoItem {
  key: string;
  label: string;
  who: 'merchant' | 'nexg' | string;
  count?: number;
}

/* Where the merchant does each item. NexG's own items have no link. */
const HREF: Record<string, string> = {
  onboarding_details: '/merchant/documents#onboarding-details',
  agreement_details: '/merchant/documents#agreement',
  agreement: '/merchant/documents#agreement',
  documents: '/merchant/documents#documents-list',
  branch: '/merchant/business',
  branch_pin: '/merchant/stores',
  hours: '/merchant/hours',
};

const ACTION: Record<string, string> = {
  onboarding_details: 'Fill in',
  agreement_details: 'Add details',
  agreement: 'Read and accept',
  documents: 'Upload',
  branch: 'Add location',
  branch_pin: 'Pin on map',
  hours: 'Set hours',
};

/**
 * Approve first (20270124000100): an approved merchant finishes setting up
 * here, in its dashboard, and NexG takes it live once everything is in and
 * checked. Shown only while something is still open.
 */
/**
 * For a shop that is already live: what keeps it off the apps' map or shows
 * it as always open. Shown only while something is open.
 */
export function LiveGaps({ items }: { items: SetupTodoItem[] }) {
  if (items.length === 0) return null;
  return (
    <section
      aria-labelledby="live-gaps-title"
      className="border-gold bg-surface mx-4 mt-6 rounded-2xl border-2 p-5 sm:mx-6 lg:mx-8"
    >
      <h2 id="live-gaps-title" className="text-lg font-extrabold tracking-tight">
        Customers cannot find you on the map yet
      </h2>
      <p className="text-muted mt-1 text-sm font-semibold leading-[1.6]">
        The NexG apps show shops by their exact pin and opening hours.
      </p>
      <ol className="mt-4 space-y-2">
        {items.map((item, index) => (
          <li
            key={item.key}
            className="border-border flex items-center justify-between gap-3 rounded-xl border px-4 py-3"
          >
            <span className="text-sm font-bold">
              {index + 1}. {item.label}
            </span>
            {HREF[item.key] ? (
              <Link
                href={HREF[item.key]!}
                className="bg-gold text-ink shrink-0 rounded-full px-4 py-2 text-xs font-extrabold"
              >
                {ACTION[item.key] ?? 'Open'}
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function SetupTodo({ items }: { items: SetupTodoItem[] }) {
  if (items.length === 0) return null;
  const yours = items.filter((i) => i.who === 'merchant');
  const ours = items.filter((i) => i.who !== 'merchant');
  return (
    <section
      aria-labelledby="setup-todo-title"
      className="border-gold bg-surface mx-4 mt-6 rounded-2xl border-2 p-5 sm:mx-6 lg:mx-8"
    >
      <h2 id="setup-todo-title" className="text-lg font-extrabold tracking-tight">
        Finish setting up to go live
      </h2>
      <p className="text-muted mt-1 text-sm font-semibold leading-[1.6]">
        You are approved. {yours.length > 0 ? 'Complete these and ' : ''}NexG takes your business
        live once everything is in and checked. Each step saves on its own, so you can do them one
        at a time.
      </p>
      {yours.length > 0 ? (
        <ol className="mt-4 space-y-2">
          {yours.map((item, index) => (
            <li
              key={item.key}
              className="border-border flex items-center justify-between gap-3 rounded-xl border px-4 py-3"
            >
              <span className="text-sm font-bold">
                {index + 1}. {item.label}
                {item.count ? (
                  <span className="text-muted font-semibold"> · {item.count} to do</span>
                ) : null}
              </span>
              {HREF[item.key] ? (
                <Link
                  href={HREF[item.key]!}
                  className="bg-gold text-ink shrink-0 rounded-full px-4 py-2 text-xs font-extrabold"
                >
                  {ACTION[item.key] ?? 'Open'}
                </Link>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      {ours.length > 0 ? (
        <ul className="text-muted mt-3 space-y-1 text-sm font-semibold">
          {ours.map((item) => (
            <li key={item.key}>
              Waiting on NexG: {item.label}
              {item.count ? ` (${item.count})` : ''}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

import { Card } from '@nexg/ui';
import Link from 'next/link';

import { acknowledgeSos } from '@/app/riders/actions';

import { clock, riderName } from './shared';

/**
 * The eight tabs, in the order the overview sheet lists them.
 *
 * Filters live in the URL, so a link pasted into Slack opens the same
 * screen the sender was looking at. That is why the tab strip is links
 * rather than state.
 */
export const RIDER_TABS = [
  { key: 'directory', label: 'Directory', built: true },
  { key: 'pipeline', label: 'Pipeline', built: true },
  { key: 'health', label: 'Health & safety', built: true },
  { key: 'cash', label: 'Cash ledger', built: true },
  { key: 'settlement', label: 'Weekly settlement', built: true },
  { key: 'supply', label: 'Supply & shifts', built: true },
  { key: 'documents', label: 'Documents', built: true },
  { key: 'comms', label: 'Comms', built: true },
] as const;

export type RiderTab = (typeof RIDER_TABS)[number]['key'];

export function RiderTabs({ current }: { current: string }) {
  return (
    <nav
      className="border-border -mx-4 flex gap-6 overflow-x-auto border-b px-4 sm:-mx-8 sm:px-8"
      aria-label="Riders sections"
    >
      {RIDER_TABS.map((tab) => (
        <Link
          key={tab.key}
          href={`/riders?tab=${tab.key}`}
          className={`-mb-px shrink-0 border-b-2 pb-3 text-sm font-bold transition-colors ${
            current === tab.key
              ? 'border-gold text-ink'
              : 'text-muted hover:text-ink border-transparent'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

export interface SosRow {
  id: string;
  rider_id: string | null;
  happened_at: string;
  description: string | null;
  rider: { first_name: string | null; last_name: string | null } | null;
  zone: string | null;
}

/**
 * The SOS banner.
 *
 * An SOS is not closed by it stopping. It stays on every route in this
 * module until a named person acknowledges it, because the failure mode
 * this guards against is everyone assuming somebody else picked it up.
 *
 * Rendered above the tabs, not inside one, for the same reason.
 */
export function SosBanner({ incidents }: { incidents: SosRow[] }) {
  if (incidents.length === 0) return null;

  return (
    <div className="space-y-2" role="alert">
      {incidents.map((incident) => (
        <Card
          key={incident.id}
          className="border-danger bg-danger-bg flex flex-wrap items-center justify-between gap-3 border-2 p-4"
        >
          <div className="min-w-0">
            <p className="text-danger text-[0.6875rem] font-extrabold uppercase tracking-[0.1em]">
              SOS · unacknowledged
            </p>
            <p className="mt-1 text-[0.9375rem] font-extrabold">
              {incident.rider ? riderName(incident.rider) : 'Unnamed rider'}
              {incident.zone ? ` · ${incident.zone}` : ''} · {clock(incident.happened_at)}
            </p>
            {incident.description && (
              <p className="text-muted mt-0.5 text-[0.75rem] font-semibold">
                {incident.description}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Link
              href={`/riders/incidents/${incident.id}`}
              className="border-danger text-danger hover:bg-danger rounded-lg border bg-white px-4 py-2 text-[0.8125rem] font-bold transition-colors hover:text-white"
            >
              Open
            </Link>
            {/*
             * A form post, not a link: acknowledging an SOS records a
             * named person against it, and a link can be followed by a
             * prefetch or a crawler.
             */}
            <form action={acknowledgeSos}>
              <input type="hidden" name="incident_id" value={incident.id} />
              <button
                type="submit"
                className="bg-danger rounded-lg px-4 py-2 text-[0.8125rem] font-bold text-white transition-opacity hover:opacity-90"
              >
                Acknowledge
              </button>
            </form>
          </div>
        </Card>
      ))}
    </div>
  );
}

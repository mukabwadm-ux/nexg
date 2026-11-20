import { useState } from 'react';

import { Badge, Button } from './ui';
import { useWorkspace } from './workspace';

/**
 * The unit's publish switch on NEXG Stays, with what it still needs.
 * Nothing goes live until the host publishes it, and they can take it down
 * at any time. NexG can still take a property off the site; then a
 * published unit waits until NexG lists it again.
 */
export function ListingPanel({ unitId }: { unitId: string }) {
  const w = useWorkspace();
  const [saving, setSaving] = useState(false);
  const unit = w.data.units.find((row) => row.id === unitId);
  const listing = unit?.listing;
  if (!unit || !listing) return null;

  const ready = listing.missing.length === 0;
  const status =
    listing.listed && !listing.heldByStaff
      ? { tone: 'success' as const, text: 'Live on NEXG Stays' }
      : listing.published && listing.heldByStaff
        ? { tone: 'warning' as const, text: 'Published · taken down by NexG' }
        : listing.published
          ? { tone: 'info' as const, text: 'Published · waiting on the checklist' }
          : { tone: 'neutral' as const, text: 'Not published' };

  async function toggle(published: boolean) {
    setSaving(true);
    await w.run({ type: 'listing', collection: 'units', id: unitId, record: { published } });
    setSaving(false);
  }

  return (
    <section className="listing-panel" aria-label="Listing on NEXG Stays">
      <div className="listing-panel-head">
        <div>
          <strong>Listing on NEXG Stays</strong>
          <p className="muted">
            {listing.published
              ? 'Guests can find and book this unit while it is published and complete.'
              : 'Guests cannot see this unit until you publish it.'}
          </p>
        </div>
        <Badge tone={status.tone}>{status.text}</Badge>
      </div>
      {ready ? (
        <p className="listing-ready">Everything guests need is in place.</p>
      ) : (
        <ul className="listing-checklist">
          {listing.missing.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      {listing.heldByStaff && (
        <p className="muted">
          NexG has taken this property off the site. Contact NexG support to have it listed again.
        </p>
      )}
      <div className="listing-panel-actions">
        {listing.published ? (
          <Button disabled={saving} onClick={() => void toggle(false)}>
            {saving ? 'Saving…' : 'Unpublish'}
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={saving || !ready}
            title={ready ? undefined : 'Complete the checklist first'}
            onClick={() => void toggle(true)}
          >
            {saving ? 'Saving…' : 'Publish'}
          </Button>
        )}
        <Button onClick={() => w.edit('units', unitId)}>Edit listing details</Button>
      </div>
    </section>
  );
}

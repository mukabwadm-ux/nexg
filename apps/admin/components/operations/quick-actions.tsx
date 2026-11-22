'use client';

import { AlertTriangle, BedDouble, Bike, CirclePlus, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { raiseIncident } from '@/app/operations/actions';
import { ManualOrder } from '@/components/live/manual-order';
import {
  FormPanel,
  SelectField,
  TextArea,
  TextField,
  useRunner,
} from '@/components/portal/client-kit';

const tile =
  'flex min-h-[5.5rem] flex-col items-center justify-center gap-2 rounded-xl border border-[#F3E3B5] bg-[#FFF8E6] px-3 py-3 text-center text-[0.9375rem] font-bold text-ink transition-colors hover:bg-[#FFF1CC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A800]';

function TileBody({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <>
      <Icon aria-hidden="true" className="h-8 w-8 text-[#D99A00]" strokeWidth={1.7} />
      {label}
    </>
  );
}

const KINDS = [
  { value: 'guest_complaint', label: 'Guest complaint' },
  { value: 'rider_complaint', label: 'Rider complaint' },
  { value: 'accident', label: 'Accident' },
  { value: 'theft', label: 'Theft' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'breakdown', label: 'Breakdown' },
  { value: 'police_stop', label: 'Police stop' },
  { value: 'other', label: 'Something else' },
];

function RaiseIncident({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = React.useState('guest_complaint');
  const [severity, setSeverity] = React.useState('minor');
  const [reference, setReference] = React.useState('');
  const [description, setDescription] = React.useState('');
  const { run, busy } = useRunner();
  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title="Raise an incident"
      subtitle="It joins the incidents list and the Open Incidents count at once."
      submitLabel="Raise incident"
      busy={busy}
      onSubmit={() =>
        run(() => raiseIncident({ kind, severity, orderReference: reference, description }))
      }
    >
      <SelectField
        label="What happened"
        value={kind}
        onChange={(e) => setKind(e.target.value)}
        options={KINDS}
        required
      />
      <SelectField
        label="How serious"
        value={severity}
        onChange={(e) => setSeverity(e.target.value)}
        options={[
          { value: 'minor', label: 'Minor' },
          { value: 'major', label: 'Major' },
          { value: 'critical', label: 'Critical' },
        ]}
        required
      />
      <TextField
        label="Order or booking reference"
        hint="Optional. The rider on that order is linked automatically."
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        maxLength={40}
      />
      <TextArea
        label="What happened, in a sentence or two"
        required
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={1000}
      />
    </FormPanel>
  );
}

/**
 * The four Quick Actions. Each opens the same tool the console already
 * has for it, so nothing here takes an order or a booking differently.
 */
export function QuickActions({
  order,
  bookingHref,
  assignHref,
  canIncident,
}: {
  /** Present when the person may take orders by phone in a live city. */
  order: {
    cityId: string;
    merchants: { id: string; trading_name: string | null; legal_name: string }[];
  } | null;
  bookingHref: string | null;
  assignHref: string | null;
  canIncident: boolean;
}) {
  const [incident, setIncident] = React.useState(false);
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {order ? (
          <ManualOrder
            cityId={order.cityId}
            merchants={order.merchants}
            trigger={(open) => (
              <button type="button" onClick={open} className={tile}>
                <TileBody icon={CirclePlus} label="Create Order" />
              </button>
            )}
          />
        ) : (
          <span className={`${tile} cursor-not-allowed opacity-50`} title="Needs Orders access">
            <TileBody icon={CirclePlus} label="Create Order" />
          </span>
        )}
        {bookingHref ? (
          <Link href={bookingHref} className={tile}>
            <TileBody icon={BedDouble} label="New Booking" />
          </Link>
        ) : (
          <span className={`${tile} cursor-not-allowed opacity-50`} title="Needs Stays access">
            <TileBody icon={BedDouble} label="New Booking" />
          </span>
        )}
        {assignHref ? (
          <Link href={assignHref} className={tile}>
            <TileBody icon={Bike} label="Assign Delivery" />
          </Link>
        ) : (
          <span
            className={`${tile} cursor-not-allowed opacity-50`}
            title="Needs Live operations access"
          >
            <TileBody icon={Bike} label="Assign Delivery" />
          </span>
        )}
        <button
          type="button"
          onClick={() => setIncident(true)}
          disabled={!canIncident}
          className={`${tile} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <TileBody icon={AlertTriangle} label="Raise Incident" />
        </button>
      </div>
      {incident && <RaiseIncident onClose={() => setIncident(false)} />}
    </>
  );
}

'use client';

import * as React from 'react';

import {
  generateCard,
  markCardPlaced,
  replaceCard,
  testScan,
  voidCard,
  type Outcome,
} from '@/app/host/actions';

import { Actions, Area, Drawer, Field, Said, Select, Submit, useAction } from './form';
import { SPOTS, spotLabel } from './vocab';

/**
 * Generating and managing cards.
 *
 * A client island rather than a client page: the table is
 * server-rendered and stays that way, and only the controls
 * ship JavaScript. The list is the thing a host loads on a
 * slow connection at a front desk.
 */

export interface UnitOption {
  id: string;
  name: string;
  label_public: string | null;
  property_name: string | null;
  taken: string[];
}


/* ═══════════════════════════════════════════════ generate */

export function GenerateCards({ units }: { units: UnitOption[] }) {
  const [open, setOpen] = React.useState(false);
  const [unitId, setUnitId] = React.useState(units[0]?.id ?? '');
  const [spot, setSpot] = React.useState('bedside');
  const { pending, outcome, run } = useAction();

  const unit = units.find((u) => u.id === unitId);
  const taken = unit?.taken ?? [];
  /* A spot that already has a live card is shown as taken
     rather than hidden. Hiding it makes the refusal arrive as a
     surprise; showing it explains why Replace is the action. */
  const free = SPOTS.filter((s) => !taken.includes(s.value));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-ink rounded-lg px-4 py-2 text-[0.8125rem] font-extrabold text-white"
      >
        + Generate cards
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Generate a card"
        lead="One card per spot. We create the code, you print it and mark it placed once it is in the room."
      >
        {units.length === 0 ? (
          <p className="text-muted text-[0.8125rem] font-semibold leading-[1.7]">
            You have no units yet. Add one in Units &amp; Rooms first — a card has to point
            somewhere.
          </p>
        ) : (
          <div className="space-y-4">
            <Field label="Unit">
              <Select
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                options={units.map((u) => ({
                  value: u.id,
                  label: `${u.name}${u.property_name ? ` · ${u.property_name}` : ''}`,
                }))}
              />
            </Field>

            {unit && !unit.label_public ? (
              <p className="bg-gold-soft text-gold-text rounded-lg px-3 py-2.5 text-[0.75rem] font-semibold leading-[1.6]">
                This unit has no public name yet. That name is what gets printed on the card, so
                set it in Units &amp; Rooms before generating one.
              </p>
            ) : null}

            <Field
              label="Spot"
              hint="Where in the unit the card sits. It is the single most useful thing in the report later — bedside cards convert in the evening, kitchen cards in the morning."
            >
              <Select
                value={spot}
                onChange={(e) => setSpot(e.target.value)}
                options={free.length > 0 ? free : [{ value: '', label: 'Every spot has a card' }]}
              />
            </Field>

            {taken.length > 0 ? (
              <p className="text-muted-light text-[0.6875rem] font-semibold leading-[1.6]">
                Already has a card: {taken.map(spotLabel).join(', ')}. Replace one from the table
                rather than adding a second — two codes in one place split the attribution and
                neither number is then worth reading.
              </p>
            ) : null}

            <Said outcome={outcome} />

            <Actions>
              <Submit
                type="button"
                pending={pending}
                onClick={() => run(() => generateCard(unitId, spot))}
              >
                Generate card
              </Submit>
              <Submit type="button" tone="quiet" onClick={() => setOpen(false)}>
                Close
              </Submit>
            </Actions>
          </div>
        )}
      </Drawer>
    </>
  );
}

/* ══════════════════════════════════════════ per-card actions */

export function CardActions({
  qrId,
  status,
  code,
}: {
  qrId: string;
  status: string;
  code: string;
}) {
  const [sheet, setSheet] = React.useState<null | 'replace' | 'void'>(null);
  const [reason, setReason] = React.useState('');
  const { pending, outcome, run } = useAction();
  const [inline, setInline] = React.useState<Outcome | null>(null);

  return (
    <>
      <div className="flex flex-wrap justify-end gap-1.5">
        {status === 'generated' ? (
          <Mini onClick={() => run(() => markCardPlaced(qrId), setInline)} pending={pending}>
            Mark placed
          </Mini>
        ) : null}
        {status !== 'voided' ? (
          <>
            <Mini onClick={() => run(() => testScan(qrId), setInline)} pending={pending}>
              Test
            </Mini>
            <Mini onClick={() => setSheet('replace')}>Replace</Mini>
            <Mini onClick={() => setSheet('void')} tone="danger">
              Void
            </Mini>
          </>
        ) : null}
      </div>
      {inline?.message ? (
        <p
          className={`mt-1 text-right text-[0.6875rem] font-semibold ${
            inline.ok ? 'text-success' : 'text-danger'
          }`}
        >
          {inline.message}
        </p>
      ) : null}

      <Drawer
        open={sheet !== null}
        onClose={() => setSheet(null)}
        title={sheet === 'void' ? `Void ${code}` : `Replace ${code}`}
        lead={
          sheet === 'void'
            ? 'The card stops working. Scans of it are still logged, so you can see whether it is still out there on somebody’s counter.'
            : 'A new code for the same spot. The old one is voided and tells a guest the card is retired.'
        }
      >
        <div className="space-y-4">
          <Field
            label="Reason"
            hint="Kept on the record. In six months this is how you tell a card that was reprinted from one that went missing."
          >
            <Area
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={sheet === 'void' ? 'Unit no longer let' : 'Card damaged by water'}
            />
          </Field>
          <Said outcome={outcome} />
          <Actions>
            <Submit
              type="button"
              tone={sheet === 'void' ? 'danger' : 'ink'}
              pending={pending}
              onClick={() =>
                run(
                  () =>
                    sheet === 'void' ? voidCard(qrId, reason) : replaceCard(qrId, reason),
                  (o) => {
                    if (o.ok) setSheet(null);
                  },
                )
              }
            >
              {sheet === 'void' ? 'Void this card' : 'Issue a replacement'}
            </Submit>
            <Submit type="button" tone="quiet" onClick={() => setSheet(null)}>
              Cancel
            </Submit>
          </Actions>
        </div>
      </Drawer>
    </>
  );
}

function Mini({
  children,
  onClick,
  pending,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  pending?: boolean;
  tone?: 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={`rounded-md border px-2 py-1 text-[0.6875rem] font-extrabold transition-colors disabled:opacity-50 ${
        tone === 'danger'
          ? 'border-danger/40 text-danger hover:bg-danger/5'
          : 'border-border-strong text-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}


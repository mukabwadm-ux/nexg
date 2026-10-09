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

/* ═════════════════════════════════════════════ the inspector */

export interface CardDetail {
  id: string;
  code: string;
  unit_name: string | null;
  unit_public_name: string | null;
  property_name: string | null;
  spot: string;
  status: string;
  scans_30d: number;
  scans_all: number;
  test_scans: number;
  orders: number;
  last_scan_at: string | null;
  typical_hour: number | null;
  repeat_pct: number | null;
}

function ago(iso: string | null): string {
  if (!iso) return 'never scanned';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/**
 * Looking at a card.
 *
 * A generated card could be marked placed, replaced and voided
 * without anybody ever seeing it, so "is this the right card
 * for this room" was a question the portal could not answer.
 *
 * The image comes from `/api/qr/{code}`, the same renderer the
 * printable card uses. Drawing it a second way here would give
 * a preview that is subtly not the card somebody then prints.
 */
export function ViewCard({ card }: { card: CardDetail }) {
  const [open, setOpen] = React.useState(false);
  const { pending, outcome, run } = useAction();
  const [origin, setOrigin] = React.useState('');
  const [imageFailed, setImageFailed] = React.useState(false);

  /* Read after mount: the server render has no window, and
     putting it in the markup directly would mismatch. */
  React.useEffect(() => setOrigin(window.location.origin), []);

  return (
    <>
      <Mini onClick={() => setOpen(true)}>View</Mini>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={`${card.code} · ${spotLabel(card.spot)}`}
        lead={card.unit_public_name ?? card.unit_name ?? 'Not attached to a named unit.'}
      >
        <div className="space-y-4">
          <div className="border-border flex items-start gap-4 rounded-xl border p-4">
            {imageFailed ? (
              /*
               * The renderer refuses a code outside its
               * alphabet — no 0, 1, O or I, because somebody
               * reads these off a card taped to a counter. A
               * broken image box would leave a host thinking
               * the portal was broken rather than the code.
               */
              <div className="border-border text-muted-light flex h-[7.5rem] w-[7.5rem] shrink-0 items-center justify-center rounded-lg border bg-white p-2 text-center text-[0.625rem] font-semibold leading-[1.4]">
                This code cannot be drawn — it has characters the card alphabet leaves out.
                Replace the card to get a printable one.
              </div>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={`/api/qr/${card.code}`}
                alt={`QR code ${card.code}`}
                width={120}
                height={120}
                onError={() => setImageFailed(true)}
                className="border-border h-[7.5rem] w-[7.5rem] shrink-0 rounded-lg border bg-white"
              />
            )}
            <div className="min-w-0 text-[0.75rem] font-semibold leading-[1.7]">
              <p className="text-[0.8125rem] font-extrabold">
                {card.unit_public_name ?? card.unit_name ?? '—'}
              </p>
              {card.property_name ? (
                <p className="text-muted-light">{card.property_name}</p>
              ) : null}
              <p className="text-muted mt-1.5 break-all font-mono text-[0.6875rem]">
                {origin}/q/{card.code}
              </p>
              <p className="text-muted-light mt-1.5">
                {card.status === 'voided'
                  ? 'Voided. A guest scanning it is told the card is retired.'
                  : card.status === 'placed'
                    ? 'Placed in the room.'
                    : 'Generated. Print it, then mark it placed.'}
              </p>
            </div>
          </div>

          <div className="border-border overflow-hidden rounded-xl border">
            <Stat label="Scans · 30 days" value={String(card.scans_30d)} />
            <Stat label="Scans · all time" value={String(card.scans_all)} />
            <Stat label="Orders from it" value={String(card.orders)} />
            <Stat label="Last scan" value={ago(card.last_scan_at)} />
            <Stat
              label="Typical time"
              value={
                card.typical_hour === null
                  ? '—'
                  : `${String(card.typical_hour).padStart(2, '0')}:00`
              }
              note="when guests actually use it"
            />
            <Stat
              label="Repeat scans"
              value={card.repeat_pct === null ? '—' : `${card.repeat_pct}%`}
              note={card.repeat_pct === null ? 'withheld under 10 scans' : 'same guest, same stay'}
            />
            {/*
              Read straight off the row, with no optimistic
              bump. Adding a local counter on top double-counted
              the moment the action's revalidate brought the
              fresh row back — the figure jumped by two for one
              press, which is the one number on this panel
              somebody is checking.
            */}
            <Stat
              label="Test scans"
              value={String(card.test_scans)}
              note="left out of Analytics"
            />
          </div>

          <p className="text-muted text-[0.75rem] font-semibold leading-[1.65]">
            A test records a row exactly as a guest&apos;s scan would, flagged as a test — so you
            can prove the card resolves without putting a phantom guest in your numbers.
          </p>

          <Said outcome={outcome} />

          <Actions>
            <Submit
              type="button"
              pending={pending}
              onClick={() => run(() => testScan(card.id))}
            >
              Test this card
            </Submit>
            <a
              href={`/q/${card.code}`}
              target="_blank"
              rel="noopener noreferrer"
              className="border-border-strong rounded-lg border px-4 py-2.5 text-[0.8125rem] font-extrabold"
            >
              See what a guest sees
            </a>
            <a
              href={`/api/qr/${card.code}?png&size=1200`}
              download={`${card.code}.png`}
              className="border-border-strong rounded-lg border px-4 py-2.5 text-[0.8125rem] font-extrabold"
            >
              Download
            </a>
          </Actions>
        </div>
      </Drawer>
    </>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="border-border flex items-start justify-between gap-3 border-b px-4 py-2.5 last:border-0">
      <span className="text-muted text-[0.8125rem] font-semibold">
        {label}
        {note ? <span className="text-muted-light block text-[0.6875rem]">{note}</span> : null}
      </span>
      <span className="text-right text-[0.8125rem] font-extrabold tabular-nums">{value}</span>
    </div>
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


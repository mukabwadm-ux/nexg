'use client';

import { Button, Card, Input, Select, useToast } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

export interface PlaceOutcome {
  ok: boolean;
  message?: string;
  liveNow?: boolean;
}

export interface OpenSlot {
  placement_id: string;
  kind: string;
  category: string | null;
  position: number;
  city_name: string | null;
  week_start: string;
  status: string;
  sold_to: string | null;
  list_price: number | null;
}

export interface MerchantOption {
  id: string;
  name: string;
  category: string | null;
  city_name: string | null;
  featured_now: boolean;
}

const DASH = '[—]';

function slotLabel(s: OpenSlot): string {
  const where =
    s.kind === 'category_top' && s.category
      ? `Top of ${s.category.replace(/_/g, ' ')}`
      : s.kind === 'homepage'
        ? `Homepage · position ${s.position}`
        : `${s.kind.replace(/_/g, ' ')} · ${s.position}`;
  return `${where} · ${s.city_name ?? DASH}`;
}

function weekLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const end = new Date(d.getTime() + 6 * 86_400_000);
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })} – ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`;
}

/**
 * Selling a slot on the phone.
 *
 * The request-and-quote path is right for a merchant filling in a
 * form. This is for the conversation that sells most of them:
 * somebody agrees a price while you are talking to them and wants
 * to be on the homepage today.
 *
 * The price is a required field with no default. There is a list
 * price when a rate card has been published, shown as a hint rather
 * than filled in — what matters is what was actually agreed, and
 * pre-filling a number is how a discount nobody approved ends up on
 * an invoice.
 */
export function PlaceMerchant({
  slots,
  merchants,
  onPlace,
}: {
  slots: OpenSlot[];
  merchants: MerchantOption[];
  onPlace: (input: {
    placementId: string;
    merchantId: string;
    weekStart: string;
    price: number;
    weeks: number;
    note: string;
  }) => Promise<PlaceOutcome>;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  const open = slots.filter((s) => s.status === 'open');
  const [placementId, setPlacementId] = React.useState(open[0]?.placement_id ?? '');
  const [weekStart, setWeekStart] = React.useState(open[0]?.week_start ?? '');
  const [merchantId, setMerchantId] = React.useState('');
  const [price, setPrice] = React.useState('');
  const [weeks, setWeeks] = React.useState('1');
  const [note, setNote] = React.useState('');

  /* The weeks still free on whichever placement is chosen. */
  const weeksForPlacement = React.useMemo(
    () => open.filter((s) => s.placement_id === placementId),
    [open, placementId],
  );

  React.useEffect(() => {
    if (
      weeksForPlacement.length > 0 &&
      !weeksForPlacement.some((s) => s.week_start === weekStart)
    ) {
      setWeekStart(weeksForPlacement[0]!.week_start);
    }
  }, [weeksForPlacement, weekStart]);

  const placements = React.useMemo(() => {
    const seen = new Map<string, OpenSlot>();
    for (const s of open) if (!seen.has(s.placement_id)) seen.set(s.placement_id, s);
    return [...seen.values()];
  }, [open]);

  const chosen = weeksForPlacement.find((s) => s.week_start === weekStart);
  const sellable = merchants.filter((m) => !m.featured_now);
  const ready = placementId && weekStart && merchantId && Number(price) > 0;

  if (placements.length === 0) {
    return (
      <Card className="p-5">
        <h3 className="text-[0.875rem] font-extrabold">Sell a slot</h3>
        <p className="text-muted mt-2 text-[0.8125rem] font-semibold leading-[1.7]">
          Every slot in the next eight weeks is taken. That is a good problem — but it means there
          is nothing to sell on a call today.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h3 className="text-[0.875rem] font-extrabold">Sell a slot</h3>
      <p className="text-muted mt-1.5 text-[0.8125rem] font-semibold leading-[1.7]">
        For the merchant who agreed a price on the phone. They go on the homepage straight away if
        the week has already started, and on Monday if it has not.
      </p>

      <div className="mt-4 space-y-3">
        <Select
          id="place-placement"
          label="Which slot"
          value={placementId}
          onValueChange={setPlacementId}
          options={placements.map((s) => ({ value: s.placement_id, label: slotLabel(s) }))}
        />

        <Select
          id="place-week"
          label="Which week"
          value={weekStart}
          onValueChange={setWeekStart}
          options={weeksForPlacement.map((s) => ({
            value: s.week_start,
            label: weekLabel(s.week_start),
          }))}
          hint={weeksForPlacement.length === 0 ? 'No free weeks on that placement.' : undefined}
        />

        <Select
          id="place-merchant"
          label="Which merchant"
          value={merchantId}
          onValueChange={setMerchantId}
          placeholder="Pick a live merchant…"
          options={sellable.map((m) => ({
            value: m.id,
            label: `${m.name}${m.city_name ? ` · ${m.city_name}` : ''}`,
          }))}
          hint="Only live merchants — a guest tapping a sponsored card and finding it closed is worse than no card."
        />

        <Input
          id="place-price"
          label="Agreed price per week · KES"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          placeholder={DASH}
          hint={
            chosen?.list_price
              ? `Rate card says ${chosen.list_price.toLocaleString('en-KE')}. Type what they actually agreed.`
              : 'No rate card is published, so there is no list price. Type what they agreed.'
          }
        />

        <Select
          id="place-weeks"
          label="For how many weeks"
          value={weeks}
          onValueChange={setWeeks}
          options={[1, 2, 3, 4, 6, 8, 12].map((n) => ({
            value: String(n),
            label: n === 1 ? '1 week' : `${n} weeks`,
          }))}
        />

        <Input
          id="place-note"
          label="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Agreed on the phone, paid by M-Pesa."
          hint="Read by whoever reconciles this against the money."
        />
      </div>

      {Number(price) > 0 && (
        <p className="bg-bg text-muted mt-4 rounded-lg p-3 text-[0.8125rem] font-semibold leading-[1.7]">
          {`KES ${(Number(price) * Number(weeks)).toLocaleString('en-KE')} in total`}
          {Number(weeks) > 1 ? ` · ${weeks} weeks at ${Number(price).toLocaleString('en-KE')}` : ''}
          . A fee line is raised for each week, so Finance sees it whether or not the money has
          arrived yet.
        </p>
      )}

      <Button
        block
        variant="black"
        className="mt-4"
        disabled={pending || !ready}
        loading={pending}
        onClick={async () => {
          setPending(true);
          const r = await onPlace({
            placementId,
            merchantId,
            weekStart,
            price: Number(price),
            weeks: Number(weeks),
            note,
          });
          setPending(false);
          toast({
            title: r.ok ? 'Done' : 'Not allowed',
            description: r.message ?? '',
            tone: r.ok ? 'success' : 'danger',
          });
          if (r.ok) {
            setMerchantId('');
            setPrice('');
            setNote('');
            router.refresh();
          }
        }}
      >
        Put them in this slot
      </Button>

      <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-[1.7]">
        They come off by themselves when the week ends. Nobody has to remember.
      </p>
    </Card>
  );
}

/**
 * Taking a merchant off, from their own page.
 *
 * Turning it on is not offered here and the RPC refuses it: being
 * featured means holding a named slot for a week at an agreed
 * price, and a toggle cannot supply any of those.
 */
export function FeaturedNow({
  merchantName,
  placement,
  onEnd,
}: {
  merchantName: string;
  placement: {
    placement_kind: string;
    placement_category: string | null;
    until: string;
    price_per_week: number | null;
    has_creative: boolean;
    booked_by_email: string | null;
  } | null;
  onEnd: (reason: string) => Promise<PlaceOutcome>;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [reason, setReason] = React.useState('');

  if (!placement) {
    return (
      <Card className="p-5">
        <h2 className="text-sm font-extrabold uppercase tracking-wide">Featured placement</h2>
        <p className="text-muted mt-2 text-sm font-semibold leading-[1.7]">
          Not featured. Selling a slot happens in Featured slots, where there is a placement, a week
          and a price to agree — none of which a switch here could say.
        </p>
      </Card>
    );
  }

  const where =
    placement.placement_kind === 'category_top' && placement.placement_category
      ? `Top of ${placement.placement_category.replace(/_/g, ' ')}`
      : placement.placement_kind.replace(/_/g, ' ');

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-extrabold uppercase tracking-wide">Featured placement</h2>
        <span className="bg-gold-soft text-gold-text rounded-full px-2.5 py-1 text-[0.625rem] font-extrabold">
          LIVE
        </span>
      </div>

      <p className="text-muted mt-2 text-sm font-semibold leading-[1.7]">
        {where} until{' '}
        {new Date(`${placement.until}T00:00:00Z`).toLocaleDateString('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          timeZone: 'UTC',
        })}
        , at{' '}
        {placement.price_per_week
          ? `KES ${placement.price_per_week.toLocaleString('en-KE')}`
          : `KES ${DASH}`}{' '}
        a week.
      </p>

      <p className="text-muted-light mt-1.5 text-[0.75rem] font-semibold leading-[1.7]">
        {placement.has_creative
          ? 'Showing their approved artwork.'
          : 'No artwork submitted, so the band shows their own photo and name.'}
        {placement.booked_by_email ? ` Sold by ${placement.booked_by_email}.` : ''}
      </p>

      <div className="mt-4">
        <Input
          id="end-featured-reason"
          label="Why end it early"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="They asked to pause"
          hint="Somebody paid for the week you are cutting short, so this is recorded."
        />
      </div>

      <Button
        block
        variant="outline"
        className="mt-3"
        disabled={pending || reason.trim() === ''}
        loading={pending}
        onClick={async () => {
          setPending(true);
          const r = await onEnd(reason);
          setPending(false);
          toast({
            title: r.ok ? 'Done' : 'Not allowed',
            description: r.message ?? '',
            tone: r.ok ? 'success' : 'danger',
          });
          if (r.ok) {
            setReason('');
            router.refresh();
          }
        }}
      >
        Take {merchantName} off the homepage
      </Button>

      <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-[1.7]">
        Left alone, it ends by itself when the week does.
      </p>
    </Card>
  );
}

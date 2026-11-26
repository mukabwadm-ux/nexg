'use client';

import { Button, cn, DetailPanel, useToast } from '@nexg/ui';
import {
  CalendarCheck,
  Car,
  Copy,
  LayoutGrid,
  Loader2,
  Minus,
  Plus,
  Send,
  ShoppingCart,
  Ticket,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import {
  conciergeCatalogue,
  conciergeQuote,
  orderConcierge,
  resendPayLink,
  type ConciergeCatalogue,
  type ConciergeQuote,
  type PayLinkSent,
} from '@/app/stays/concierge-actions';
import { SelectField, TextArea, TextField } from '@/components/portal/client-kit';

/*
 * Request Concierge Service: staff order a service for the guest whose stay
 * is open in the panel. The guest is sent a pay link (SMS, and email when
 * they have one) and pays by M-Pesa or card before the merchant starts.
 */

const kes = (cents: number | null | undefined) =>
  `KES ${Math.round((cents ?? 0) / 100).toLocaleString('en-KE')}`;

const tileCls =
  'flex h-full min-h-[5.5rem] w-full flex-col items-center justify-center gap-1.5 rounded-xl border p-2.5 text-center text-[0.8125rem] font-bold';

/* Icons by service, here because a server page cannot hand a component to a client one. */
const ICONS: Record<string, LucideIcon> = {
  transfer: Car,
  groceries: ShoppingCart,
  food: UtensilsCrossed,
  bookings: CalendarCheck,
  experiences: Ticket,
  other: LayoutGrid,
};

/** One gold tile that opens the order form for a service. */
export function ConciergeTile({
  label,
  group,
  stayId,
  guestName,
}: {
  label: string;
  group: string;
  stayId: string;
  guestName: string;
}) {
  const [open, setOpen] = React.useState(false);
  const Icon = ICONS[group] ?? LayoutGrid;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(tileCls, 'border-[#F5D27A] bg-[#FFFBF0] text-[#8A5C00] hover:bg-[#FFF4D6]')}
      >
        <Icon aria-hidden="true" className="h-6 w-6" strokeWidth={1.7} />
        {label}
      </button>
      {open && (
        <ConciergeOrderPanel
          open={open}
          onOpenChange={setOpen}
          title={label}
          group={group}
          stayId={stayId}
          guestName={guestName}
        />
      )}
    </>
  );
}

function ConciergeOrderPanel({
  open,
  onOpenChange,
  title,
  group,
  stayId,
  guestName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  group: string;
  stayId: string;
  guestName: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [catalogue, setCatalogue] = React.useState<ConciergeCatalogue | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [merchantId, setMerchantId] = React.useState('');
  const [qty, setQty] = React.useState<Record<string, number>>({});
  const [note, setNote] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [quote, setQuote] = React.useState<ConciergeQuote | null>(null);
  const [quoting, setQuoting] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState<PayLinkSent | null>(null);

  React.useEffect(() => {
    let live = true;
    void conciergeCatalogue(stayId, group)
      .then((r) => {
        if (!live) return;
        if (r.ok) setCatalogue(r.data);
        else setLoadError(r.message);
      })
      .catch(() => live && setLoadError('The console could not reach the server.'));
    return () => {
      live = false;
    };
  }, [stayId, group]);

  const merchant = catalogue?.merchants.find((m) => m.id === merchantId) ?? null;
  const items = React.useMemo(
    () =>
      Object.entries(qty)
        .filter(([, q]) => q > 0)
        .map(([id, quantity]) => ({ id, quantity })),
    [qty],
  );

  /* The total as the database will charge it, a moment after the basket changes. */
  React.useEffect(() => {
    if (!merchantId || items.length === 0) {
      setQuote(null);
      return;
    }
    let live = true;
    setQuoting(true);
    const timer = window.setTimeout(() => {
      void conciergeQuote({ stayId, merchantId, items })
        .then((q) => live && setQuote(q))
        .catch(() => live && setQuote({ ok: false, message: 'Could not price the basket.' }))
        .finally(() => live && setQuoting(false));
    }, 400);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [stayId, merchantId, items]);

  const set = (id: string, n: number) =>
    setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(50, Math.floor(n) || 0)) }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await orderConcierge({ stayId, merchantId, items, note, phone });
      if (!r.ok) {
        toast({ tone: 'danger', title: 'Not sent', description: r.message });
        return;
      }
      toast({ tone: 'success', title: 'Pay link sent' });
      setSent(r);
      router.refresh();
    } catch {
      toast({
        tone: 'danger',
        title: 'Not sent',
        description: 'The console could not reach the server. Check the connection and try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  const formId = React.useId();
  const stay = catalogue?.stay;

  return (
    <DetailPanel
      open={open}
      onOpenChange={onOpenChange}
      title={sent ? 'Pay link sent' : `Request: ${title}`}
      subtitle={
        sent
          ? 'The merchant starts once the guest pays. Nothing is owed if they do not.'
          : `For ${stay?.guest_name ?? guestName}${stay?.label ? ` · ${stay.label}` : ''}. Priced from the merchant's catalogue; the guest pays by M-Pesa or card from the link.`
      }
      width="lg"
      footer={
        sent ? (
          <div className="flex justify-end">
            <Button variant="black" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form={formId}
              variant="black"
              loading={busy}
              disabled={!merchantId || items.length === 0 || (quote !== null && !quote.ok)}
            >
              Send pay link
            </Button>
          </div>
        )
      }
    >
      {sent ? (
        <SentLink sent={sent} />
      ) : loadError ? (
        <p role="alert" className="text-danger text-sm font-bold">
          {loadError}
        </p>
      ) : !catalogue ? (
        <p className="text-muted flex items-center gap-2 text-sm font-semibold">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Loading merchants…
        </p>
      ) : (
        <form id={formId} onSubmit={(e) => void submit(e)} className="space-y-4">
          {catalogue.merchants.length === 0 ? (
            <p className="text-muted text-sm font-semibold">
              No merchant in this guest&rsquo;s city has items for this service on NexG yet.
            </p>
          ) : (
            <SelectField
              label="Merchant"
              required
              value={merchantId}
              placeholder="Choose a merchant"
              onChange={(e) => {
                setMerchantId(e.target.value);
                setQty({});
              }}
              options={catalogue.merchants.map((m) => ({
                value: m.id,
                label: `${m.name}${m.open_now ? '' : ' (closed now)'}`,
              }))}
            />
          )}

          {merchant && (
            <div>
              <p className="text-sm font-bold">Items</p>
              {!merchant.open_now && (
                <p className="text-danger mt-1 text-xs font-bold">
                  {merchant.name} is closed right now; the order will be refused until it opens.
                </p>
              )}
              <ul className="border-border mt-2 max-h-80 divide-y overflow-y-auto rounded-xl border">
                {merchant.items.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{i.name}</span>
                      <span className="text-muted text-xs font-semibold tabular-nums">
                        {i.estimate ? 'about ' : ''}KES {i.price_kes.toLocaleString('en-KE')}
                        {i.unit_label ? ` · ${i.unit_label}` : ''}
                        {i.age_restricted ? ' · 18+' : ''}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        aria-label={`One less ${i.name}`}
                        onClick={() => set(i.id, (qty[i.id] ?? 0) - 1)}
                        className="border-border hover:border-ink flex h-8 w-8 items-center justify-center rounded-full border"
                      >
                        <Minus aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                      <input
                        aria-label={`Quantity of ${i.name}`}
                        inputMode="numeric"
                        value={qty[i.id] ?? 0}
                        onChange={(e) => set(i.id, Number(e.target.value))}
                        className="border-border h-8 w-10 rounded-lg border text-center text-sm font-bold tabular-nums"
                      />
                      <button
                        type="button"
                        aria-label={`One more ${i.name}`}
                        onClick={() => set(i.id, (qty[i.id] ?? 0) + 1)}
                        className="border-border hover:border-ink flex h-8 w-8 items-center justify-center rounded-full border"
                      >
                        <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {items.length > 0 && (
            <div className="rounded-xl bg-[#FFFBF0] p-3 text-sm">
              {quoting && !quote ? (
                <p className="text-muted font-semibold">Pricing…</p>
              ) : quote && !quote.ok ? (
                <p role="alert" className="text-danger font-bold">
                  {quote.message}
                </p>
              ) : quote ? (
                <dl className="space-y-1 font-semibold">
                  <Row label="Items" value={kes(quote.subtotal_cents)} />
                  <Row label="Delivery" value={kes(quote.delivery_fee_cents)} />
                  <Row
                    label="Service fees"
                    value={kes(
                      (quote.service_fee_cents ?? 0) + (quote.small_basket_fee_cents ?? 0),
                    )}
                  />
                  <div className="flex justify-between border-t border-[#F5D27A] pt-1 font-extrabold">
                    <dt>Total the guest pays</dt>
                    <dd className="tabular-nums">{kes(quote.total_cents)}</dd>
                  </div>
                </dl>
              ) : null}
            </div>
          )}

          <TextField
            label="Guest phone (for the pay link)"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={stay?.phone_masked ?? '0712 345 678'}
            hint={
              stay?.has_phone
                ? 'Leave empty to use the number on the stay, or type the right one.'
                : 'The stay has no mobile number: enter the guest’s.'
            }
          />
          {stay?.has_email && (
            <p className="text-muted text-xs font-semibold">
              The link is also emailed to the guest.
            </p>
          )}
          <TextArea
            label="Note for the merchant and rider"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder="e.g. Call on arrival; gate on the left"
            hint={stay?.address ? `Delivered to ${stay.label} (${stay.address}).` : undefined}
          />
        </form>
      )}
    </DetailPanel>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

/** The link that went out, to copy into a call or chat. */
function SentLink({ sent }: { sent: PayLinkSent }) {
  const { toast } = useToast();
  return (
    <div className="space-y-3 text-sm">
      <p className="font-semibold">
        Order <span className="font-extrabold">{sent.reference}</span> for{' '}
        <span className="font-extrabold">{kes(sent.total_cents)}</span>. Sent to{' '}
        {(sent.sent_to ?? []).join(' and ') || 'the guest'}.
      </p>
      <div className="flex gap-2">
        <input
          readOnly
          aria-label="Pay link"
          value={sent.link ?? ''}
          onFocus={(e) => e.target.select()}
          className="border-border bg-surface h-11 min-w-0 flex-1 rounded-lg border px-3 font-mono text-xs"
        />
        <Button
          variant="outline"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(sent.link ?? '')
              .then(() => toast({ tone: 'success', title: 'Link copied' }));
          }}
        >
          <Copy aria-hidden="true" className="h-4 w-4" /> Copy
        </Button>
      </div>
      <p className="text-muted text-xs font-semibold">
        The link works for 24 hours
        {sent.expires_at
          ? ` (until ${new Date(sent.expires_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short' })})`
          : ''}
        . It is shown only now; use Resend link on the stay&rsquo;s Services tab for a new one.
      </p>
    </div>
  );
}

/** Sends a new pay link for an unpaid concierge order; the earlier one stops working. */
export function ResendLinkButton({ orderId }: { orderId: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState<PayLinkSent | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await resendPayLink(orderId);
            if (!r.ok) {
              toast({ tone: 'danger', title: 'Not sent', description: r.message });
              return;
            }
            setSent(r);
            router.refresh();
          } catch {
            toast({
              tone: 'danger',
              title: 'Not sent',
              description: 'Could not reach the server.',
            });
          } finally {
            setBusy(false);
          }
        }}
        className="inline-flex items-center gap-1 text-[0.8125rem] font-bold text-[#8A5C00] underline underline-offset-2 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Send aria-hidden="true" className="h-3.5 w-3.5" />
        )}
        Resend link
      </button>
      <DetailPanel
        open={sent !== null}
        onOpenChange={(o) => !o && setSent(null)}
        title="Pay link sent again"
        subtitle="The earlier link no longer opens."
        footer={
          <div className="flex justify-end">
            <Button variant="black" onClick={() => setSent(null)}>
              Done
            </Button>
          </div>
        }
      >
        {sent && <SentLink sent={sent} />}
      </DetailPanel>
    </>
  );
}

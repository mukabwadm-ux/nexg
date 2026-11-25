'use client';

import { Button, DetailPanel, useToast } from '@nexg/ui';
import {
  Ban,
  Download,
  FileCheck2,
  Mail,
  Pencil,
  Plus,
  ReceiptText,
  Trash2,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import {
  issueInvoice,
  makeInvoicePdf,
  markInvoiceSent,
  recordInvoicePayment,
  recordKraReference,
  saveAndIssueInvoice,
  saveClient,
  saveInvoiceDraft,
  sendInvoice,
  voidInvoice,
  type InvoiceInput,
  type Outcome,
} from '@/app/finance/invoices/actions';
import { DocumentLinks } from '@/components/finance/document-links';
import { KRA_STATUS } from '@/components/finance/invoice-list';
import {
  ActionMenu,
  ConfirmAction,
  FieldRow,
  FormPanel,
  IconAction,
  SelectField,
  TextArea,
  TextField,
} from '@/components/portal/client-kit';
import { Pill } from '@/components/portal/kit';
import {
  addDays,
  billToOf,
  categoryLabel,
  emailList,
  invoiceTotals,
  KRA_STATUSES,
  lineAmounts,
  money,
  parseKes,
  parseQuantity,
  PAYMENT_METHODS,
  REVENUE_CATEGORIES,
  VAT_RATES,
  vatRateLabel,
  type ClientInvoiceDetail,
  type FinClient,
  type VatRate,
} from '@/lib/client-invoices';
import { dateTime, day, daysUntil, todayInNairobi, type Tone } from '@/lib/portal';

/**
 * Finance → Invoices: Create Invoice, and the panel a client invoice opens
 * in. Prices are typed without VAT and VAT is added per line (16%, 0% or
 * exempt); the database works every figure out again and does every check,
 * so the figures here are a preview. Issuing numbers the invoice in the KRA
 * series and puts it on the books; after that it is paid or voided, never
 * edited.
 */

/* ───────────────────────────────────────────────────────────── shared bits */

function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function clientName(c: Pick<FinClient, 'legal_name' | 'trading_name'>): string {
  return c.trading_name && c.trading_name !== c.legal_name
    ? `${c.trading_name} (${c.legal_name})`
    : c.legal_name;
}

/** The current page's address with ?invoice= set to an invoice, or taken off. */
function useInvoiceLink() {
  const pathname = usePathname();
  const params = useSearchParams();
  return React.useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (id) next.set('invoice', id);
      else next.delete('invoice');
      const query = next.toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [pathname, params],
  );
}

/** Runs a server action, says how it went, and re-reads the page; hands back the outcome. */
function useAction() {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const run = React.useCallback(
    async <T extends Outcome>(
      action: () => Promise<T>,
      options: { quiet?: boolean } = {},
    ): Promise<T | null> => {
      setBusy(true);
      try {
        const result = await action();
        if (!result.ok) {
          toast({ tone: 'danger', title: 'Not saved', description: result.message });
          return result;
        }
        if (!options.quiet) toast({ tone: 'success', title: result.message ?? 'Saved' });
        router.refresh();
        return result;
      } catch {
        toast({
          tone: 'danger',
          title: 'Not saved',
          description:
            'The console could not reach the server. Check the connection and try again.',
        });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [router, toast],
  );
  return { run, busy };
}

function cents(value: number): string {
  return (value / 100).toFixed(2);
}

/* ────────────────────────────────────────────────────────── create invoice */

export function CreateInvoiceButton({ clients, vatPct }: { clients: FinClient[]; vatPct: number }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        variant="gold"
        leadingIcon={<Plus className="h-4 w-4" />}
        onClick={() => setOpen(true)}
      >
        Create Invoice
      </Button>
      {open && (
        <InvoiceEditor
          draft={null}
          clients={clients}
          vatPct={vatPct}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

interface LineState {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
  vatRate: VatRate;
  revenueAccount: string;
}

function blankLine(): LineState {
  return {
    key: newId(),
    description: '',
    quantity: '1',
    unitPrice: '',
    vatRate: 'standard',
    revenueAccount: 'revenue.other_services',
  };
}

function InvoiceEditor({
  draft,
  clients,
  vatPct,
  onClose,
}: {
  draft: ClientInvoiceDetail | null;
  clients: FinClient[];
  vatPct: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const link = useInvoiceLink();
  const { toast } = useToast();
  const today = todayInNairobi();
  const [clientRef] = React.useState(newId);
  const [savedId, setSavedId] = React.useState<string | null>(draft?.invoice.id ?? null);
  const [added, setAdded] = React.useState<FinClient[]>([]);
  const [adding, setAdding] = React.useState(false);
  const [clientId, setClientId] = React.useState(draft?.invoice.client_id ?? '');
  const [issueDate, setIssueDate] = React.useState(draft?.invoice.issue_date ?? today);
  const [dueDate, setDueDate] = React.useState(draft?.invoice.due_date ?? '');
  const [dueTouched, setDueTouched] = React.useState(Boolean(draft));
  const [notes, setNotes] = React.useState(draft?.invoice.notes ?? '');
  const [lines, setLines] = React.useState<LineState[]>(() =>
    draft && draft.lines.length
      ? draft.lines.map((l) => ({
          key: newId(),
          description: l.description,
          quantity: String(l.quantity),
          unitPrice: cents(l.unit_price_cents),
          vatRate: l.vat_rate,
          revenueAccount: l.revenue_account,
        }))
      : [blankLine()],
  );
  const [busy, setBusy] = React.useState(false);

  const all = React.useMemo(() => {
    const byId = new Map<string, FinClient>();
    for (const c of [...clients, ...added]) byId.set(c.id, c);
    if (draft && !byId.has(draft.client.id)) byId.set(draft.client.id, draft.client);
    return [...byId.values()];
  }, [clients, added, draft]);
  const choices = all.filter((c) => c.active || c.id === clientId);
  const client = all.find((c) => c.id === clientId) ?? null;

  /* The due date follows the client's terms until someone sets it. */
  React.useEffect(() => {
    if (dueTouched) return;
    setDueDate(client && issueDate ? addDays(issueDate, client.payment_terms_days) : '');
  }, [client, issueDate, dueTouched]);

  const amounts = lines.map((l) => {
    const quantity = parseQuantity(l.quantity);
    const unit = parseKes(l.unitPrice);
    return unit == null || Number.isNaN(unit) || Number.isNaN(quantity)
      ? { net: 0, vat: 0, gross: 0 }
      : lineAmounts(quantity, unit, l.vatRate, vatPct);
  });
  const totals = invoiceTotals(amounts);

  const setLine = (key: string, patch: Partial<LineState>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  /* The form as the database takes it, or why it cannot be sent yet. */
  const collect = (issuing: boolean): InvoiceInput | null => {
    const warn = (title: string) => {
      toast({ tone: 'warning', title });
      return null;
    };
    if (!clientId) return warn('Choose the client, or add a new one');
    if (!issueDate) return warn('Enter the issue date');
    if (dueDate && dueDate < issueDate) return warn('The due date is on or after the issue date');
    const filled = lines.filter((l) => l.description.trim() || l.unitPrice.trim());
    const out: InvoiceInput['lines'] = [];
    for (const [i, l] of filled.entries()) {
      const quantity = parseQuantity(l.quantity);
      const unit = parseKes(l.unitPrice);
      if (l.description.trim().length < 2) return warn(`Line ${i + 1}: say what it is for`);
      if (Number.isNaN(quantity))
        return warn(`Line ${i + 1}: enter a quantity above zero, up to three decimals`);
      if (unit == null || Number.isNaN(unit))
        return warn(`Line ${i + 1}: enter the unit price in shillings, excluding VAT`);
      out.push({
        description: l.description.trim(),
        quantity,
        unitPriceCents: unit,
        vatRate: l.vatRate,
        revenueAccount: l.revenueAccount,
      });
    }
    if (issuing && out.length === 0) return warn('Add at least one line before issuing');
    if (issuing && issueDate > today)
      return warn('This invoice is dated after today: issue it on that day, or change its date');
    return {
      id: savedId,
      clientRef,
      clientId,
      issueDate,
      dueDate,
      notes,
      lines: out,
    };
  };

  const submit = async (issuing: boolean): Promise<boolean> => {
    const input = collect(issuing);
    if (!input) return false;
    setBusy(true);
    try {
      if (!issuing) {
        const r = await saveInvoiceDraft(input);
        if (!r.ok || !r.id) {
          toast({ tone: 'danger', title: 'Draft not saved', description: r.message });
          return false;
        }
        toast({ tone: 'success', title: 'Draft saved' });
        router.replace(link(r.id), { scroll: false });
        router.refresh();
        return true;
      }
      const r = await saveAndIssueInvoice(input);
      if (r.id) setSavedId(r.id);
      if (!r.ok) {
        toast({ tone: 'danger', title: 'Not issued', description: r.message });
        return false;
      }
      toast({ tone: 'success', title: r.message ?? 'Invoice issued' });
      if (r.pdfProblem) {
        toast({
          tone: 'warning',
          title: 'The PDF is not ready yet',
          description: `${r.pdfProblem} Make it from the invoice with Download PDF.`,
        });
      }
      router.replace(link(r.id ?? null), { scroll: false });
      router.refresh();
      return true;
    } catch {
      toast({
        tone: 'danger',
        title: 'Not saved',
        description: 'The console could not reach the server. Check the connection and try again.',
      });
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={draft ? 'Edit Draft Invoice' : 'Create Invoice'}
      subtitle="Prices exclude VAT. Issuing numbers the invoice for KRA and puts it on the books."
      submitLabel="Issue Invoice"
      secondary={{ label: 'Save Draft', onSubmit: () => submit(false) }}
      busy={busy}
      width="lg"
      onSubmit={() => submit(true)}
    >
      <div className="flex flex-wrap items-end gap-2">
        <SelectField
          label="Client"
          className="min-w-0 flex-1"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder={choices.length ? 'Choose a client' : 'No clients yet: add one'}
          options={choices.map((c) => ({ value: c.id, label: clientName(c) }))}
        />
        {!adding && (
          <Button
            variant="outline"
            leadingIcon={<UserPlus className="h-4 w-4" />}
            onClick={() => setAdding(true)}
          >
            New Client
          </Button>
        )}
      </div>
      {client && !adding && (
        <p className="text-muted-light -mt-2 text-xs">
          {client.kra_pin ? `KRA PIN ${client.kra_pin}` : 'No KRA PIN on file'} ·{' '}
          {client.payment_terms_days} days to pay
          {client.email ? ` · ${client.email}` : ' · no invoice email on file'}
        </p>
      )}
      {adding && (
        <NewClientFields
          onCancel={() => setAdding(false)}
          onSaved={(c) => {
            setAdded((prev) => [...prev, c]);
            setClientId(c.id);
            setAdding(false);
          }}
        />
      )}

      <FieldRow>
        <TextField
          label="Issue Date"
          required
          type="date"
          value={issueDate}
          onChange={(e) => setIssueDate(e.target.value)}
          hint="An invoice can be dated up to 31 days back."
        />
        <TextField
          label="Due Date"
          type="date"
          min={issueDate}
          value={dueDate}
          onChange={(e) => {
            setDueTouched(true);
            setDueDate(e.target.value);
          }}
          hint={client ? `Defaults to the client's ${client.payment_terms_days} days.` : undefined}
        />
      </FieldRow>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-extrabold">Lines</h3>
          <span className="text-muted-light text-xs">Unit prices in KES, excluding VAT</span>
        </div>
        {lines.map((l, i) => {
          const a = amounts[i] ?? { net: 0, vat: 0, gross: 0 };
          return (
            <div key={l.key} className="border-border rounded-xl border p-3">
              <div className="flex items-end gap-2">
                <TextField
                  label={`Line ${i + 1}`}
                  className="min-w-0 flex-1"
                  value={l.description}
                  onChange={(e) => setLine(l.key, { description: e.target.value })}
                  maxLength={300}
                  placeholder="What it is for"
                />
                <IconAction
                  label={`Remove line ${i + 1}`}
                  disabled={lines.length === 1}
                  onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                >
                  <Trash2 />
                </IconAction>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,0.7fr)_minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <SelectField
                  label="Category"
                  value={l.revenueAccount}
                  onChange={(e) => setLine(l.key, { revenueAccount: e.target.value })}
                  options={REVENUE_CATEGORIES}
                />
                <TextField
                  label="Quantity"
                  inputMode="decimal"
                  value={l.quantity}
                  onChange={(e) => setLine(l.key, { quantity: e.target.value })}
                />
                <TextField
                  label="Unit Price"
                  inputMode="decimal"
                  value={l.unitPrice}
                  onChange={(e) => setLine(l.key, { unitPrice: e.target.value })}
                  placeholder="0.00"
                />
                <SelectField
                  label="VAT"
                  value={l.vatRate}
                  onChange={(e) => setLine(l.key, { vatRate: e.target.value as VatRate })}
                  options={VAT_RATES.map((r) => ({ value: r, label: vatRateLabel(r, vatPct) }))}
                />
              </div>
              <p className="text-muted mt-2 text-right text-xs tabular-nums">
                Net {money(a.net)} · VAT {money(a.vat)} ·{' '}
                <span className="text-ink font-bold">Total {money(a.gross)}</span>
              </p>
            </div>
          );
        })}
        <Button
          variant="outline"
          size="sm"
          leadingIcon={<Plus className="h-4 w-4" />}
          onClick={() => setLines((prev) => [...prev, blankLine()])}
          disabled={lines.length >= 100}
        >
          Add Line
        </Button>
      </div>

      <dl className="bg-bg space-y-1.5 rounded-xl px-4 py-3 text-sm tabular-nums">
        <div className="flex justify-between gap-4">
          <dt className="text-muted font-semibold">Net (excl. VAT)</dt>
          <dd className="font-semibold">{money(totals.net)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted font-semibold">VAT</dt>
          <dd className="font-semibold">{money(totals.vat)}</dd>
        </div>
        <div className="border-border flex justify-between gap-4 border-t pt-1.5 text-base">
          <dt className="font-extrabold">Total (KES)</dt>
          <dd className="font-extrabold">{money(totals.gross)}</dd>
        </div>
      </dl>

      <TextArea
        label="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        maxLength={2000}
        placeholder="Printed on the invoice: a purchase order number, the period it covers"
      />
    </FormPanel>
  );
}

function NewClientFields({
  onSaved,
  onCancel,
}: {
  onSaved: (client: FinClient) => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [f, setF] = React.useState({
    kind: 'corporate' as 'corporate' | 'partner',
    legalName: '',
    tradingName: '',
    kraPin: '',
    email: '',
    ccEmails: '',
    phone: '',
    address: '',
    terms: '14',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    const terms = Number(f.terms);
    if (f.legalName.trim().length < 2) {
      toast({ tone: 'warning', title: 'Enter the client’s legal name' });
      return;
    }
    if (!Number.isInteger(terms) || terms < 0 || terms > 365) {
      toast({ tone: 'warning', title: 'Payment terms are between 0 and 365 days' });
      return;
    }
    setBusy(true);
    try {
      const r = await saveClient({
        kind: f.kind,
        legalName: f.legalName,
        tradingName: f.tradingName,
        kraPin: f.kraPin,
        email: f.email,
        ccEmails: f.ccEmails,
        phone: f.phone,
        address: f.address,
        paymentTermsDays: terms,
      });
      if (!r.ok || !r.id) {
        toast({ tone: 'danger', title: 'Client not saved', description: r.message });
        return;
      }
      toast({ tone: 'success', title: 'Client added' });
      router.refresh();
      onSaved({
        id: r.id,
        kind: f.kind,
        legal_name: f.legalName.trim(),
        trading_name: f.tradingName.trim() || null,
        kra_pin: f.kraPin.trim().toUpperCase() || null,
        email: f.email.trim().toLowerCase() || null,
        cc_emails: emailList(f.ccEmails).ok,
        phone: f.phone.trim() || null,
        address: f.address.trim() || null,
        payment_terms_days: terms,
        active: true,
      });
    } catch {
      toast({
        tone: 'danger',
        title: 'Client not saved',
        description: 'The console could not reach the server. Check the connection and try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  /* Enter in these fields saves the client, not the invoice around them. */
  const enterSaves = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    void save();
  };

  return (
    <div className="space-y-4 rounded-xl border border-[#F6E7BC] bg-[#FFFDF6] p-4">
      <p className="text-sm font-extrabold">New Client</p>
      <FieldRow>
        <SelectField
          label="Type"
          value={f.kind}
          onChange={(e) => set('kind', e.target.value as 'corporate' | 'partner')}
          options={[
            { value: 'corporate', label: 'Corporate Client' },
            { value: 'partner', label: 'Partner' },
          ]}
        />
        <TextField
          label="Payment Terms (Days)"
          inputMode="numeric"
          value={f.terms}
          onKeyDown={enterSaves}
          onChange={(e) => set('terms', e.target.value.replace(/\D/g, '').slice(0, 3))}
        />
      </FieldRow>
      <FieldRow>
        <TextField
          label="Legal Name"
          value={f.legalName}
          onKeyDown={enterSaves}
          onChange={(e) => set('legalName', e.target.value)}
          maxLength={200}
          placeholder="As registered with KRA"
        />
        <TextField
          label="Trading Name"
          value={f.tradingName}
          onKeyDown={enterSaves}
          onChange={(e) => set('tradingName', e.target.value)}
          maxLength={200}
        />
      </FieldRow>
      <FieldRow>
        <TextField
          label="KRA PIN"
          value={f.kraPin}
          onKeyDown={enterSaves}
          onChange={(e) => set('kraPin', e.target.value.toUpperCase().replace(/\s/g, ''))}
          maxLength={11}
          placeholder="P051234567X"
        />
        <TextField
          label="Phone"
          type="tel"
          value={f.phone}
          onKeyDown={enterSaves}
          onChange={(e) => set('phone', e.target.value)}
          maxLength={30}
          placeholder="+254 712 345 678"
        />
      </FieldRow>
      <FieldRow>
        <TextField
          label="Invoice Email"
          inputMode="email"
          value={f.email}
          onKeyDown={enterSaves}
          onChange={(e) => set('email', e.target.value)}
          maxLength={254}
          placeholder="accounts@client.co.ke"
        />
        <TextField
          label="Copy To"
          inputMode="email"
          value={f.ccEmails}
          onKeyDown={enterSaves}
          onChange={(e) => set('ccEmails', e.target.value)}
          placeholder="Other addresses, comma separated"
        />
      </FieldRow>
      <TextArea
        label="Address"
        rows={2}
        value={f.address}
        onChange={(e) => set('address', e.target.value)}
        maxLength={300}
        placeholder="Building, street, town"
      />
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="black" size="sm" loading={busy} onClick={() => void save()}>
          Save Client
        </Button>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────── the invoice panel */

type Mode = 'view' | 'edit' | 'pay' | 'void' | 'kra' | 'send';

function statusOf(d: ClientInvoiceDetail, today: string): { label: string; tone: Tone } {
  const inv = d.invoice;
  if (inv.status === 'draft') return { label: 'Draft', tone: 'grey' };
  if (inv.status === 'paid') return { label: 'Paid', tone: 'green' };
  if (inv.status === 'void') return { label: 'Void', tone: 'blue' };
  if (inv.due_date < today) return { label: 'Overdue', tone: 'red' };
  if (d.paid_cents > 0) return { label: 'Part Paid', tone: 'amber' };
  return { label: 'Sent', tone: 'amber' };
}

export function ClientInvoicePanel({
  detail,
  canWrite,
  emailReady,
  clients,
  vatPct,
}: {
  detail: ClientInvoiceDetail;
  canWrite: boolean;
  emailReady: boolean;
  clients: FinClient[];
  vatPct: number;
}) {
  const router = useRouter();
  const link = useInvoiceLink();
  const [mode, setMode] = React.useState<Mode>('view');
  /* Closed at once, before the page without it has loaded. */
  const [open, setOpen] = React.useState(true);
  const { run, busy } = useAction();
  const { toast } = useToast();
  const today = todayInNairobi();
  const inv = detail.invoice;
  const bill = billToOf(detail);
  const status = statusOf(detail, today);
  const back = () => setMode('view');

  const download = async () => {
    if (!inv.pdf_path) {
      const made = await run(() => makeInvoicePdf(inv.id), { quiet: true });
      if (!made?.ok) return;
    }
    window.location.assign(`/finance/invoices/${inv.id}/pdf`);
  };

  if (mode === 'edit')
    return <InvoiceEditor draft={detail} clients={clients} vatPct={vatPct} onClose={back} />;
  if (mode === 'pay') return <PaymentPanel detail={detail} onClose={back} />;
  if (mode === 'void') return <VoidPanel detail={detail} onClose={back} />;
  if (mode === 'kra') return <KraPanel detail={detail} onClose={back} />;
  if (mode === 'send')
    return (
      <SendPanel detail={detail} emailReady={emailReady} onDownload={download} onClose={back} />
    );

  const issued = inv.status !== 'draft';
  const canPdf = issued && (Boolean(inv.pdf_path) || canWrite);
  const footer = (
    <div className="flex w-full flex-wrap items-center justify-end gap-2">
      {canWrite && issued && (
        <ActionMenu
          label="More actions"
          className="mr-auto"
          actions={[
            {
              label: 'Record KRA Reference',
              icon: <ReceiptText className="h-4 w-4" />,
              onSelect: () => setMode('kra'),
              opensOverlay: true,
            },
            inv.status === 'issued' &&
              detail.payments.length === 0 && {
                label: 'Void Invoice',
                icon: <Ban className="h-4 w-4" />,
                tone: 'danger' as const,
                separated: true,
                onSelect: () => setMode('void'),
                opensOverlay: true,
              },
          ]}
        />
      )}
      {canWrite && inv.status === 'draft' && (
        <>
          <Button
            variant="outline"
            leadingIcon={<Pencil className="h-4 w-4" />}
            onClick={() => setMode('edit')}
          >
            Edit
          </Button>
          <ConfirmAction
            trigger={
              <Button variant="black" leadingIcon={<FileCheck2 className="h-4 w-4" />}>
                Issue Invoice
              </Button>
            }
            title={`Issue this invoice for KES ${money(inv.gross_cents)}?`}
            body="It takes the next number in the KRA series and goes on the books. After that it cannot be edited: a mistake is put right by voiding it."
            confirmLabel="Issue Invoice"
            tone="black"
            onConfirm={async () => {
              const r = await run(() => issueInvoice(inv.id));
              if (r?.ok && r.pdfProblem) {
                toast({
                  tone: 'warning',
                  title: 'The PDF is not ready yet',
                  description: `${r.pdfProblem} Make it with Download PDF.`,
                });
              }
              return Boolean(r?.ok);
            }}
          />
        </>
      )}
      {canPdf && (
        <Button
          variant="outline"
          loading={busy}
          leadingIcon={<Download className="h-4 w-4" />}
          onClick={() => void download()}
        >
          Download PDF
        </Button>
      )}
      {canWrite && (inv.status === 'issued' || inv.status === 'paid') && (
        <Button
          variant="outline"
          leadingIcon={<Mail className="h-4 w-4" />}
          onClick={() => setMode('send')}
        >
          Send by Email
        </Button>
      )}
      {canWrite && inv.status === 'issued' && (
        <Button
          variant="black"
          leadingIcon={<Wallet className="h-4 w-4" />}
          onClick={() => setMode('pay')}
        >
          Record Payment
        </Button>
      )}
    </div>
  );

  const kra = (k: string) => KRA_STATUS[k] ?? { label: k, tone: 'grey' as const };

  return (
    <DetailPanel
      open={open}
      onOpenChange={(o) => {
        if (o) return;
        setOpen(false);
        router.replace(link(null), { scroll: false });
      }}
      width="lg"
      title={inv.number ?? 'Draft Invoice'}
      subtitle={bill.trading_name || bill.legal_name}
      meta={
        <>
          <Pill tone={status.tone} dot>
            {status.label}
          </Pill>
          <Pill tone="ink">Client Invoice</Pill>
        </>
      }
      footer={footer}
    >
      <div className="space-y-5 text-sm">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Fact label="Total" value={`KES ${money(inv.gross_cents)}`} strong />
          <Fact
            label="Balance"
            value={issued && inv.status !== 'void' ? `KES ${money(detail.balance_cents)}` : '—'}
            bad={status.label === 'Overdue'}
          />
          <Fact label="Issue Date" value={day(inv.issue_date)} />
          <Fact
            label="Due Date"
            value={day(inv.due_date)}
            note={
              status.label === 'Overdue'
                ? `${-daysUntil(inv.due_date, today)} days overdue`
                : undefined
            }
            bad={status.label === 'Overdue'}
          />
        </dl>

        {inv.status === 'draft' && (
          <p className="bg-bg rounded-xl px-4 py-3">
            A draft: not numbered, not on the books and not sent. Issuing gives it the next KRA
            number and posts it to the ledger.
          </p>
        )}
        {inv.status === 'void' && (
          <p className="bg-info-bg text-info rounded-xl px-4 py-3 font-semibold">
            Voided {day(inv.voided_at)}
            {inv.voided_by_name ? ` by ${inv.voided_by_name}` : ''}: “{inv.void_reason}”.
            {detail.credit_note ? ` Credit note ${detail.credit_note.number} reverses it.` : ''}
          </p>
        )}

        <Section title="Bill To">
          <p className="font-bold">{bill.legal_name}</p>
          {bill.trading_name && bill.trading_name !== bill.legal_name && (
            <p className="text-muted">Trading as {bill.trading_name}</p>
          )}
          <p className="text-muted">
            {bill.kra_pin ? `KRA PIN ${bill.kra_pin}` : 'No KRA PIN on file'}
          </p>
          {bill.address && <p className="text-muted">{bill.address}</p>}
          {(bill.email || (bill.cc_emails ?? []).length > 0) && (
            <p className="text-muted break-words">
              {[bill.email, ...(bill.cc_emails ?? [])].filter(Boolean).join(', ')}
            </p>
          )}
        </Section>

        <Section title="Lines" aside="KES, unit prices excluding VAT">
          {detail.lines.length === 0 ? (
            <p className="text-muted-light">No lines yet.</p>
          ) : (
            <div className="border-border overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[34rem] text-left tabular-nums">
                <thead className="bg-bg text-muted text-xs">
                  <tr>
                    <th className="px-3 py-2 font-bold">Description</th>
                    <th className="px-3 py-2 text-right font-bold">Qty</th>
                    <th className="px-3 py-2 text-right font-bold">Unit Price</th>
                    <th className="px-3 py-2 text-right font-bold">VAT</th>
                    <th className="px-3 py-2 text-right font-bold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {detail.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2">
                        <span className="block font-semibold">{l.description}</span>
                        <span className="text-muted-light block text-xs">
                          {categoryLabel(l.revenue_account)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">{l.quantity}</td>
                      <td className="px-3 py-2 text-right">{money(l.unit_price_cents)}</td>
                      <td className="px-3 py-2 text-right">
                        <span className="block">{money(l.vat_cents)}</span>
                        <span className="text-muted-light block text-xs">
                          {vatRateLabel(l.vat_rate, l.vat_pct)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{money(l.gross_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <dl className="ml-auto mt-3 max-w-xs space-y-1 tabular-nums">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Net (excl. VAT)</dt>
              <dd>{money(inv.net_cents)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">VAT</dt>
              <dd>{money(inv.vat_cents)}</dd>
            </div>
            <div className="border-border flex justify-between gap-4 border-t pt-1 font-extrabold">
              <dt>Total (KES)</dt>
              <dd>{money(inv.gross_cents)}</dd>
            </div>
          </dl>
        </Section>

        {detail.payments.length > 0 && (
          <Section title="Payments">
            <ul className="divide-border border-border divide-y rounded-xl border">
              {detail.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block font-semibold tabular-nums">{p.reference}</span>
                    <span className="text-muted-light block text-xs">
                      {p.method === 'mpesa' ? 'M-PESA' : 'Bank transfer'} · {day(p.paid_on)}
                      {p.recorded_by_name ? ` · recorded by ${p.recorded_by_name}` : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-bold tabular-nums">KES {money(p.amount_cents)}</span>
                    <DocumentLinks
                      href={`/finance/documents/receipt/${p.id}?invoice=${detail.invoice.id}`}
                      label="receipt"
                    />
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {(detail.tax_invoice || detail.credit_note) && (
          <Section title="KRA">
            <ul className="space-y-2">
              {[
                detail.tax_invoice && { kind: 'Tax Invoice', doc: detail.tax_invoice },
                detail.credit_note && { kind: 'Credit Note', doc: detail.credit_note },
              ]
                .filter((x): x is { kind: string; doc: NonNullable<typeof detail.tax_invoice> } =>
                  Boolean(x),
                )
                .map(({ kind, doc }) => (
                  <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="font-semibold">{kind}</span>{' '}
                      <span className="tabular-nums">{doc.number}</span>
                      {doc.kra_reference && (
                        <span className="text-muted-light block text-xs tabular-nums">
                          KRA reference {doc.kra_reference}
                        </span>
                      )}
                    </span>
                    <Pill tone={kra(doc.kra_status).tone} dot>
                      {kra(doc.kra_status).label}
                    </Pill>
                  </li>
                ))}
            </ul>
          </Section>
        )}

        {inv.notes && (
          <Section title="Notes">
            <p className="whitespace-pre-line">{inv.notes}</p>
          </Section>
        )}

        <Section title="History">
          <ul className="text-muted space-y-1">
            <li>
              Created {dateTime(inv.created_at)}
              {inv.created_by_name ? ` by ${inv.created_by_name}` : ''}
            </li>
            {inv.issued_at && (
              <li>
                Issued {dateTime(inv.issued_at)}
                {inv.issued_by_name ? ` by ${inv.issued_by_name}` : ''}
              </li>
            )}
            {inv.sent_at && (
              <li>
                Sent {dateTime(inv.sent_at)} to {inv.sent_to}
              </li>
            )}
            {inv.paid_at && <li>Paid in full {dateTime(inv.paid_at)}</li>}
            {inv.voided_at && <li>Voided {dateTime(inv.voided_at)}</li>}
            {issued && !inv.pdf_path && <li>No PDF stored yet.</li>}
          </ul>
        </Section>
      </div>
    </DetailPanel>
  );
}

function Fact({
  label,
  value,
  note,
  strong,
  bad,
}: {
  label: string;
  value: string;
  note?: string;
  strong?: boolean;
  bad?: boolean;
}) {
  return (
    <div className="bg-bg rounded-xl px-3 py-2.5">
      <dt className="text-muted-light text-xs font-semibold">{label}</dt>
      <dd
        className={`mt-0.5 tabular-nums ${strong ? 'font-extrabold' : 'font-bold'} ${bad ? 'text-danger' : ''}`}
      >
        {value}
      </dd>
      {note && <dd className="text-danger text-xs font-semibold">{note}</dd>}
    </div>
  );
}

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 text-[0.9375rem] font-extrabold">
        {title}
        {aside && <span className="text-muted-light ml-2 text-xs font-semibold">{aside}</span>}
      </h3>
      {children}
    </section>
  );
}

/* ───────────────────────────────────────────────────── payment, void, KRA */

function PaymentPanel({ detail, onClose }: { detail: ClientInvoiceDetail; onClose: () => void }) {
  const inv = detail.invoice;
  const today = todayInNairobi();
  const [amount, setAmount] = React.useState(cents(detail.balance_cents));
  const [method, setMethod] = React.useState<'bank' | 'mpesa'>('bank');
  const [reference, setReference] = React.useState('');
  const [paidOn, setPaidOn] = React.useState(today);
  const { run, busy } = useAction();
  const { toast } = useToast();
  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title="Record Payment"
      subtitle={`${inv.number} · KES ${money(detail.balance_cents)} owed`}
      submitLabel="Record Payment"
      busy={busy}
      onSubmit={async () => {
        const value = parseKes(amount);
        if (!value || Number.isNaN(value)) {
          toast({ tone: 'warning', title: 'Enter the amount received, in shillings' });
          return false;
        }
        if (value > detail.balance_cents) {
          toast({
            tone: 'warning',
            title: `That is more than the KES ${money(detail.balance_cents)} owed`,
          });
          return false;
        }
        const r = await run(() =>
          recordInvoicePayment({ id: inv.id, amountCents: value, method, reference, paidOn }),
        );
        return Boolean(r?.ok);
      }}
    >
      <p className="bg-bg rounded-xl px-4 py-3 text-sm">
        The payment goes on the books against the{' '}
        {method === 'mpesa' ? 'M-PESA paybill' : 'bank account'} and clears what the client owes. A
        recorded payment is final.
      </p>
      <FieldRow>
        <TextField
          label="Amount (KES)"
          required
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <TextField
          label="Paid On"
          required
          type="date"
          max={today}
          value={paidOn}
          onChange={(e) => setPaidOn(e.target.value)}
        />
      </FieldRow>
      <FieldRow>
        <SelectField
          label="Paid By"
          value={method}
          onChange={(e) => setMethod(e.target.value as 'bank' | 'mpesa')}
          options={PAYMENT_METHODS}
        />
        <TextField
          label={method === 'mpesa' ? 'M-PESA Code' : 'Bank Reference'}
          required
          value={reference}
          onChange={(e) => setReference(e.target.value.toUpperCase())}
          maxLength={80}
          placeholder={method === 'mpesa' ? 'SKL4X2ABCD' : 'FT26318XYZ'}
        />
      </FieldRow>
    </FormPanel>
  );
}

function VoidPanel({ detail, onClose }: { detail: ClientInvoiceDetail; onClose: () => void }) {
  const inv = detail.invoice;
  const [reason, setReason] = React.useState('');
  const { run, busy } = useAction();
  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title="Void Invoice"
      subtitle={`${inv.number} · KES ${money(inv.gross_cents)}`}
      submitLabel="Void Invoice"
      danger
      busy={busy}
      onSubmit={async () => Boolean((await run(() => voidInvoice(inv.id, reason)))?.ok)}
    >
      <p className="bg-danger-bg text-danger rounded-xl px-4 py-3 text-sm font-semibold">
        Voiding takes the invoice off the books and issues a credit note for the whole amount, to be
        filed with KRA. It cannot be undone; to bill the client again, create a new invoice.
      </p>
      <TextArea
        label="Why"
        required
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={500}
        placeholder="Raised against the wrong client"
      />
    </FormPanel>
  );
}

function KraPanel({ detail, onClose }: { detail: ClientInvoiceDetail; onClose: () => void }) {
  const docs = [
    detail.tax_invoice && {
      value: detail.tax_invoice.id,
      label: `Tax Invoice ${detail.tax_invoice.number}`,
    },
    detail.credit_note && {
      value: detail.credit_note.id,
      label: `Credit Note ${detail.credit_note.number}`,
    },
  ].filter((d): d is { value: string; label: string } => Boolean(d));
  const [doc, setDoc] = React.useState(
    detail.credit_note && detail.credit_note.kra_status === 'pending'
      ? detail.credit_note.id
      : (docs[0]?.value ?? ''),
  );
  const [status, setStatus] = React.useState('accepted');
  const [reference, setReference] = React.useState('');
  const [note, setNote] = React.useState('');
  const { run, busy } = useAction();
  const { toast } = useToast();
  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title="Record KRA Reference"
      subtitle="Until NexG is connected to eTIMS, record what KRA returned by hand."
      submitLabel="Save"
      busy={busy}
      onSubmit={async () => {
        if (!doc) return false;
        if ((status === 'accepted' || status === 'submitted') && !reference.trim()) {
          toast({ tone: 'warning', title: 'Enter the reference KRA returned' });
          return false;
        }
        const r = await run(() =>
          recordKraReference({ taxInvoiceId: doc, status, reference: reference.trim(), note }),
        );
        return Boolean(r?.ok);
      }}
    >
      {docs.length > 1 && (
        <SelectField
          label="Document"
          value={doc}
          onChange={(e) => setDoc(e.target.value)}
          options={docs}
        />
      )}
      <FieldRow>
        <SelectField
          label="KRA Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={KRA_STATUSES}
        />
        <TextField
          label="KRA Reference"
          value={reference}
          onChange={(e) => setReference(e.target.value.toUpperCase())}
          maxLength={80}
          placeholder="The invoice number KRA returned"
        />
      </FieldRow>
      <TextArea
        label="Note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        placeholder="Optional"
      />
    </FormPanel>
  );
}

function SendPanel({
  detail,
  emailReady,
  onDownload,
  onClose,
}: {
  detail: ClientInvoiceDetail;
  emailReady: boolean;
  onDownload: () => Promise<void>;
  onClose: () => void;
}) {
  const inv = detail.invoice;
  const bill = billToOf(detail);
  const [to, setTo] = React.useState(bill.email ?? '');
  const [cc, setCc] = React.useState((bill.cc_emails ?? []).join(', '));
  const [message, setMessage] = React.useState('');
  const [manual, setManual] = React.useState(!emailReady);
  const [sending, setSending] = React.useState(false);
  const { run, busy } = useAction();
  const { toast } = useToast();
  const router = useRouter();

  if (manual) {
    return (
      <FormPanel
        open
        onOpenChange={(o) => !o && onClose()}
        title="Send by Email"
        subtitle={`${inv.number} · KES ${money(inv.gross_cents)}`}
        submitLabel="Record as Sent"
        busy={busy}
        onSubmit={async () =>
          Boolean((await run(() => markInvoiceSent(inv.id, `${to}, ${cc}`)))?.ok)
        }
      >
        <p className="rounded-xl bg-[#FFF1D1] px-4 py-3 text-sm font-semibold text-[#8A5A00]">
          Email is not set up for the console yet, so it cannot send this invoice. Download the PDF,
          send it from the Finance mailbox, then record it here as sent.
        </p>
        <Button
          variant="outline"
          size="sm"
          leadingIcon={<Download className="h-4 w-4" />}
          onClick={() => void onDownload()}
        >
          Download PDF
        </Button>
        <TextField
          label="Sent To"
          required
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="accounts@client.co.ke"
        />
        <TextField
          label="Copied To"
          value={cc}
          onChange={(e) => setCc(e.target.value)}
          placeholder="Other addresses, comma separated"
        />
      </FormPanel>
    );
  }

  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title="Send by Email"
      subtitle={`${inv.number} as a PDF, from NexG Finance`}
      submitLabel="Send Invoice"
      busy={sending}
      onSubmit={async () => {
        setSending(true);
        try {
          const r = await sendInvoice({ id: inv.id, to, cc, message });
          if (r.email === 'skipped') {
            toast({
              tone: 'warning',
              title: 'Email is not set up',
              description:
                'Nothing was sent. Download the PDF, send it yourself and record it here.',
            });
            setManual(true);
            return false;
          }
          if (!r.ok) {
            toast({ tone: 'danger', title: 'Not sent', description: r.message });
            return false;
          }
          toast({ tone: 'success', title: r.message ?? 'Invoice sent' });
          router.refresh();
          return true;
        } catch {
          toast({
            tone: 'danger',
            title: 'Not sent',
            description:
              'The console could not reach the server. Check the connection and try again.',
          });
          return false;
        } finally {
          setSending(false);
        }
      }}
    >
      <p className="bg-bg rounded-xl px-4 py-3 text-sm">
        The invoice goes as a PDF attachment from finance@nexgapp.com, and replies come back there.
      </p>
      <TextField
        label="To"
        required
        value={to}
        onChange={(e) => setTo(e.target.value)}
        placeholder="accounts@client.co.ke"
      />
      <TextField
        label="Copy To"
        value={cc}
        onChange={(e) => setCc(e.target.value)}
        placeholder="Other addresses, comma separated"
      />
      <TextArea
        label="Message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={1000}
        placeholder="Optional: a line for the client above the payment details"
      />
    </FormPanel>
  );
}

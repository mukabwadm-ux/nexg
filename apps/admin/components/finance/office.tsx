'use client';

import { Button, cn, DataTable, EmptyState, Progress, type ColumnDef, useToast } from '@nexg/ui';
import {
  Ban,
  Briefcase,
  Building2,
  Car,
  CheckCircle2,
  FileText,
  Landmark,
  Laptop,
  Megaphone,
  Package,
  Paperclip,
  Pencil,
  Plus,
  Receipt,
  Shield,
  Users,
  Wallet,
  Wrench,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import {
  cancelExpense,
  decideExpense,
  payExpense,
  receiptLink,
  saveExpense,
  setBudget,
} from '@/app/finance/office/actions';
import {
  ActionMenu,
  FieldRow,
  FilterSelect,
  FormPanel,
  fromCents,
  IconAction,
  SearchBox,
  SelectField,
  TextArea,
  TextField,
  toCents,
  useRunner,
  useShowMore,
} from '@/components/portal/client-kit';
import { Person, Pill } from '@/components/portal/kit';
import { EXPENSE_CATEGORIES, EXPENSE_STATUS, PAYMENT_METHODS } from '@/lib/office-finance';
import { day, kes, shillings, todayInNairobi } from '@/lib/portal';
import { createClient } from '@/lib/supabase/client';

export interface ExpenseRow {
  id: string;
  number: string;
  spent_on: string;
  description: string;
  category: string;
  payee: string;
  vendor_id: string | null;
  location_id: string | null;
  amount_cents: number;
  status: string;
  submitted_by: string | null;
  submitted_at: string;
  decided_at: string | null;
  decision_note: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  paid_on: string | null;
  receipt_path: string | null;
  notes: string | null;
  submitter: { display_name: string | null; email: string } | null;
  decider: { display_name: string | null } | null;
  vendor: { name: string } | null;
  location: { name: string } | null;
}

export interface Choice {
  id: string;
  name: string;
}

const CATEGORY_ICON: Record<string, LucideIcon> = {
  rent_utilities: Building2,
  salaries_wages: Users,
  office_supplies: Package,
  transport_travel: Car,
  it_systems: Laptop,
  marketing: Megaphone,
  professional_fees: Briefcase,
  repairs_maintenance: Wrench,
  insurance: Shield,
  bank_charges: Landmark,
  other: Receipt,
};

export function CategoryGlyph({ category, className }: { category: string; className?: string }) {
  const Icon = CATEGORY_ICON[category] ?? Receipt;
  return (
    <Icon aria-hidden="true" className={cn('h-4 w-4 shrink-0', className)} strokeWidth={1.9} />
  );
}

function CategoryPill({ category }: { category: string }) {
  const c = EXPENSE_CATEGORIES[category];
  return (
    <span className="bg-bg text-ink inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold">
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: c?.color ?? '#C9C4B8' }}
      />
      <span className="truncate">{c?.label ?? category}</span>
    </span>
  );
}

type Panel = { kind: 'edit' | 'approve' | 'reject' | 'pay' | 'cancel'; row: ExpenseRow };

function useReceipt() {
  const { toast } = useToast();
  return async (path: string) => {
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    const r = await receiptLink(path);
    if (!r.ok || !r.url) {
      tab?.close();
      toast({ tone: 'danger', title: 'Could not open the receipt', description: r.message });
      return;
    }
    if (tab) tab.location.href = r.url;
    else window.location.assign(r.url);
  };
}

/* ───────────────────────────────────────────────────────────── the list */

export function ExpensesTable({
  rows,
  me,
  isSuperAdmin,
  canWrite,
  vendors,
  locations,
  title,
  compact = false,
  approvals = false,
}: {
  rows: ExpenseRow[];
  me: string;
  isSuperAdmin: boolean;
  canWrite: boolean;
  vendors: Choice[];
  locations: Choice[];
  title: string;
  compact?: boolean;
  /** The Approvals view: a Review button and no status filter. */
  approvals?: boolean;
}) {
  const [q, setQ] = React.useState('');
  const [category, setCategory] = React.useState('all');
  const [status, setStatus] = React.useState('all');
  const [panel, setPanel] = React.useState<Panel | null>(null);
  const openReceipt = useReceipt();
  const term = q.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      (category === 'all' || r.category === category) &&
      (status === 'all' || r.status === status) &&
      (!term ||
        `${r.number} ${r.description} ${r.payee} ${r.payment_reference ?? ''} ${r.vendor?.name ?? ''}`
          .toLowerCase()
          .includes(term)),
  );
  const filtered = term !== '' || category !== 'all' || status !== 'all';
  const { shown: page, more } = useShowMore(shown, compact ? 6 : 25);
  const mayDecide = (r: ExpenseRow) =>
    canWrite && r.status === 'submitted' && (r.submitted_by !== me || isSuperAdmin);

  const actions = (r: ExpenseRow) => [
    canWrite &&
      ['submitted', 'rejected'].includes(r.status) && {
        label: 'Edit',
        icon: <Pencil />,
        opensOverlay: true,
        onSelect: () => setPanel({ kind: 'edit', row: r }),
      },
    mayDecide(r) && {
      label: 'Approve',
      icon: <CheckCircle2 />,
      separated: true,
      opensOverlay: true,
      onSelect: () => setPanel({ kind: 'approve', row: r }),
    },
    mayDecide(r) && {
      label: 'Turn down',
      icon: <XCircle />,
      opensOverlay: true,
      onSelect: () => setPanel({ kind: 'reject', row: r }),
    },
    canWrite &&
      r.status === 'approved' && {
        label: 'Mark paid',
        icon: <Wallet />,
        separated: true,
        opensOverlay: true,
        onSelect: () => setPanel({ kind: 'pay', row: r }),
      },
    r.receipt_path && {
      label: 'Open receipt',
      icon: <Paperclip />,
      onSelect: () => openReceipt(r.receipt_path!),
    },
    canWrite &&
      !['paid', 'cancelled'].includes(r.status) && {
        label: 'Cancel expense',
        icon: <Ban />,
        tone: 'danger' as const,
        separated: true,
        opensOverlay: true,
        onSelect: () => setPanel({ kind: 'cancel', row: r }),
      },
  ];

  const columns: ColumnDef<ExpenseRow, unknown>[] = [
    {
      id: 'date',
      accessorFn: (r) => r.spent_on,
      header: 'Date',
      cell: ({ row: { original: r } }) => (
        <span className="whitespace-nowrap tabular-nums">{day(r.spent_on)}</span>
      ),
    },
    {
      id: 'description',
      accessorFn: (r) => r.description,
      header: 'Description',
      cell: ({ row: { original: r } }) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="bg-gold-soft text-gold-text flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
            <CategoryGlyph category={r.category} />
          </span>
          <span className="min-w-0">
            <span className="block max-w-[16rem] truncate font-semibold">{r.description}</span>
            <span className="text-muted-light block truncate text-xs">
              {r.number} · {r.payee}
            </span>
          </span>
        </span>
      ),
    },
    {
      id: 'category',
      accessorFn: (r) => EXPENSE_CATEGORIES[r.category]?.label ?? r.category,
      header: 'Category',
      cell: ({ row: { original: r } }) => <CategoryPill category={r.category} />,
    },
    {
      id: 'amount',
      accessorFn: (r) => r.amount_cents,
      header: 'Amount (KES)',
      cell: ({ row: { original: r } }) => (
        <span className="font-semibold tabular-nums">{shillings(r.amount_cents)}</span>
      ),
    },
    {
      id: 'status',
      accessorFn: (r) => r.status,
      header: 'Status',
      cell: ({ row: { original: r } }) => (
        <span className="flex flex-col items-start gap-1">
          <Pill tone={EXPENSE_STATUS[r.status]?.tone ?? 'grey'} dot>
            {EXPENSE_STATUS[r.status]?.label ?? r.status}
          </Pill>
          {r.status === 'paid' && r.payment_method && (
            <span className="text-muted-light text-xs">
              {PAYMENT_METHODS[r.payment_method]}
              {r.payment_reference ? ` · ${r.payment_reference}` : ''}
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'by',
      accessorFn: (r) => r.submitter?.display_name ?? '',
      header: 'Recorded by',
      cell: ({ row: { original: r } }) => (
        <Person name={r.submitter?.display_name ?? r.submitter?.email ?? null} />
      ),
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      cell: ({ row: { original: r } }) => (
        <span className="flex items-center justify-end gap-1">
          {approvals && mayDecide(r) ? (
            <Button size="sm" variant="black" onClick={() => setPanel({ kind: 'approve', row: r })}>
              Review
            </Button>
          ) : (
            canWrite &&
            ['submitted', 'rejected'].includes(r.status) && (
              <IconAction
                label={`Edit ${r.number}`}
                onClick={() => setPanel({ kind: 'edit', row: r })}
              >
                <Pencil />
              </IconAction>
            )
          )}
          <ActionMenu label={`Actions for ${r.number}`} actions={actions(r)} />
        </span>
      ),
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[1.125rem] font-extrabold tracking-[-0.01em]">{title}</h2>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Search expenses, payees, references…"
            label="Search expenses"
            className="w-full sm:w-64"
          />
          <FilterSelect
            label="Category"
            value={category}
            onChange={setCategory}
            className="flex-1 sm:flex-none"
            options={[
              { value: 'all', label: 'All categories' },
              ...Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => ({ value: k, label: v.label })),
            ]}
          />
          {!approvals && (
            <FilterSelect
              label="Status"
              value={status}
              onChange={setStatus}
              className="flex-1 sm:flex-none"
              options={[
                { value: 'all', label: 'All statuses' },
                ...Object.entries(EXPENSE_STATUS).map(([k, v]) => ({ value: k, label: v.label })),
              ]}
            />
          )}
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-5 w-5" />}
          title={
            filtered
              ? 'Nothing matches'
              : approvals
                ? 'Nothing waiting for approval'
                : 'No office expenses here'
          }
          description={
            filtered
              ? 'Try another search, category or status.'
              : approvals
                ? 'Expenses recorded by a colleague wait here for you to approve or turn down.'
                : 'Record rent, utilities, salaries and other office spending with Add expense. A second person approves each one before it is paid.'
          }
          {...(filtered
            ? {
                action: {
                  label: 'Clear filters',
                  onClick: () => {
                    setQ('');
                    setCategory('all');
                    setStatus('all');
                  },
                },
              }
            : {})}
        />
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable caption={title} columns={columns} data={page} />
          </div>
          <ul className="divide-border border-border divide-y overflow-hidden rounded-2xl border md:hidden">
            {page.map((r) => (
              <li key={r.id} className="flex items-center gap-3 bg-white px-3 py-3">
                <span className="bg-gold-soft text-gold-text flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                  <CategoryGlyph category={r.category} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{r.description}</span>
                  <span className="text-muted-light block truncate text-xs">
                    {day(r.spent_on)} · {EXPENSE_CATEGORIES[r.category]?.label}
                  </span>
                  <span className="mt-1 flex items-center gap-2">
                    <span className="whitespace-nowrap text-sm font-extrabold tabular-nums">
                      {kes(r.amount_cents)}
                    </span>
                    <Pill tone={EXPENSE_STATUS[r.status]?.tone ?? 'grey'} dot>
                      {EXPENSE_STATUS[r.status]?.label}
                    </Pill>
                  </span>
                </span>
                <ActionMenu label={`Actions for ${r.number}`} actions={actions(r)} />
              </li>
            ))}
          </ul>
          {more}
        </>
      )}

      {panel?.kind === 'edit' && (
        <ExpensePanel
          expense={panel.row}
          vendors={vendors}
          locations={locations}
          onClose={() => setPanel(null)}
        />
      )}
      {panel && (panel.kind === 'approve' || panel.kind === 'reject') && (
        <DecidePanel
          expense={panel.row}
          approve={panel.kind === 'approve'}
          self={panel.row.submitted_by === me}
          onClose={() => setPanel(null)}
        />
      )}
      {panel?.kind === 'pay' && <PayPanel expense={panel.row} onClose={() => setPanel(null)} />}
      {panel?.kind === 'cancel' && (
        <CancelPanel expense={panel.row} onClose={() => setPanel(null)} />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── recording */

export function AddExpense({ vendors, locations }: { vendors: Choice[]; locations: Choice[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(params.get('new') === '1');
  const close = () => {
    setOpen(false);
    if (params.get('new')) {
      const next = new URLSearchParams(params.toString());
      next.delete('new');
      router.replace(next.toString() ? `${pathname}?${next}` : pathname);
    }
  };
  return (
    <>
      <Button
        variant="gold"
        leadingIcon={<Plus className="h-4 w-4" />}
        onClick={() => setOpen(true)}
      >
        Add expense
      </Button>
      {open && (
        <ExpensePanel expense={null} vendors={vendors} locations={locations} onClose={close} />
      )}
    </>
  );
}

function ExpensePanel({
  expense,
  vendors,
  locations,
  onClose,
}: {
  expense: ExpenseRow | null;
  vendors: Choice[];
  locations: Choice[];
  onClose: () => void;
}) {
  const [f, setF] = React.useState({
    spentOn: expense?.spent_on ?? todayInNairobi(),
    description: expense?.description ?? '',
    category: expense?.category ?? 'rent_utilities',
    amount: fromCents(expense?.amount_cents),
    payee: expense?.payee ?? '',
    vendorId: expense?.vendor_id ?? '',
    locationId: expense?.location_id ?? '',
    notes: expense?.notes ?? '',
  });
  const [receiptPath, setReceiptPath] = React.useState<string | null>(null);
  const [receiptName, setReceiptName] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const { run, busy } = useRunner();
  const { toast } = useToast();

  const upload = async (file: File) => {
    if (
      !['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(
        file.type,
      )
    ) {
      toast({ tone: 'warning', title: 'Use a PDF or a photo of the receipt' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ tone: 'warning', title: 'Keep the receipt under 10 MB' });
      return;
    }
    setUploading(true);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const ext = file.name.includes('.')
      ? file.name.split('.').pop()!.toLowerCase().slice(0, 5)
      : 'pdf';
    const path = `${session?.user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from('office-receipts')
      .upload(path, file, { contentType: file.type });
    setUploading(false);
    if (error) {
      toast({ tone: 'danger', title: 'Receipt not uploaded', description: error.message });
      return;
    }
    setReceiptPath(path);
    setReceiptName(file.name);
  };

  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={expense ? `Edit ${expense.number}` : 'Add expense'}
      subtitle="A colleague with full Finance access approves it before it is paid."
      submitLabel={expense ? 'Save and send for approval' : 'Record for approval'}
      busy={busy || uploading}
      width="lg"
      onSubmit={async () => {
        const cents = toCents(f.amount);
        if (!cents || Number.isNaN(cents)) {
          toast({ tone: 'warning', title: 'Enter the amount in shillings' });
          return false;
        }
        return run(() =>
          saveExpense({
            id: expense?.id,
            spentOn: f.spentOn,
            description: f.description,
            category: f.category,
            amountCents: cents,
            payee: f.payee,
            vendorId: f.vendorId || null,
            locationId: f.locationId || null,
            notes: f.notes,
            receiptPath,
          }),
        );
      }}
    >
      {expense?.status === 'rejected' && expense.decision_note && (
        <p className="bg-danger-bg text-danger rounded-xl px-4 py-3 text-sm font-semibold">
          Turned down: “{expense.decision_note}”. Fix it and save to send it back for approval.
        </p>
      )}
      <TextField
        label="What it was for"
        required
        value={f.description}
        onChange={(e) => set('description', e.target.value)}
        maxLength={200}
        placeholder="Office rent – Nairobi HQ, November"
      />
      <FieldRow>
        <SelectField
          label="Category"
          required
          value={f.category}
          onChange={(e) => set('category', e.target.value)}
          options={Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => ({
            value: k,
            label: v.label,
          }))}
        />
        <TextField
          label="Amount (KES)"
          required
          inputMode="decimal"
          value={f.amount}
          onChange={(e) => set('amount', e.target.value)}
          placeholder="1,000,000"
        />
      </FieldRow>
      <FieldRow>
        <TextField
          label="Spent on"
          required
          type="date"
          max={todayInNairobi()}
          value={f.spentOn}
          onChange={(e) => set('spentOn', e.target.value)}
        />
        <TextField
          label="Paid to"
          required
          value={f.payee}
          onChange={(e) => set('payee', e.target.value)}
          maxLength={120}
          placeholder="Landlord, utility, supplier"
        />
      </FieldRow>
      <FieldRow>
        <SelectField
          label="Supplier on file"
          value={f.vendorId}
          onChange={(e) => set('vendorId', e.target.value)}
          placeholder="Not a listed vendor"
          options={vendors.map((v) => ({ value: v.id, label: v.name }))}
          hint="From Company → Vendors & suppliers."
        />
        <SelectField
          label="Office"
          value={f.locationId}
          onChange={(e) => set('locationId', e.target.value)}
          placeholder="Not tied to an office"
          options={locations.map((l) => ({ value: l.id, label: l.name }))}
        />
      </FieldRow>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          loading={uploading}
          leadingIcon={<Paperclip className="h-4 w-4" />}
          onClick={() => input.current?.click()}
        >
          {receiptName || expense?.receipt_path ? 'Replace receipt' : 'Attach receipt'}
        </Button>
        <span className="text-muted-light text-xs">
          {receiptName ??
            (expense?.receipt_path ? 'A receipt is on file' : 'PDF or photo, up to 10 MB')}
        </span>
        <input
          ref={input}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = '';
          }}
        />
      </div>
      <TextArea
        label="Notes"
        value={f.notes}
        onChange={(e) => set('notes', e.target.value)}
        maxLength={1000}
        placeholder="Invoice number, period it covers, anything the approver should know"
      />
    </FormPanel>
  );
}

/* ──────────────────────────────────────────── decide, pay and cancel */

function DecidePanel({
  expense: e,
  approve,
  self,
  onClose,
}: {
  expense: ExpenseRow;
  approve: boolean;
  self: boolean;
  onClose: () => void;
}) {
  const [note, setNote] = React.useState('');
  const { run, busy } = useRunner();
  const openReceipt = useReceipt();
  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={approve ? `Approve ${kes(e.amount_cents)}` : 'Turn down expense'}
      subtitle={`${e.number} · ${e.description}`}
      submitLabel={approve ? 'Approve' : 'Turn down'}
      danger={!approve}
      busy={busy}
      onSubmit={() => run(() => decideExpense(e.id, approve, note))}
    >
      {self && approve && (
        <p className="bg-danger-bg text-danger rounded-xl px-4 py-3 text-sm font-semibold">
          You recorded this expense. As a super admin you can approve it, and the audit log marks it
          for review.
        </p>
      )}
      <dl className="divide-border border-border divide-y rounded-2xl border text-sm">
        {(
          [
            ['Paid to', e.payee],
            ['Category', EXPENSE_CATEGORIES[e.category]?.label ?? e.category],
            ['Spent on', day(e.spent_on)],
            ['Recorded by', e.submitter?.display_name ?? e.submitter?.email ?? '—'],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-4 py-2.5">
            <dt className="text-muted font-semibold">{k}</dt>
            <dd className="text-right font-bold">{v}</dd>
          </div>
        ))}
      </dl>
      {e.notes && <p className="bg-bg rounded-xl px-4 py-3 text-sm">{e.notes}</p>}
      {e.receipt_path ? (
        <Button
          variant="outline"
          size="sm"
          leadingIcon={<FileText className="h-4 w-4" />}
          onClick={() => openReceipt(e.receipt_path!)}
        >
          Open the receipt
        </Button>
      ) : (
        <p className="text-muted-light text-xs">No receipt attached.</p>
      )}
      <TextArea
        label={approve ? 'Note' : 'Why it is turned down'}
        required={!approve}
        value={note}
        onChange={(ev) => setNote(ev.target.value)}
        maxLength={1000}
        placeholder={approve ? 'Optional' : 'So it can be fixed and sent again'}
      />
    </FormPanel>
  );
}

function PayPanel({ expense: e, onClose }: { expense: ExpenseRow; onClose: () => void }) {
  const [method, setMethod] = React.useState('bank_transfer');
  const [reference, setReference] = React.useState('');
  const [paidOn, setPaidOn] = React.useState(todayInNairobi());
  const { run, busy } = useRunner();
  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title="Mark paid"
      subtitle={`${e.number} · ${kes(e.amount_cents)} to ${e.payee}`}
      submitLabel="Mark paid"
      busy={busy}
      onSubmit={() => run(() => payExpense({ id: e.id, method, reference, paidOn }))}
    >
      <p className="bg-bg rounded-xl px-4 py-3 text-sm">
        Paid expenses are final and show in Transactions as office expenses.
      </p>
      <FieldRow>
        <SelectField
          label="Paid by"
          value={method}
          onChange={(ev) => setMethod(ev.target.value)}
          options={Object.entries(PAYMENT_METHODS).map(([k, v]) => ({ value: k, label: v }))}
        />
        <TextField
          label="Paid on"
          type="date"
          max={todayInNairobi()}
          value={paidOn}
          onChange={(ev) => setPaidOn(ev.target.value)}
        />
      </FieldRow>
      <TextField
        label={
          method === 'mpesa'
            ? 'M-Pesa code'
            : method === 'bank_transfer'
              ? 'Bank reference'
              : 'Reference'
        }
        required={method === 'mpesa' || method === 'bank_transfer'}
        value={reference}
        onChange={(ev) => setReference(ev.target.value.toUpperCase())}
        maxLength={80}
        placeholder={method === 'mpesa' ? 'SKL4X2ABCD' : 'FT26318XYZ'}
      />
    </FormPanel>
  );
}

function CancelPanel({ expense: e, onClose }: { expense: ExpenseRow; onClose: () => void }) {
  const [reason, setReason] = React.useState('');
  const { run, busy } = useRunner();
  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title="Cancel expense"
      subtitle={`${e.number} · ${e.description}`}
      submitLabel="Cancel expense"
      danger
      busy={busy}
      onSubmit={() => run(() => cancelExpense(e.id, reason))}
    >
      <p className="bg-bg rounded-xl px-4 py-3 text-sm">
        It stays in the register as cancelled, with your reason.
      </p>
      <TextArea
        label="Why"
        required
        value={reason}
        onChange={(ev) => setReason(ev.target.value)}
        maxLength={500}
      />
    </FormPanel>
  );
}

/* ─────────────────────────────────────────────────────────────── budgets */

export interface BudgetRow {
  month: string;
  category: string;
  amount_cents: number;
}

export function BudgetsEditor({
  month,
  months,
  budgets,
  spend,
  canWrite,
}: {
  month: string;
  months: { value: string; label: string }[];
  budgets: BudgetRow[];
  /** Spend this month per category, in cents. */
  spend: Record<string, number>;
  canWrite: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = React.useMemo(
    () =>
      Object.fromEntries(
        budgets
          .filter((b) => b.month.slice(0, 7) === month.slice(0, 7))
          .map((b) => [b.category, b.amount_cents]),
      ),
    [budgets, month],
  );
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  React.useEffect(() => setDraft({}), [month]);
  const { run, busy } = useRunner();
  const { toast } = useToast();
  const totalBudget = Object.values(current).reduce((s, v) => s + v, 0);
  const totalSpend = Object.values(spend).reduce((s, v) => s + v, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[1.125rem] font-extrabold tracking-[-0.01em]">
          Budgets
          <span className="text-muted-light ml-2 text-xs font-semibold">
            {kes(totalSpend)} spent of {totalBudget ? kes(totalBudget) : 'no budget set'}
          </span>
        </h2>
        <FilterSelect
          label="Month"
          value={month}
          onChange={(m) => {
            const next = new URLSearchParams(params.toString());
            next.set('month', m);
            router.push(`${pathname}?${next}`);
          }}
          options={months}
        />
      </div>
      <ul className="divide-border border-border divide-y rounded-2xl border">
        {Object.entries(EXPENSE_CATEGORIES).map(([key, c]) => {
          const budget = current[key] ?? 0;
          const spent = spend[key] ?? 0;
          const pct = budget > 0 ? (spent / budget) * 100 : null;
          const value = draft[key] ?? (budget ? fromCents(budget) : '');
          const dirty = draft[key] != null && toCents(draft[key]!) !== (budget || null);
          return (
            <li
              key={key}
              className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-center"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="bg-gold-soft text-gold-text flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                  <CategoryGlyph category={key} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{c.label}</span>
                  <span
                    className={cn(
                      'block text-xs font-semibold',
                      pct != null && pct > 100 ? 'text-danger' : 'text-muted-light',
                    )}
                  >
                    {kes(spent)} spent
                    {pct != null && ` · ${Math.round(pct)}%`}
                    {pct != null && pct > 100 && ` · over by ${kes(spent - budget)}`}
                  </span>
                </span>
              </span>
              <Progress
                value={pct}
                label={`${c.label} spent against budget`}
                tone={pct != null && pct > 100 ? 'danger' : 'gold'}
              />
              <span className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`budget-${key}`}>
                  {c.label} budget in shillings
                </label>
                <input
                  id={`budget-${key}`}
                  inputMode="decimal"
                  disabled={!canWrite}
                  value={value}
                  placeholder="No budget"
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  className="border-border-strong bg-surface focus:ring-gold h-10 w-36 rounded-lg border px-3 text-right text-sm tabular-nums focus:outline-none focus:ring-2 disabled:opacity-60"
                />
                {canWrite && (
                  <Button
                    size="sm"
                    variant={dirty ? 'black' : 'outline'}
                    disabled={!dirty || busy}
                    onClick={async () => {
                      const cents = toCents(draft[key] ?? '') ?? 0;
                      if (Number.isNaN(cents)) {
                        toast({ tone: 'warning', title: 'Enter the budget in shillings' });
                        return;
                      }
                      if (await run(() => setBudget(month, key, cents))) {
                        setDraft((d) => {
                          const next = { ...d };
                          delete next[key];
                          return next;
                        });
                      }
                    }}
                  >
                    Save
                  </Button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

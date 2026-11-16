'use client';

import { Button, cn, DataTable, DetailPanel, EmptyState, type ColumnDef, useToast } from '@nexg/ui';
import {
  Ban,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileCheck2,
  PackageCheck,
  Pencil,
  Plus,
  Send,
  ShoppingCart,
  Trash2,
  XCircle,
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import {
  cancelOrder,
  cancelPurchase,
  decidePurchase,
  issueOrder,
  receiveOrder,
  savePurchase,
  submitPurchase,
} from '@/app/company/actions';
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
import type { Option } from '@/components/company/inventory';
import { Person, Pill } from '@/components/portal/kit';
import {
  day,
  dateTime,
  DEPARTMENTS,
  kes,
  ORDER_STATUS,
  PRIORITY,
  quantity,
  REQUEST_STATUS,
  shillings,
  todayInNairobi,
} from '@/lib/company';

export interface LineRow {
  id: string;
  item_id: string | null;
  description: string;
  quantity: number;
  unit_cost_cents: number;
  received_quantity: number;
  sort: number;
}

export interface OrderLite {
  id: string;
  number: string;
  status: string;
  total_cents: number;
  expected_on: string | null;
  issued_at: string;
  received_at: string | null;
  cancel_reason: string | null;
}

export interface RequestRow {
  id: string;
  number: string;
  title: string;
  justification: string | null;
  department: string;
  priority: string;
  needed_by: string | null;
  vendor_id: string | null;
  location_id: string | null;
  status: string;
  total_cents: number;
  requested_by: string | null;
  submitted_at: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
  vendor: { name: string } | null;
  location: { name: string } | null;
  requester: { display_name: string | null; email: string } | null;
  decider: { display_name: string | null } | null;
  lines: LineRow[];
  orders: OrderLite[];
}

export interface OrderRow {
  id: string;
  number: string;
  request_id: string;
  status: string;
  total_cents: number;
  expected_on: string | null;
  notes: string | null;
  issued_at: string;
  received_at: string | null;
  cancel_reason: string | null;
  vendor: { name: string } | null;
  location: { name: string } | null;
  request: { number: string; title: string; department: string } | null;
}

export interface ItemOption {
  id: string;
  name: string;
  unit: string;
  unit_cost_cents: number;
}

type Panel =
  | { kind: 'view' | 'edit' | 'approve' | 'reject' | 'cancel' | 'issue'; row: RequestRow }
  | { kind: 'receive' | 'cancel_order'; order: OrderRow; request: RequestRow | null };

const liveOrder = (r: RequestRow) => r.orders.find((o) => o.status !== 'cancelled') ?? null;
const requesterName = (r: RequestRow) => r.requester?.display_name ?? r.requester?.email ?? null;

/* ────────────────────────────────────────────────────────── requests */

export function RequestsTable({
  rows,
  orders,
  me,
  canWrite,
  canApprove,
  isSuperAdmin,
  items,
  vendors,
  locations,
  title,
  compact = false,
  showStatusFilter = true,
}: {
  rows: RequestRow[];
  orders: OrderRow[];
  me: string;
  canWrite: boolean;
  canApprove: boolean;
  isSuperAdmin: boolean;
  items: ItemOption[];
  vendors: Option[];
  locations: Option[];
  title: string;
  compact?: boolean;
  showStatusFilter?: boolean;
}) {
  const [q, setQ] = React.useState('');
  const [status, setStatus] = React.useState('all');
  const [dept, setDept] = React.useState('all');
  const [panel, setPanel] = React.useState<Panel | null>(null);
  const { run } = useRunner();
  const term = q.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      (status === 'all' || r.status === status) &&
      (dept === 'all' || r.department === dept) &&
      (!term ||
        `${r.number} ${r.title} ${r.vendor?.name ?? ''} ${requesterName(r) ?? ''} ${r.lines.map((l) => l.description).join(' ')}`
          .toLowerCase()
          .includes(term)),
  );
  const filtered = term !== '' || status !== 'all' || dept !== 'all';
  const { shown: page, more } = useShowMore(shown, compact ? 6 : 25);

  const mine = (r: RequestRow) => r.requested_by === me;
  const mayEdit = (r: RequestRow) => canWrite && (mine(r) || canApprove);
  const mayDecide = (r: RequestRow) => canApprove && (!mine(r) || isSuperAdmin);

  const actions = (r: RequestRow) => {
    const order = liveOrder(r);
    return [
      {
        label: 'Details',
        icon: <Eye />,
        opensOverlay: true,
        onSelect: () => setPanel({ kind: 'view', row: r }),
      },
      mayEdit(r) &&
        ['draft', 'rejected'].includes(r.status) && {
          label: 'Edit',
          icon: <Pencil />,
          opensOverlay: true,
          onSelect: () => setPanel({ kind: 'edit', row: r }),
        },
      mayEdit(r) &&
        r.status === 'draft' && {
          label: 'Send for approval',
          icon: <Send />,
          onSelect: () => run(() => submitPurchase(r.id)),
        },
      mayDecide(r) &&
        r.status === 'submitted' && {
          label: 'Approve',
          icon: <CheckCircle2 />,
          separated: true,
          opensOverlay: true,
          onSelect: () => setPanel({ kind: 'approve', row: r }),
        },
      mayDecide(r) &&
        r.status === 'submitted' && {
          label: 'Turn down',
          icon: <XCircle />,
          opensOverlay: true,
          onSelect: () => setPanel({ kind: 'reject', row: r }),
        },
      canApprove &&
        r.status === 'approved' && {
          label: 'Raise purchase order',
          icon: <FileCheck2 />,
          separated: true,
          opensOverlay: true,
          onSelect: () => setPanel({ kind: 'issue', row: r }),
        },
      canWrite &&
        order &&
        ['issued', 'partially_received'].includes(order.status) && {
          label: 'Receive delivery',
          icon: <PackageCheck />,
          separated: true,
          opensOverlay: true,
          onSelect: () => {
            const o = orders.find((x) => x.id === order.id);
            if (o) setPanel({ kind: 'receive', order: o, request: r });
          },
        },
      mayEdit(r) &&
        ['draft', 'submitted', 'approved', 'rejected'].includes(r.status) && {
          label: 'Cancel request',
          icon: <Ban />,
          tone: 'danger' as const,
          separated: true,
          opensOverlay: true,
          onSelect: () => setPanel({ kind: 'cancel', row: r }),
        },
    ];
  };

  const columns: ColumnDef<RequestRow, unknown>[] = [
    {
      id: 'title',
      accessorFn: (r) => r.title,
      header: 'Request',
      cell: ({ row: { original: r } }) => (
        <span className="min-w-0">
          <button
            type="button"
            onClick={() => setPanel({ kind: 'view', row: r })}
            className="hover:text-gold-text block max-w-[18rem] truncate text-left font-semibold underline-offset-4 hover:underline"
          >
            {r.title}
          </button>
          <span className="text-muted-light block text-xs">
            {r.number} · {r.lines.length} {r.lines.length === 1 ? 'line' : 'lines'}
          </span>
        </span>
      ),
    },
    {
      id: 'department',
      accessorFn: (r) => DEPARTMENTS[r.department] ?? r.department,
      header: 'Department',
      cell: ({ row: { original: r } }) => <span>{DEPARTMENTS[r.department] ?? r.department}</span>,
    },
    {
      id: 'requester',
      accessorFn: (r) => requesterName(r) ?? '',
      header: 'Requested by',
      cell: ({ row: { original: r } }) => (
        <Person name={requesterName(r)} sub={day(r.created_at)} />
      ),
    },
    {
      id: 'total',
      accessorFn: (r) => r.total_cents,
      header: 'Amount (KES)',
      cell: ({ row: { original: r } }) => (
        <span className="font-semibold tabular-nums">{shillings(r.total_cents)}</span>
      ),
    },
    {
      id: 'needed',
      accessorFn: (r) => r.needed_by ?? '9999',
      header: 'Needed by',
      cell: ({ row: { original: r } }) => (
        <span className="whitespace-nowrap tabular-nums">
          {r.needed_by ? day(r.needed_by) : '—'}
        </span>
      ),
    },
    {
      id: 'priority',
      accessorFn: (r) => ['low', 'normal', 'high', 'urgent'].indexOf(r.priority),
      header: 'Priority',
      cell: ({ row: { original: r } }) => (
        <Pill tone={PRIORITY[r.priority]?.tone ?? 'grey'}>
          {PRIORITY[r.priority]?.label ?? r.priority}
        </Pill>
      ),
    },
    {
      id: 'status',
      accessorFn: (r) => r.status,
      header: 'Status',
      cell: ({ row: { original: r } }) => (
        <span className="flex flex-col items-start gap-1">
          <Pill tone={REQUEST_STATUS[r.status]?.tone ?? 'grey'} dot>
            {REQUEST_STATUS[r.status]?.label ?? r.status}
          </Pill>
          {liveOrder(r) && <span className="text-muted-light text-xs">{liveOrder(r)!.number}</span>}
        </span>
      ),
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      cell: ({ row: { original: r } }) => (
        <span className="flex items-center justify-end gap-1">
          {mayDecide(r) && r.status === 'submitted' ? (
            <Button size="sm" variant="black" onClick={() => setPanel({ kind: 'approve', row: r })}>
              Review
            </Button>
          ) : (
            <IconAction
              label={`Details of ${r.number}`}
              onClick={() => setPanel({ kind: 'view', row: r })}
            >
              <Eye />
            </IconAction>
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
            placeholder="Search requests…"
            label="Search purchase requests"
            className="w-full sm:w-60"
          />
          {showStatusFilter && (
            <FilterSelect
              label="Status"
              value={status}
              onChange={setStatus}
              className="flex-1 sm:flex-none"
              options={[
                { value: 'all', label: 'All statuses' },
                ...Object.entries(REQUEST_STATUS).map(([k, v]) => ({ value: k, label: v.label })),
              ]}
            />
          )}
          <FilterSelect
            label="Department"
            value={dept}
            onChange={setDept}
            className="flex-1 sm:flex-none"
            options={[
              { value: 'all', label: 'All departments' },
              ...Object.entries(DEPARTMENTS).map(([k, v]) => ({ value: k, label: v })),
            ]}
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-5 w-5" />}
          title={filtered ? 'Nothing matches' : 'No purchase requests'}
          description={
            filtered
              ? 'Try another search, status or department.'
              : 'Ask for something to be bought with New request. Someone else approves it, then a purchase order goes to the vendor.'
          }
          {...(filtered
            ? {
                action: {
                  label: 'Clear filters',
                  onClick: () => {
                    setQ('');
                    setStatus('all');
                    setDept('all');
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
                <button
                  type="button"
                  onClick={() => setPanel({ kind: 'view', row: r })}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm font-bold">{r.title}</span>
                  <span className="text-muted-light block truncate text-xs">
                    {r.number} · {requesterName(r) ?? '—'} · {kes(r.total_cents)}
                  </span>
                  <span className="mt-1 flex gap-1.5">
                    <Pill tone={REQUEST_STATUS[r.status]?.tone ?? 'grey'} dot>
                      {REQUEST_STATUS[r.status]?.label}
                    </Pill>
                  </span>
                </button>
                <ActionMenu label={`Actions for ${r.number}`} actions={actions(r)} />
              </li>
            ))}
          </ul>
          {more}
        </>
      )}

      {panel?.kind === 'view' && (
        <RequestDetail
          request={panel.row}
          canDecide={mayDecide(panel.row)}
          onDecide={(approve) => setPanel({ kind: approve ? 'approve' : 'reject', row: panel.row })}
          onClose={() => setPanel(null)}
        />
      )}
      {panel?.kind === 'edit' && (
        <PurchasePanel
          request={panel.row}
          items={items}
          vendors={vendors}
          locations={locations}
          onClose={() => setPanel(null)}
        />
      )}
      {panel && (panel.kind === 'approve' || panel.kind === 'reject') && (
        <DecidePanel
          request={panel.row}
          approve={panel.kind === 'approve'}
          self={mine(panel.row)}
          onClose={() => setPanel(null)}
        />
      )}
      {panel?.kind === 'cancel' && (
        <ReasonPanel
          title="Cancel request"
          subtitle={`${panel.row.number} · ${panel.row.title}`}
          button="Cancel request"
          required={panel.row.status !== 'draft'}
          onClose={() => setPanel(null)}
          onSubmit={(reason) => run(() => cancelPurchase(panel.row.id, reason))}
        />
      )}
      {panel?.kind === 'issue' && (
        <IssuePanel
          request={panel.row}
          vendors={vendors}
          locations={locations}
          onClose={() => setPanel(null)}
        />
      )}
      {panel?.kind === 'receive' && (
        <ReceivePanel order={panel.order} request={panel.request} onClose={() => setPanel(null)} />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── orders */

export function OrdersTable({
  rows,
  requests,
  canWrite,
  canApprove,
  title,
}: {
  rows: OrderRow[];
  requests: RequestRow[];
  canWrite: boolean;
  canApprove: boolean;
  title: string;
}) {
  const [q, setQ] = React.useState('');
  const [status, setStatus] = React.useState('open');
  const [panel, setPanel] = React.useState<Panel | null>(null);
  const { run } = useRunner();
  const term = q.trim().toLowerCase();
  const shown = rows.filter(
    (o) =>
      (status === 'all' ||
        (status === 'open'
          ? ['issued', 'partially_received'].includes(o.status)
          : o.status === status)) &&
      (!term ||
        `${o.number} ${o.request?.title ?? ''} ${o.vendor?.name ?? ''}`
          .toLowerCase()
          .includes(term)),
  );
  const { shown: page, more } = useShowMore(shown, 25);
  const requestOf = (o: OrderRow) => requests.find((r) => r.id === o.request_id) ?? null;

  const progress = (o: OrderRow) => {
    const lines = requestOf(o)?.lines ?? [];
    const want = lines.reduce((s, l) => s + Number(l.quantity), 0);
    const got = lines.reduce((s, l) => s + Number(l.received_quantity), 0);
    return want > 0 ? Math.round((got / want) * 100) : 0;
  };

  const columns: ColumnDef<OrderRow, unknown>[] = [
    {
      id: 'number',
      accessorFn: (o) => o.number,
      header: 'Order',
      cell: ({ row: { original: o } }) => (
        <span>
          <span className="block font-semibold">{o.number}</span>
          <span className="text-muted-light block max-w-[16rem] truncate text-xs">
            {o.request?.title}
          </span>
        </span>
      ),
    },
    {
      id: 'vendor',
      accessorFn: (o) => o.vendor?.name ?? '',
      header: 'Vendor',
      cell: ({ row: { original: o } }) => <span className="font-medium">{o.vendor?.name}</span>,
    },
    {
      id: 'to',
      accessorFn: (o) => o.location?.name ?? '',
      header: 'Deliver to',
      cell: ({ row: { original: o } }) => <span>{o.location?.name}</span>,
    },
    {
      id: 'total',
      accessorFn: (o) => o.total_cents,
      header: 'Amount (KES)',
      cell: ({ row: { original: o } }) => (
        <span className="font-semibold tabular-nums">{shillings(o.total_cents)}</span>
      ),
    },
    {
      id: 'issued',
      accessorFn: (o) => o.issued_at,
      header: 'Raised',
      cell: ({ row: { original: o } }) => (
        <span className="whitespace-nowrap tabular-nums">{day(o.issued_at)}</span>
      ),
    },
    {
      id: 'expected',
      accessorFn: (o) => o.expected_on ?? '9999',
      header: 'Expected',
      cell: ({ row: { original: o } }) => (
        <span className="whitespace-nowrap tabular-nums">
          {o.expected_on ? day(o.expected_on) : '—'}
        </span>
      ),
    },
    {
      id: 'status',
      accessorFn: (o) => o.status,
      header: 'Status',
      cell: ({ row: { original: o } }) => (
        <span className="flex flex-col items-start gap-1.5">
          <Pill tone={ORDER_STATUS[o.status]?.tone ?? 'grey'} dot>
            {ORDER_STATUS[o.status]?.label ?? o.status}
          </Pill>
          {o.status === 'partially_received' && (
            <span className="bg-border/70 h-1.5 w-20 overflow-hidden rounded-full">
              <span className="bg-gold block h-full" style={{ width: `${progress(o)}%` }} />
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      cell: ({ row: { original: o } }) => (
        <span className="flex items-center justify-end gap-1">
          {canWrite && ['issued', 'partially_received'].includes(o.status) && (
            <Button
              size="sm"
              variant="gold"
              leadingIcon={<PackageCheck className="h-4 w-4" />}
              onClick={() => setPanel({ kind: 'receive', order: o, request: requestOf(o) })}
            >
              Receive
            </Button>
          )}
          <ActionMenu
            label={`Actions for ${o.number}`}
            actions={[
              requestOf(o) && {
                label: 'Request details',
                icon: <Eye />,
                opensOverlay: true,
                onSelect: () => setPanel({ kind: 'view', row: requestOf(o)! }),
              },
              canApprove &&
                o.status === 'issued' && {
                  label: 'Cancel order',
                  icon: <Ban />,
                  tone: 'danger' as const,
                  separated: true,
                  opensOverlay: true,
                  onSelect: () =>
                    setPanel({ kind: 'cancel_order', order: o, request: requestOf(o) }),
                },
            ]}
          />
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
            placeholder="Search orders…"
            label="Search purchase orders"
            className="w-full sm:w-60"
          />
          <FilterSelect
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'open', label: 'Open orders' },
              { value: 'all', label: 'All orders' },
              ...Object.entries(ORDER_STATUS).map(([k, v]) => ({ value: k, label: v.label })),
            ]}
          />
        </div>
      </div>
      {shown.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart className="h-5 w-5" />}
          title={rows.length ? 'Nothing matches' : 'No purchase orders yet'}
          description={
            rows.length
              ? 'Try another search or status.'
              : 'An approved request becomes a purchase order with Raise purchase order.'
          }
        />
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable caption={title} columns={columns} data={page} />
          </div>
          <ul className="divide-border border-border divide-y overflow-hidden rounded-2xl border md:hidden">
            {page.map((o) => (
              <li key={o.id} className="flex items-center gap-3 bg-white px-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">
                    {o.number} · {o.vendor?.name}
                  </span>
                  <span className="text-muted-light block truncate text-xs">
                    {o.request?.title} · {kes(o.total_cents)}
                  </span>
                  <span className="mt-1 flex">
                    <Pill tone={ORDER_STATUS[o.status]?.tone ?? 'grey'} dot>
                      {ORDER_STATUS[o.status]?.label}
                    </Pill>
                  </span>
                </span>
                {canWrite && ['issued', 'partially_received'].includes(o.status) && (
                  <Button
                    size="sm"
                    variant="gold"
                    onClick={() => setPanel({ kind: 'receive', order: o, request: requestOf(o) })}
                  >
                    Receive
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {more}
        </>
      )}

      {panel?.kind === 'receive' && (
        <ReceivePanel order={panel.order} request={panel.request} onClose={() => setPanel(null)} />
      )}
      {panel?.kind === 'cancel_order' && (
        <ReasonPanel
          title="Cancel purchase order"
          subtitle={`${panel.order.number} · ${panel.order.vendor?.name ?? ''}`}
          button="Cancel order"
          required
          hint="Nothing has arrived on it. The request goes back to approved, ready for another order."
          onClose={() => setPanel(null)}
          onSubmit={(reason) => run(() => cancelOrder(panel.order.id, reason))}
        />
      )}
      {panel?.kind === 'view' && (
        <RequestDetail
          request={panel.row}
          canDecide={false}
          onDecide={() => undefined}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────── the request */

function RequestDetail({
  request: r,
  canDecide,
  onDecide,
  onClose,
}: {
  request: RequestRow;
  canDecide: boolean;
  onDecide: (approve: boolean) => void;
  onClose: () => void;
}) {
  const order = liveOrder(r);
  const steps: { label: string; at: string | null; note?: string | null; done: boolean }[] = [
    { label: `Asked by ${requesterName(r) ?? 'someone'}`, at: r.created_at, done: true },
    { label: 'Sent for approval', at: r.submitted_at, done: Boolean(r.submitted_at) },
    {
      label:
        r.status === 'rejected'
          ? `Turned down by ${r.decider?.display_name ?? 'someone'}`
          : r.decided_at
            ? `Approved by ${r.decider?.display_name ?? 'someone'}`
            : 'Waiting for a decision',
      at: r.decided_at,
      note: r.decision_note,
      done: Boolean(r.decided_at),
    },
    {
      label: order ? `Ordered: ${order.number}` : 'Purchase order',
      at: order?.issued_at ?? null,
      done: Boolean(order),
    },
    { label: 'Received', at: order?.received_at ?? null, done: r.status === 'received' },
  ];

  return (
    <DetailPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={r.title}
      subtitle={`${r.number} · ${DEPARTMENTS[r.department] ?? r.department}`}
      meta={
        <>
          <Pill tone={REQUEST_STATUS[r.status]?.tone ?? 'grey'} dot>
            {REQUEST_STATUS[r.status]?.label}
          </Pill>
          <Pill tone={PRIORITY[r.priority]?.tone ?? 'grey'}>
            {PRIORITY[r.priority]?.label} priority
          </Pill>
        </>
      }
      width="lg"
      footer={
        canDecide && r.status === 'submitted' ? (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onDecide(false)}>
              Turn down
            </Button>
            <Button variant="black" onClick={() => onDecide(true)}>
              Approve {kes(r.total_cents)}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {r.justification && (
          <p className="bg-bg rounded-xl px-4 py-3 text-sm leading-relaxed">{r.justification}</p>
        )}
        <div className="border-border overflow-hidden rounded-2xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-bg text-muted text-xs font-bold">
              <tr>
                <th className="px-3 py-2">Line</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {[...r.lines]
                .sort((a, b) => a.sort - b.sort)
                .map((l) => (
                  <tr key={l.id}>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold">{l.description}</span>
                      {Number(l.received_quantity) > 0 && (
                        <span className="text-success block text-xs font-semibold">
                          {quantity(l.received_quantity)} received
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{quantity(l.quantity)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {shillings(l.unit_cost_cents)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                      {shillings(Number(l.quantity) * l.unit_cost_cents)}
                    </td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr className="border-border border-t">
                <td colSpan={3} className="px-3 py-2.5 text-right font-bold">
                  Total
                </td>
                <td className="px-3 py-2.5 text-right font-extrabold tabular-nums">
                  {kes(r.total_cents)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted text-xs font-bold">Vendor</dt>
            <dd className="font-semibold">{r.vendor?.name ?? 'Not chosen yet'}</dd>
          </div>
          <div>
            <dt className="text-muted text-xs font-bold">Deliver to</dt>
            <dd className="font-semibold">{r.location?.name ?? 'Not chosen yet'}</dd>
          </div>
          <div>
            <dt className="text-muted text-xs font-bold">Needed by</dt>
            <dd className="font-semibold">{r.needed_by ? day(r.needed_by) : 'No date'}</dd>
          </div>
          {order?.expected_on && (
            <div>
              <dt className="text-muted text-xs font-bold">Expected</dt>
              <dd className="font-semibold">{day(order.expected_on)}</dd>
            </div>
          )}
        </dl>
        <ol className="border-border space-y-4 border-l-2 pl-5">
          {steps.map((s) => (
            <li key={s.label} className="relative">
              <span
                aria-hidden="true"
                className={cn(
                  'absolute -left-[1.6rem] top-1 h-3 w-3 rounded-full ring-4 ring-white',
                  s.done ? 'bg-gold' : 'bg-border-strong',
                )}
              />
              <p className={cn('text-sm font-bold', !s.done && 'text-muted-light')}>{s.label}</p>
              {s.at && <p className="text-muted-light text-xs tabular-nums">{dateTime(s.at)}</p>}
              {s.note && <p className="text-muted mt-1 text-sm">“{s.note}”</p>}
            </li>
          ))}
        </ol>
      </div>
    </DetailPanel>
  );
}

/* ─────────────────────────────────────────────────────── a new request */

interface DraftLine {
  key: string;
  itemId: string;
  description: string;
  quantity: string;
  price: string;
}

let lineKey = 0;
const blankLine = (): DraftLine => ({
  key: `l${++lineKey}`,
  itemId: '',
  description: '',
  quantity: '1',
  price: '',
});

export function NewPurchase({
  items,
  vendors,
  locations,
}: {
  items: ItemOption[];
  vendors: Option[];
  locations: Option[];
}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(params.get('new') === '1');

  /* From Reorder & alerts: ?new=1&item=…&qty=…&location=… prefills a line. */
  const prefill = React.useMemo(() => {
    const item = items.find((i) => i.id === params.get('item'));
    if (!item) return null;
    return {
      title: `Restock ${item.name}`,
      location: params.get('location') ?? '',
      line: {
        ...blankLine(),
        itemId: item.id,
        description: item.name,
        quantity: params.get('qty') ?? '1',
        price: fromCents(item.unit_cost_cents),
      },
    };
  }, [items, params]);

  const close = () => {
    setOpen(false);
    if (params.get('new')) {
      const next = new URLSearchParams(params.toString());
      ['new', 'item', 'qty', 'location'].forEach((k) => next.delete(k));
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
        New request
      </Button>
      {open && (
        <PurchasePanel
          request={null}
          prefill={prefill}
          items={items}
          vendors={vendors}
          locations={locations}
          onClose={close}
        />
      )}
    </>
  );
}

function PurchasePanel({
  request,
  prefill,
  items,
  vendors,
  locations,
  onClose,
}: {
  request: RequestRow | null;
  prefill?: { title: string; location: string; line: DraftLine } | null;
  items: ItemOption[];
  vendors: Option[];
  locations: Option[];
  onClose: () => void;
}) {
  const [title, setTitle] = React.useState(request?.title ?? prefill?.title ?? '');
  const [justification, setJustification] = React.useState(request?.justification ?? '');
  const [department, setDepartment] = React.useState(request?.department ?? 'operations');
  const [priority, setPriority] = React.useState(request?.priority ?? 'normal');
  const [neededBy, setNeededBy] = React.useState(request?.needed_by ?? '');
  const [vendorId, setVendorId] = React.useState(request?.vendor_id ?? '');
  const [locationId, setLocationId] = React.useState(
    request?.location_id ?? prefill?.location ?? '',
  );
  const [lines, setLines] = React.useState<DraftLine[]>(
    request
      ? [...request.lines]
          .sort((a, b) => a.sort - b.sort)
          .map((l) => ({
            key: `l${++lineKey}`,
            itemId: l.item_id ?? '',
            description: l.description,
            quantity: String(Number(l.quantity)),
            price: fromCents(l.unit_cost_cents),
          }))
      : [prefill?.line ?? blankLine()],
  );
  const { run, busy } = useRunner();
  const { toast } = useToast();

  const total = lines.reduce(
    (s, l) => s + (Number(l.quantity) || 0) * (Number(l.price.replace(/,/g, '')) || 0),
    0,
  );
  const setLine = (key: string, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const save = async (submit: boolean): Promise<boolean> => {
    const parsed = lines
      .filter((l) => l.description.trim() || l.itemId)
      .map((l) => ({
        itemId: l.itemId || null,
        description: l.description.trim(),
        quantity: Number(l.quantity),
        unitCostCents: toCents(l.price) ?? NaN,
      }));
    if (parsed.length === 0) {
      toast({ tone: 'warning', title: 'Add at least one line' });
      return false;
    }
    if (parsed.some((l) => !(l.quantity > 0) || Number.isNaN(l.unitCostCents))) {
      toast({ tone: 'warning', title: 'Every line needs a quantity and a price' });
      return false;
    }
    return run(() =>
      savePurchase({
        id: request?.id,
        title,
        justification,
        department,
        priority,
        neededBy: neededBy || null,
        vendorId: vendorId || null,
        locationId: locationId || null,
        lines: parsed,
        submit,
      }),
    );
  };

  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={request ? `Edit ${request.number}` : 'New purchase request'}
      subtitle="Someone with full Company access approves it before anything is ordered."
      submitLabel="Send for approval"
      busy={busy}
      width="lg"
      secondary={{ label: 'Save as draft', onSubmit: () => save(false) }}
      onSubmit={() => save(true)}
    >
      <TextField
        label="What is being bought"
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
        placeholder="Helmets for the new Westlands riders"
      />
      <FieldRow>
        <SelectField
          label="Department"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          options={Object.entries(DEPARTMENTS).map(([k, v]) => ({ value: k, label: v }))}
        />
        <SelectField
          label="Priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          options={Object.entries(PRIORITY).map(([k, v]) => ({ value: k, label: v.label }))}
        />
      </FieldRow>
      <FieldRow>
        <SelectField
          label="Suggested vendor"
          value={vendorId}
          onChange={(e) => setVendorId(e.target.value)}
          placeholder="Let the approver choose"
          options={vendors.map((v) => ({ value: v.id, label: v.name }))}
        />
        <SelectField
          label="Deliver to"
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          placeholder="Choose later"
          options={locations.map((l) => ({ value: l.id, label: l.name }))}
        />
      </FieldRow>
      <TextField
        label="Needed by"
        type="date"
        min={todayInNairobi()}
        value={neededBy}
        onChange={(e) => setNeededBy(e.target.value)}
      />

      <fieldset className="space-y-3">
        <legend className="text-sm font-bold">Lines</legend>
        {lines.map((l, i) => (
          <div key={l.key} className="border-border space-y-3 rounded-xl border p-3">
            <div className="flex items-center justify-between">
              <span className="text-muted text-xs font-bold">Line {i + 1}</span>
              {lines.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remove line ${i + 1}`}
                  onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                  className="text-muted-light hover:text-danger rounded p-1"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <SelectField
              label="Inventory item"
              value={l.itemId}
              onChange={(e) => {
                const item = items.find((x) => x.id === e.target.value);
                setLine(l.key, {
                  itemId: e.target.value,
                  ...(item
                    ? { description: item.name, price: l.price || fromCents(item.unit_cost_cents) }
                    : {}),
                });
              }}
              placeholder="Not a stocked item"
              hint={l.itemId ? 'Goes into stock when it arrives.' : undefined}
              options={items.map((x) => ({ value: x.id, label: x.name }))}
            />
            <TextField
              label="Description"
              required
              value={l.description}
              onChange={(e) => setLine(l.key, { description: e.target.value })}
              maxLength={200}
            />
            <FieldRow>
              <TextField
                label="Quantity"
                required
                type="number"
                min={0.01}
                step="any"
                value={l.quantity}
                onChange={(e) => setLine(l.key, { quantity: e.target.value })}
              />
              <TextField
                label="Unit price (KES)"
                required
                inputMode="decimal"
                value={l.price}
                onChange={(e) => setLine(l.key, { price: e.target.value })}
              />
            </FieldRow>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          leadingIcon={<Plus className="h-4 w-4" />}
          onClick={() => setLines((ls) => [...ls, blankLine()])}
        >
          Add line
        </Button>
      </fieldset>
      <p className="bg-ink flex items-center justify-between rounded-xl px-4 py-3 text-sm text-white">
        <span className="font-semibold text-white/70">Total</span>
        <span className="text-gold text-lg font-extrabold tabular-nums">
          KES {Math.round(total).toLocaleString('en-KE')}
        </span>
      </p>
      <TextArea
        label="Why it is needed"
        value={justification}
        onChange={(e) => setJustification(e.target.value)}
        maxLength={2000}
        placeholder="What it is for, and what happens without it"
      />
    </FormPanel>
  );
}

/* ─────────────────────────────────────────────────── decide, order, receive */

function DecidePanel({
  request: r,
  approve,
  self,
  onClose,
}: {
  request: RequestRow;
  approve: boolean;
  self: boolean;
  onClose: () => void;
}) {
  const [note, setNote] = React.useState('');
  const { run, busy } = useRunner();
  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={approve ? `Approve ${kes(r.total_cents)}` : 'Turn down request'}
      subtitle={`${r.number} · ${r.title} · asked by ${requesterName(r) ?? 'someone'}`}
      submitLabel={approve ? 'Approve' : 'Turn down'}
      danger={!approve}
      busy={busy}
      onSubmit={() => run(() => decidePurchase(r.id, approve, note))}
    >
      {self && approve && (
        <p className="bg-danger-bg text-danger rounded-xl px-4 py-3 text-sm font-semibold">
          This is your own request. As a super admin you can approve it, and the audit log marks it
          for review.
        </p>
      )}
      <ul className="border-border divide-border divide-y rounded-xl border text-sm">
        {r.lines.map((l) => (
          <li key={l.id} className="flex justify-between gap-3 px-3 py-2">
            <span>
              {l.description} <span className="text-muted-light">× {quantity(l.quantity)}</span>
            </span>
            <span className="font-semibold tabular-nums">
              {shillings(Number(l.quantity) * l.unit_cost_cents)}
            </span>
          </li>
        ))}
      </ul>
      {r.justification && <p className="bg-bg rounded-xl px-4 py-3 text-sm">{r.justification}</p>}
      <TextArea
        label={approve ? 'Note for whoever asked' : 'Why it is turned down'}
        required={!approve}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={1000}
        placeholder={approve ? 'Optional' : 'So they can fix it and send it again'}
      />
    </FormPanel>
  );
}

function IssuePanel({
  request: r,
  vendors,
  locations,
  onClose,
}: {
  request: RequestRow;
  vendors: Option[];
  locations: Option[];
  onClose: () => void;
}) {
  const [vendorId, setVendorId] = React.useState(r.vendor_id ?? '');
  const [locationId, setLocationId] = React.useState(r.location_id ?? '');
  const [expected, setExpected] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const { run, busy } = useRunner();
  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title="Raise purchase order"
      subtitle={`${r.number} · ${r.title} · ${kes(r.total_cents)}`}
      submitLabel="Raise order"
      busy={busy}
      onSubmit={() =>
        run(() =>
          issueOrder({
            requestId: r.id,
            vendorId: vendorId || null,
            locationId: locationId || null,
            expectedOn: expected || null,
            notes,
          }),
        )
      }
    >
      <SelectField
        label="Vendor"
        required
        value={vendorId}
        onChange={(e) => setVendorId(e.target.value)}
        placeholder="Choose an active vendor"
        options={vendors.map((v) => ({ value: v.id, label: v.name }))}
      />
      <SelectField
        label="Deliver to"
        required
        value={locationId}
        onChange={(e) => setLocationId(e.target.value)}
        placeholder="Choose a location"
        options={locations.map((l) => ({ value: l.id, label: l.name }))}
      />
      <TextField
        label="Expected delivery"
        type="date"
        min={todayInNairobi()}
        value={expected}
        onChange={(e) => setExpected(e.target.value)}
      />
      <TextArea
        label="Notes for the order"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        maxLength={1000}
      />
    </FormPanel>
  );
}

function ReceivePanel({
  order,
  request,
  onClose,
}: {
  order: OrderRow;
  request: RequestRow | null;
  onClose: () => void;
}) {
  const lines = [...(request?.lines ?? [])].sort((a, b) => a.sort - b.sort);
  const [qty, setQty] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(
      lines.map((l) => [
        l.id,
        String(Math.max(0, Number(l.quantity) - Number(l.received_quantity))),
      ]),
    ),
  );
  const [note, setNote] = React.useState('');
  const { run, busy } = useRunner();
  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title="Receive delivery"
      subtitle={`${order.number} · ${order.vendor?.name ?? ''} · into ${order.location?.name ?? ''}`}
      submitLabel="Record delivery"
      busy={busy}
      width="lg"
      onSubmit={() =>
        run(() =>
          receiveOrder(
            order.id,
            lines
              .map((l) => ({ lineId: l.id, quantity: Number(qty[l.id] || 0) }))
              .filter((l) => l.quantity > 0),
            note,
          ),
        )
      }
    >
      <p className="bg-bg rounded-xl px-4 py-3 text-sm">
        Enter what actually arrived. Lines tied to an inventory item go straight into stock at{' '}
        {order.location?.name}.
      </p>
      <ul className="space-y-3">
        {lines.map((l) => {
          const left = Number(l.quantity) - Number(l.received_quantity);
          return (
            <li
              key={l.id}
              className="border-border flex flex-wrap items-end justify-between gap-3 rounded-xl border p-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{l.description}</span>
                <span className="text-muted-light block text-xs">
                  {quantity(l.received_quantity)} of {quantity(l.quantity)} received
                  {l.item_id ? ' · goes into stock' : ''}
                </span>
              </span>
              <TextField
                label="Arrived now"
                type="number"
                min={0}
                max={left}
                step="any"
                disabled={left <= 0}
                value={qty[l.id] ?? ''}
                onChange={(e) => setQty((q) => ({ ...q, [l.id]: e.target.value }))}
                className="w-32"
              />
            </li>
          );
        })}
      </ul>
      <TextArea
        label="Delivery note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={400}
        placeholder="Delivery note number, anything missing or damaged"
      />
    </FormPanel>
  );
}

function ReasonPanel({
  title,
  subtitle,
  button,
  required,
  hint,
  onClose,
  onSubmit,
}: {
  title: string;
  subtitle: string;
  button: string;
  required: boolean;
  hint?: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<boolean>;
}) {
  const [reason, setReason] = React.useState('');
  const { busy } = useRunner();
  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      subtitle={subtitle}
      submitLabel={button}
      danger
      busy={busy}
      onSubmit={() => onSubmit(reason)}
    >
      {hint && <p className="bg-bg rounded-xl px-4 py-3 text-sm">{hint}</p>}
      <TextArea
        label="Why"
        required={required}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={500}
      />
    </FormPanel>
  );
}

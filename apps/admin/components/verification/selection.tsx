'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  useToast,
} from '@nexg/ui';
import { BellRing, ChevronDown, CirclePlus, Download } from 'lucide-react';
import * as React from 'react';

import { remindMissingDocuments } from '@/app/merchants/verification/actions';

/*
 * The queue's check boxes and the Bulk Actions menu in the header. The
 * selection lives in the page (one provider around the header and the
 * table), and only ever holds merchants on the page being looked at.
 */

export interface ExportRow {
  id: string;
  reference: string;
  name: string;
  category: string;
  area: string;
  submitted: string;
  status: string;
  phone: string;
  email: string;
}

interface SelectionValue {
  selected: Set<string>;
  toggle: (id: string, on: boolean) => void;
  setMany: (ids: string[], on: boolean) => void;
}

const Selection = React.createContext<SelectionValue | null>(null);

function useSelection() {
  const value = React.useContext(Selection);
  if (!value) throw new Error('Selection controls must sit inside SelectionProvider.');
  return value;
}

export function SelectionProvider({
  pageKey,
  children,
}: {
  /** Changes when the page of rows changes, which clears the selection. */
  pageKey: string;
  children: React.ReactNode;
}) {
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  React.useEffect(() => setSelected(new Set()), [pageKey]);
  const value = React.useMemo<SelectionValue>(
    () => ({
      selected,
      toggle: (id, on) =>
        setSelected((prev) => {
          const next = new Set(prev);
          if (on) next.add(id);
          else next.delete(id);
          return next;
        }),
      setMany: (ids, on) =>
        setSelected((prev) => {
          const next = new Set(prev);
          for (const id of ids) {
            if (on) next.add(id);
            else next.delete(id);
          }
          return next;
        }),
    }),
    [selected],
  );
  return <Selection.Provider value={value}>{children}</Selection.Provider>;
}

const box =
  'h-[1.125rem] w-[1.125rem] cursor-pointer rounded border-border-strong accent-[#E5A800] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A800]';

export function RowCheck({ id, label }: { id: string; label: string }) {
  const { selected, toggle } = useSelection();
  return (
    <input
      type="checkbox"
      className={box}
      aria-label={label}
      checked={selected.has(id)}
      onChange={(e) => toggle(id, e.target.checked)}
    />
  );
}

export function AllCheck({ ids }: { ids: string[] }) {
  const { selected, setMany } = useSelection();
  const ref = React.useRef<HTMLInputElement>(null);
  const on = ids.length > 0 && ids.every((id) => selected.has(id));
  const some = !on && ids.some((id) => selected.has(id));
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = some;
  }, [some]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className={box}
      aria-label="Select every merchant on this page"
      checked={on}
      disabled={ids.length === 0}
      onChange={(e) => setMany(ids, e.target.checked)}
    />
  );
}

function csvCell(value: string): string {
  // Quote everything and neutralise spreadsheet formulas.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function BulkActions({ rows }: { rows: ExportRow[] }) {
  const { selected } = useSelection();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const chosen = rows.filter((r) => selected.has(r.id));

  async function remind() {
    if (chosen.length === 0) {
      toast({
        title: 'Choose merchants first',
        description: 'Tick the merchants to remind in the queue.',
        tone: 'info',
      });
      return;
    }
    setBusy(true);
    try {
      const result = await remindMissingDocuments(chosen.map((r) => r.id));
      toast({
        title: result.ok ? 'Reminders' : 'No reminders sent',
        description: result.message,
        tone: result.ok ? 'success' : 'danger',
      });
    } finally {
      setBusy(false);
    }
  }

  function download() {
    const list = chosen.length > 0 ? chosen : rows;
    const head = [
      'Application ID',
      'Merchant',
      'Category',
      'Area',
      'Submitted',
      'Status',
      'Phone',
      'Email',
    ];
    const lines = [
      head,
      ...list.map((r) => [
        r.reference,
        r.name,
        r.category,
        r.area,
        r.submitted,
        r.status,
        r.phone,
        r.email,
      ]),
    ]
      .map((line) => line.map(csvCell).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${lines}\r\n`], { type: 'text/csv;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `merchant-verification-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={busy}
          className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-b from-[#FFD24D] to-[#F5B400] px-4 text-[0.9375rem] font-bold text-[#1A1A1A] shadow-[0_8px_18px_-10px_rgba(229,168,0,0.9)] transition-colors hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFE07A] disabled:opacity-60"
        >
          <CirclePlus aria-hidden="true" className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.9} />
          Bulk Actions
          {chosen.length > 0 && (
            <span className="rounded-full bg-[#1A1A1A] px-2 py-0.5 text-[0.75rem] font-bold tabular-nums text-[#FFD24D]">
              {chosen.length}
            </span>
          )}
          <ChevronDown aria-hidden="true" className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72">
        <DropdownMenuLabel>
          {chosen.length > 0
            ? `${chosen.length} merchant${chosen.length === 1 ? '' : 's'} chosen`
            : 'Tick merchants in the queue to act on them'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          icon={<BellRing />}
          onSelect={() => void remind()}
          disabled={busy || chosen.length === 0}
        >
          Remind about missing documents
        </DropdownMenuItem>
        <DropdownMenuItem icon={<Download />} onSelect={download}>
          {chosen.length > 0 ? 'Download chosen as CSV' : 'Download this page as CSV'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

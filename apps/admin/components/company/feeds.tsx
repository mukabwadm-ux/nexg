import { cn } from '@nexg/ui';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ClipboardCheck,
  Hand,
  PackageCheck,
  RotateCcw,
  Tag,
  Undo2,
  Wrench,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

import { dateTime, kes, quantity } from '@/lib/company';

/** One line of company_activity_v: a stock movement or an asset event. */
export interface ActivityRow {
  source: 'stock' | 'asset';
  id: string;
  kind: string;
  item_id: string | null;
  asset_id: string | null;
  subject: string;
  quantity: number | null;
  unit: string | null;
  from_location: string | null;
  to_location: string | null;
  reason: string | null;
  detail: string | null;
  cost_cents: number | null;
  actor: string | null;
  at: string;
}

const LOOK: Record<string, { label: string; icon: LucideIcon; tone: string }> = {
  'stock:in': { label: 'Stock in', icon: ArrowDown, tone: 'bg-success-bg text-success' },
  'stock:out': { label: 'Stock out', icon: ArrowUp, tone: 'bg-danger-bg text-danger' },
  'stock:transfer': {
    label: 'Transfer',
    icon: ArrowLeftRight,
    tone: 'bg-[#FFF1C7] text-[#B07C00]',
  },
  'stock:adjust': { label: 'Stock count', icon: ClipboardCheck, tone: 'bg-info-bg text-info' },
  'asset:registered': { label: 'Registered', icon: Tag, tone: 'bg-[#FFF1C7] text-[#B07C00]' },
  'asset:updated': { label: 'Details changed', icon: Tag, tone: 'bg-[#F1EFEA] text-muted' },
  'asset:assigned': { label: 'Handed over', icon: Hand, tone: 'bg-info-bg text-info' },
  'asset:returned': { label: 'Handed back', icon: Undo2, tone: 'bg-success-bg text-success' },
  'asset:moved': { label: 'Moved', icon: ArrowLeftRight, tone: 'bg-[#FFF1C7] text-[#B07C00]' },
  'asset:maintenance_scheduled': {
    label: 'Service scheduled',
    icon: Wrench,
    tone: 'bg-[#FFF1C7] text-[#B07C00]',
  },
  'asset:maintenance_started': {
    label: 'Maintenance',
    icon: Wrench,
    tone: 'bg-[#FDF0E4] text-[#C2570C]',
  },
  'asset:maintenance_done': {
    label: 'Maintenance done',
    icon: PackageCheck,
    tone: 'bg-success-bg text-success',
  },
  'asset:retired': { label: 'Retired', icon: XCircle, tone: 'bg-[#F1EFEA] text-muted' },
  'asset:lost': { label: 'Reported lost', icon: XCircle, tone: 'bg-danger-bg text-danger' },
  'asset:restored': { label: 'Back in use', icon: RotateCcw, tone: 'bg-success-bg text-success' },
};

/** What happened, in one line, the way the Recent stock movements list writes it. */
export function describe(row: ActivityRow): { title: string; line: string } {
  const look = LOOK[`${row.source}:${row.kind}`];
  const title = look?.label ?? row.kind;
  if (row.source === 'stock') {
    const qty = quantity(row.quantity, row.unit);
    const where =
      row.kind === 'transfer'
        ? `${row.from_location ?? '?'} → ${row.to_location ?? '?'}`
        : (row.to_location ?? row.from_location);
    const sign = row.kind === 'adjust' ? (row.to_location ? '+' : '−') : '';
    return {
      title,
      line: `${row.subject} – ${sign}${qty}${row.unit === 'pcs' || !row.unit ? (Number(row.quantity) === 1 ? ' unit' : ' units') : ''}${
        where ? ` (${where})` : ''
      }`,
    };
  }
  const extra = [
    row.detail,
    row.cost_cents != null && row.kind === 'maintenance_done' ? kes(row.cost_cents) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return { title, line: extra ? `${row.subject} – ${extra}` : row.subject };
}

export function ActivityFeed({ rows, empty }: { rows: ActivityRow[]; empty: string }) {
  if (rows.length === 0) {
    return <p className="text-muted-light py-6 text-center text-sm">{empty}</p>;
  }
  return (
    <ol className="divide-border divide-y">
      {rows.map((row) => {
        const look = LOOK[`${row.source}:${row.kind}`] ?? {
          icon: Tag,
          tone: 'bg-[#F1EFEA] text-muted',
        };
        const Icon = look.icon;
        const { title, line } = describe(row);
        return (
          <li
            key={`${row.source}-${row.id}`}
            className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                look.tone,
              )}
            >
              <Icon className="h-[1.05rem] w-[1.05rem]" strokeWidth={2.2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm font-bold">{title}</span>
                <time dateTime={row.at} className="text-muted-light shrink-0 text-xs tabular-nums">
                  {dateTime(row.at)}
                </time>
              </span>
              <span className="text-muted block text-[0.8125rem] leading-snug">{line}</span>
              {row.actor && <span className="text-muted-light block text-xs">by {row.actor}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

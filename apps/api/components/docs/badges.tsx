import { cn, StatusBadge } from '@nexg/ui';

import type { EndpointStatus } from '@/lib/reference/types';

export { MethodBadge } from './method-badge';

const STATUS: Record<EndpointStatus, { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
  live: { label: 'Live', tone: 'success' },
  sandbox: { label: 'Sandbox', tone: 'warning' },
  coming_soon: { label: 'Coming soon', tone: 'neutral' },
};

export function EndpointStatusBadge({
  status,
  className,
}: {
  status: EndpointStatus;
  className?: string;
}) {
  const { label, tone } = STATUS[status];
  return (
    <StatusBadge tone={tone} className={className}>
      {label}
    </StatusBadge>
  );
}

/** Marks a live endpoint that is failing right now, wherever it is listed. */
export function IssueBadge({ title, className }: { title: string; className?: string }) {
  return (
    <StatusBadge tone="danger" className={className} title={title}>
      Known issue
    </StatusBadge>
  );
}

/**
 * A path, set as code, with its `{placeholders}` picked out in gold so the
 * part a caller fills in is the part the eye lands on. The deep gold of the
 * warning token, because the brand gold is too light to read on cream.
 */
export function EndpointPath({ path, className }: { path: string; className?: string }) {
  const parts = path.split(/(\{\w+\})/g).filter(Boolean);
  return (
    <code className={cn('font-mono text-ink [overflow-wrap:anywhere]', className)}>
      {parts.map((part, i) =>
        /^\{\w+\}$/.test(part) ? (
          <span key={i} className="text-warning">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </code>
  );
}

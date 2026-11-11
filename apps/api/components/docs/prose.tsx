import { cn } from '@nexg/ui';
import { AlertTriangle, Clock, Info, Link2, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

/**
 * The reading column's parts. One set of headings, paragraphs, lists,
 * tables and notes for every guide, so a reader learns the page's shape
 * once.
 */

function Anchor({ id }: { id: string }) {
  return (
    <a
      href={`#${id}`}
      aria-label="Link to this section"
      className="text-muted-light hover:text-ink ml-2 inline-flex translate-y-[-0.1em] align-middle opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover:opacity-100"
    >
      <Link2 className="h-4 w-4" aria-hidden="true" />
    </a>
  );
}

export function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="text-ink group mt-14 scroll-mt-24 text-balance text-2xl font-extrabold tracking-tight"
    >
      {children}
      <Anchor id={id} />
    </h2>
  );
}

export function H3({
  id,
  children,
  className,
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3
      id={id}
      className={cn('text-ink group mt-9 scroll-mt-24 text-lg font-bold tracking-tight', className)}
    >
      {children}
      {id ? <Anchor id={id} /> : null}
    </h3>
  );
}

export function P({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('text-muted mt-4 text-base leading-7', className)}>{children}</p>;
}

export function Lead({ children }: { children: React.ReactNode }) {
  return <p className="text-muted mt-4 text-lg leading-8">{children}</p>;
}

export function List({
  children,
  ordered = false,
}: {
  children: React.ReactNode;
  ordered?: boolean;
}) {
  const Tag = ordered ? 'ol' : 'ul';
  return (
    <Tag
      className={cn(
        'text-muted marker:text-muted-light mt-4 space-y-2.5 pl-6 text-base leading-7',
        ordered ? 'list-decimal marker:font-bold' : 'list-disc',
      )}
    >
      {children}
    </Tag>
  );
}

/** Inline code. Long paths and keys may break anywhere on a phone. */
export function C({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-surface text-ink ring-border rounded px-1.5 py-0.5 font-mono text-[0.875em] ring-1 [overflow-wrap:anywhere]">
      {children}
    </code>
  );
}

const linkClass =
  'text-ink decoration-gold hover:decoration-ink font-semibold underline decoration-2 underline-offset-4 transition-colors duration-150';

export function A({ href, children }: { href: string; children: React.ReactNode }) {
  if (href.startsWith('/') || href.startsWith('#')) {
    return (
      <Link href={href} className={linkClass}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={linkClass} rel="noreferrer">
      {children}
    </a>
  );
}

export function Strong({ children }: { children: React.ReactNode }) {
  return <strong className="text-ink font-bold">{children}</strong>;
}

const CALLOUT = {
  note: { icon: Info, box: 'border-border bg-surface', iconClass: 'text-info', label: 'Note' },
  issue: {
    icon: AlertTriangle,
    box: 'border-gold/40 bg-warning-bg',
    iconClass: 'text-warning',
    label: 'Known issue',
  },
  soon: { icon: Clock, box: 'border-info/20 bg-info-bg', iconClass: 'text-info', label: 'Coming soon' },
  safe: {
    icon: ShieldCheck,
    box: 'border-success/20 bg-success-bg',
    iconClass: 'text-success',
    label: 'Security',
  },
} as const;

export function Callout({
  tone = 'note',
  title,
  children,
  className,
}: {
  tone?: keyof typeof CALLOUT;
  /** Defaults to the tone's name: "Known issue", "Coming soon"… */
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { icon: Icon, box, iconClass, label } = CALLOUT[tone];
  return (
    <div className={cn('mt-6 flex gap-3 rounded-lg border p-4', box, className)}>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', iconClass)} aria-hidden="true" />
      <div className="text-ink min-w-0 text-sm leading-6">
        <p className="font-bold">{title ?? label}</p>
        <div className="text-muted mt-1 space-y-2">{children}</div>
      </div>
    </div>
  );
}

/**
 * A plain table in a bordered frame that scrolls sideways on a phone rather
 * than squeezing its columns.
 */
export function Table({
  head,
  rows,
  className,
}: {
  head: string[];
  rows: React.ReactNode[][];
  className?: string;
}) {
  return (
    <div
      className={cn(
        'code-scroll border-border bg-surface mt-6 overflow-x-auto rounded-lg border',
        className,
      )}
    >
      <table className="w-full min-w-[34rem] border-collapse text-left text-sm tabular-nums">
        <thead>
          <tr className="bg-bg">
            {head.map((label) => (
              <th
                key={label}
                scope="col"
                className="text-muted-light px-4 py-2.5 text-xs font-bold uppercase tracking-wide"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-border border-t align-top">
              {row.map((cell, j) => (
                <td key={j} className={cn('px-4 py-3 leading-6', j === 0 ? 'text-ink font-semibold' : 'text-muted')}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Numbered steps, for sequences a reader follows in order. */
export function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="mt-6 space-y-8 [counter-reset:step]">{children}</ol>;
}

export function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="relative pl-12 [counter-increment:step] before:absolute before:left-0 before:top-0 before:flex before:h-8 before:w-8 before:items-center before:justify-center before:rounded-full before:bg-ink before:text-sm before:font-extrabold before:text-gold before:content-[counter(step)]">
      <h3 className="text-ink pt-1 text-lg font-bold tracking-tight">{title}</h3>
      <div className="min-w-0">{children}</div>
    </li>
  );
}

import { cn } from '@nexg/ui';
import { AlertTriangle } from 'lucide-react';

import type { ErrorDoc, FieldDoc, ParamDoc } from '@/lib/reference/types';

/**
 * The lists an endpoint page is made of. Vertical lists rather than wide
 * tables: a parameter's description is a sentence, and a sentence squeezed
 * into a table cell on a phone is a column of single words.
 */

export function ParamList({ params }: { params: ParamDoc[] }) {
  return (
    <ul className="divide-border border-border mt-4 divide-y border-y">
      {params.map((param) => (
        <li key={`${param.in}-${param.name}`} className="py-4">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <code className="text-ink font-mono text-sm font-bold [overflow-wrap:anywhere]">
              {param.name}
            </code>
            <span className="text-muted-light text-xs font-semibold">
              {param.in === 'path' ? 'path' : param.in === 'query' ? 'query' : 'header'} ·{' '}
              {param.type}
            </span>
            <span
              className={cn(
                'text-xs font-bold',
                param.required ? 'text-warning' : 'text-muted-light font-semibold',
              )}
            >
              {param.required ? 'Required' : 'Optional'}
            </span>
          </div>
          <p className="text-muted mt-1.5 text-sm leading-6">{param.description}</p>
          {param.knownIssue ? <IssueNote>{param.knownIssue}</IssueNote> : null}
        </li>
      ))}
    </ul>
  );
}

export function FieldList({ fields }: { fields: FieldDoc[] }) {
  return (
    <ul className="divide-border border-border mt-4 divide-y border-y">
      {fields.map((field) => (
        <li key={field.name} className="py-3.5">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <code className="text-ink font-mono text-sm font-bold [overflow-wrap:anywhere]">
              {field.name}
            </code>
            <span className="text-muted-light text-xs font-semibold">
              {field.type}
              {field.nullable ? ' or null' : ''}
            </span>
          </div>
          <p className="text-muted mt-1 text-sm leading-6">{field.description}</p>
        </li>
      ))}
    </ul>
  );
}

export function ErrorList({ errors }: { errors: ErrorDoc[] }) {
  return (
    <ul className="divide-border border-border mt-4 divide-y border-y">
      {errors.map((error, i) => (
        <li key={`${error.status}-${error.code}-${i}`} className="grid gap-x-4 gap-y-1 py-3.5 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                'font-mono text-sm font-bold tabular-nums',
                error.status >= 500 ? 'text-danger' : error.status === 429 ? 'text-warning' : 'text-ink',
              )}
            >
              {error.status}
            </span>
            {error.code ? (
              <code className="text-muted font-mono text-xs font-semibold [overflow-wrap:anywhere]">
                {error.code}
              </code>
            ) : (
              <span className="text-muted text-xs font-semibold">no JSON body</span>
            )}
          </div>
          <p className="text-muted text-sm leading-6">{error.when}</p>
        </li>
      ))}
    </ul>
  );
}

export function IssueNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="bg-warning-bg text-ink mt-2.5 flex gap-2 rounded-md px-3 py-2 text-xs leading-5">
      <AlertTriangle className="text-warning mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        <span className="font-bold">Known issue. </span>
        {children}
      </span>
    </p>
  );
}

/** A short fact about an endpoint: who may call it, what it costs. */
export function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-border bg-surface rounded-lg border px-3.5 py-3">
      <dt className="text-muted-light text-xs font-bold">{label}</dt>
      <dd className="text-ink mt-1 text-sm font-semibold leading-5">{children}</dd>
    </div>
  );
}

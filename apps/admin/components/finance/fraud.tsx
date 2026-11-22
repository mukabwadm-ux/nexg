'use client';

import { Button, DataTable, DetailPanel, EmptyState, Switch, type ColumnDef } from '@nexg/ui';
import {
  Bike,
  Check,
  CreditCard,
  Eye,
  Hand,
  Play,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  Store,
  User,
  UserCog,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { decideFlag, runChecks, setRule } from '@/app/finance/fraud/actions';
import {
  FilterSelect,
  FormPanel,
  IconAction,
  SearchBox,
  TextArea,
  TextField,
  useRunner,
  useShowMore,
} from '@/components/portal/client-kit';
import { Pill } from '@/components/portal/kit';
import {
  factsOf,
  FLAG_STATUS,
  limitLabel,
  orderedLimits,
  SEVERITY,
  SUBJECT_ORDER,
  SUBJECTS,
  subjectLink,
  type Fact,
  type FraudFlag,
  type FraudRule,
  type Subject,
} from '@/lib/fraud';
import { dateTime, kes } from '@/lib/portal';

const SUBJECT_ICON: Record<Subject, LucideIcon> = {
  payment: CreditCard,
  rider: Bike,
  customer: User,
  staff: UserCog,
  expense: Receipt,
  merchant: Store,
};

function SubjectCell({ flag }: { flag: FraudFlag }) {
  const Icon = SUBJECT_ICON[flag.subject_type] ?? User;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Icon aria-hidden="true" className="text-muted h-4 w-4 shrink-0" strokeWidth={1.9} />
      <span className="min-w-0">
        <span className="block truncate font-semibold">
          {flag.subject_label ?? SUBJECTS[flag.subject_type].label}
        </span>
        <span className="text-muted-light block text-xs font-semibold">
          {SUBJECTS[flag.subject_type].label}
        </span>
      </span>
    </span>
  );
}

function SeverityPill({ flag }: { flag: Pick<FraudFlag, 'severity'> }) {
  const s = SEVERITY[flag.severity];
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

/* ═══════════════════════════════════════════════════════════ the queue */

/**
 * Flags, open ones worst first. Each opens a panel with what was found and,
 * for people who may review it, Confirm and Dismiss.
 */
export function FlagsTable({
  flags,
  mode,
  initialWho = 'all',
}: {
  flags: FraudFlag[];
  mode: 'open' | 'reviewed';
  initialWho?: Subject | 'all';
}) {
  const [q, setQ] = React.useState('');
  const [who, setWho] = React.useState<string>(initialWho);
  const [check, setCheck] = React.useState('all');
  const [openId, setOpenId] = React.useState<string | null>(null);
  const open = flags.find((f) => f.id === openId) ?? null;

  const subjects = SUBJECT_ORDER.filter((s) => flags.some((f) => f.subject_type === s));
  const checks = [...new Map(flags.map((f) => [f.kind, f.rule_label ?? f.kind])).entries()].sort(
    (a, b) => a[1].localeCompare(b[1]),
  );
  const term = q.trim().toLowerCase();
  const shown = flags.filter(
    (f) =>
      (who === 'all' || f.subject_type === who) &&
      (check === 'all' || f.kind === check) &&
      (!term ||
        `${f.summary ?? ''} ${f.subject_label ?? ''} ${f.order_reference ?? ''} ${f.rule_label ?? ''}`
          .toLowerCase()
          .includes(term)),
  );
  const filtered = term !== '' || who !== 'all' || check !== 'all';
  const { shown: page, more } = useShowMore(shown, 25);

  const columns: ColumnDef<FraudFlag, unknown>[] = [
    {
      id: 'found',
      accessorFn: (f) => (mode === 'open' ? f.detected_at : (f.reviewed_at ?? f.detected_at)),
      header: mode === 'open' ? 'Found' : 'Decided',
      cell: ({ row: { original: f } }) => (
        <span className="block whitespace-nowrap tabular-nums">
          <span className="block font-semibold">
            {dateTime(mode === 'open' ? f.detected_at : (f.reviewed_at ?? f.detected_at))}
          </span>
          <span className="mt-0.5 block">
            {mode === 'open' ? (
              <SeverityPill flag={f} />
            ) : (
              <Pill tone={FLAG_STATUS[f.status].tone} dot>
                {FLAG_STATUS[f.status].label}
              </Pill>
            )}
          </span>
        </span>
      ),
    },
    {
      id: 'check',
      accessorFn: (f) => f.rule_label ?? f.kind,
      header: 'Check',
      cell: ({ row: { original: f } }) => (
        <span className="block max-w-[13rem] font-semibold leading-snug">
          {f.rule_label ?? f.kind}
        </span>
      ),
    },
    {
      id: 'about',
      accessorFn: (f) => f.subject_label ?? '',
      header: 'About',
      cell: ({ row: { original: f } }) => (
        <span className="block max-w-[12rem]">
          <SubjectCell flag={f} />
        </span>
      ),
    },
    {
      id: 'summary',
      accessorFn: (f) => f.summary ?? '',
      header: 'What Was Found',
      cell: ({ row: { original: f } }) => (
        <span className="block max-w-[22rem]">
          <span className="line-clamp-2 block" title={f.summary ?? undefined}>
            {f.summary}
          </span>
          {mode === 'reviewed' && f.reviewed_by && (
            <span className="text-muted-light block truncate text-xs font-semibold">
              {FLAG_STATUS[f.status].label} by {f.reviewed_by}
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'amount',
      accessorFn: (f) => f.amount_cents ?? -1,
      header: 'Amount (KES)',
      cell: ({ row: { original: f } }) => (
        <span className="whitespace-nowrap font-semibold tabular-nums">
          {f.amount_cents == null ? '—' : kes(f.amount_cents).replace(/^KES\s*/, '')}
        </span>
      ),
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      cell: ({ row: { original: f } }) => (
        <span className="flex justify-end">
          {mode === 'open' && f.may_review ? (
            <Button size="sm" variant="black" onClick={() => setOpenId(f.id)}>
              Review
            </Button>
          ) : (
            <IconAction
              label={`Details of ${f.rule_label ?? f.kind}`}
              onClick={() => setOpenId(f.id)}
            >
              <Eye />
            </IconAction>
          )}
        </span>
      ),
    },
  ];

  const title = mode === 'open' ? 'Open Flags' : 'Reviewed Flags';

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[1.125rem] font-extrabold tracking-[-0.01em]">
          {title}
          {flags.length > 0 && (
            <span className="text-muted-light ml-2 text-xs font-semibold">
              {shown.length.toLocaleString('en-KE')}
              {filtered ? ` of ${flags.length.toLocaleString('en-KE')}` : ''}
            </span>
          )}
        </h2>
        <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto">
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Search by name, order or what was found…"
            label="Search flags"
            className="w-full sm:w-72"
          />
          {subjects.length > 1 && (
            <FilterSelect
              label="About"
              value={who}
              onChange={setWho}
              className="flex-1 sm:flex-none"
              options={[
                { value: 'all', label: 'Everyone' },
                ...subjects.map((s) => ({ value: s, label: SUBJECTS[s].plural })),
              ]}
            />
          )}
          {checks.length > 1 && (
            <FilterSelect
              label="Check"
              value={check}
              onChange={setCheck}
              className="flex-1 sm:flex-none"
              options={[
                { value: 'all', label: 'Every Check' },
                ...checks.map(([k, label]) => ({ value: k, label })),
              ]}
            />
          )}
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="h-5 w-5" />}
          title={
            filtered
              ? 'Nothing matches'
              : mode === 'open'
                ? 'No open flags'
                : 'Nothing reviewed in this period'
          }
          description={
            filtered
              ? 'Try another search, person or check.'
              : mode === 'open'
                ? 'The checks run every five minutes. Anything they find waits here for a person to confirm or dismiss.'
                : 'Flags confirmed or dismissed in the last 90 days appear here, with who decided and why.'
          }
          {...(filtered
            ? {
                action: {
                  label: 'Clear Filters',
                  onClick: () => {
                    setQ('');
                    setWho('all');
                    setCheck('all');
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
            {page.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(f.id)}
                  className="flex w-full items-start gap-3 bg-white px-3 py-3 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      {mode === 'open' ? (
                        <SeverityPill flag={f} />
                      ) : (
                        <Pill tone={FLAG_STATUS[f.status].tone} dot>
                          {FLAG_STATUS[f.status].label}
                        </Pill>
                      )}
                      <span className="text-muted-light text-xs font-semibold">
                        {dateTime(
                          mode === 'open' ? f.detected_at : (f.reviewed_at ?? f.detected_at),
                        )}
                      </span>
                    </span>
                    <span className="mt-1 block text-sm font-bold">{f.rule_label ?? f.kind}</span>
                    <span className="text-muted block text-xs font-semibold">
                      {f.subject_label ?? SUBJECTS[f.subject_type].label}
                    </span>
                    <span className="mt-1 line-clamp-2 block text-sm">{f.summary}</span>
                  </span>
                  <Eye aria-hidden="true" className="text-muted-light mt-1 h-4 w-4 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
          {more}
        </>
      )}

      <FlagPanel flag={open} onClose={() => setOpenId(null)} />
    </div>
  );
}

function FactValue({ fact }: { fact: Fact }) {
  if (fact.kind === 'money')
    return <span className="font-bold tabular-nums">{kes(fact.cents)}</span>;
  if (fact.kind === 'time') return <span className="tabular-nums">{dateTime(fact.iso)}</span>;
  if (fact.kind === 'list') {
    return (
      <ul className="space-y-1.5">
        {fact.items.map((item, i) => (
          <li key={i} className="bg-bg rounded-lg px-3 py-2">
            <span className="block font-semibold">{item.title}</span>
            {item.sub.length > 0 && (
              <span className="text-muted block text-xs">{item.sub.join(' · ')}</span>
            )}
          </li>
        ))}
      </ul>
    );
  }
  return <span className="break-words">{fact.value}</span>;
}

/** One flag: what the check is, what it found, and the decision. */
function FlagPanel({ flag, onClose }: { flag: FraudFlag | null; onClose: () => void }) {
  const [deciding, setDeciding] = React.useState<null | 'confirm' | 'dismiss'>(null);
  const facts = flag ? factsOf(flag.details, { money: kes, time: dateTime }) : [];
  const link = flag ? subjectLink(flag) : null;

  return (
    <>
      <DetailPanel
        open={flag != null && deciding == null}
        onOpenChange={(o) => !o && onClose()}
        title={flag?.rule_label ?? flag?.kind ?? ''}
        subtitle={
          flag ? `${SUBJECTS[flag.subject_type].label} · ${flag.subject_label ?? '—'}` : undefined
        }
        meta={
          flag ? (
            flag.status === 'open' ? (
              <SeverityPill flag={flag} />
            ) : (
              <Pill tone={FLAG_STATUS[flag.status].tone} dot>
                {FLAG_STATUS[flag.status].label}
              </Pill>
            )
          ) : undefined
        }
        footer={
          flag?.status === 'open' && flag.may_review ? (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                leadingIcon={<X className="h-4 w-4" />}
                onClick={() => setDeciding('dismiss')}
              >
                Dismiss
              </Button>
              <Button
                variant="danger"
                leadingIcon={<Check className="h-4 w-4" />}
                onClick={() => setDeciding('confirm')}
              >
                Confirm
              </Button>
            </div>
          ) : undefined
        }
      >
        {flag && (
          <div className="space-y-5">
            <p className="bg-bg rounded-xl px-4 py-3 text-sm font-semibold">{flag.summary}</p>
            <dl className="divide-border divide-y text-sm">
              {(
                [
                  [
                    'Found',
                    <span key="f" className="tabular-nums">
                      {dateTime(flag.detected_at)}
                    </span>,
                  ],
                  ...(flag.amount_cents != null
                    ? [
                        [
                          'At Stake',
                          <span key="a" className="font-bold">
                            {kes(flag.amount_cents)}
                          </span>,
                        ],
                      ]
                    : []),
                  ...facts.map((f) => [f.label, <FactValue key={f.label} fact={f} />]),
                ] as [string, React.ReactNode][]
              ).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 py-2.5">
                  <dt className="text-muted font-semibold">{k}</dt>
                  <dd className="text-ink min-w-0">{v}</dd>
                </div>
              ))}
            </dl>

            {flag.status !== 'open' && (
              <div className="border-border rounded-2xl border px-4 py-3 text-sm">
                <p className="font-bold">
                  {FLAG_STATUS[flag.status].label}
                  {flag.reviewed_by ? ` by ${flag.reviewed_by}` : ''}
                  {flag.reviewed_at ? `, ${dateTime(flag.reviewed_at)}` : ''}
                </p>
                {flag.review_note && <p className="text-muted mt-1">{flag.review_note}</p>}
              </div>
            )}

            {flag.status === 'open' && !flag.may_review && (
              <p className="bg-warning-bg text-warning rounded-xl px-4 py-3 text-sm font-semibold">
                Someone else has to review this flag: it is about you or an expense you handled, or
                about a rider you do not work.
              </p>
            )}

            {link && (
              <p>
                <Link
                  href={link.href}
                  className="text-ink hover:text-gold-text text-sm font-bold underline underline-offset-4"
                >
                  {link.label}
                </Link>
              </p>
            )}
          </div>
        )}
      </DetailPanel>

      {flag && deciding && (
        <DecidePanel
          flag={flag}
          confirm={deciding === 'confirm'}
          onClose={() => setDeciding(null)}
          onDone={() => {
            setDeciding(null);
            onClose();
          }}
        />
      )}
    </>
  );
}

function DecidePanel({
  flag,
  confirm,
  onClose,
  onDone,
}: {
  flag: FraudFlag;
  confirm: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = React.useState('');
  const { run, busy } = useRunner();
  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={confirm ? 'Confirm This Flag' : 'Dismiss This Flag'}
      subtitle={`${flag.rule_label ?? flag.kind} · ${flag.subject_label ?? ''}`}
      submitLabel={confirm ? 'Confirm' : 'Dismiss'}
      danger={confirm}
      busy={busy}
      onSubmit={async () => {
        const ok = await run(() => decideFlag(flag.id, confirm, note));
        if (ok) onDone();
        return ok;
      }}
    >
      <p className="bg-bg rounded-xl px-4 py-3 text-sm font-semibold">{flag.summary}</p>
      {confirm && flag.subject_type === 'rider' && (
        <p className="bg-danger-bg text-danger rounded-xl px-4 py-3 text-sm font-semibold">
          Confirming gives {flag.subject_label ?? 'this rider'} a level-2 strike for 90 days, and
          they are told.
        </p>
      )}
      {confirm && flag.subject_type !== 'rider' && (
        <p className="text-muted text-sm">
          Confirming records that this happened. Anything to recover or stop is done where the money
          or the person is managed.
        </p>
      )}
      <TextArea
        label={confirm ? 'What You Found' : 'Why It Is Not a Problem'}
        required={!confirm}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={1000}
        placeholder={
          confirm
            ? 'Optional. Kept on the flag and the audit log.'
            : 'Kept on the flag and the audit log'
        }
      />
    </FormPanel>
  );
}

/* ═══════════════════════════════════════════════════════════ the checks */

export function RunChecksButton({ variant = 'gold' }: { variant?: 'gold' | 'outline' }) {
  const { run, busy } = useRunner();
  return (
    <Button
      variant={variant}
      loading={busy}
      leadingIcon={<Play className="h-4 w-4" />}
      onClick={() => run(() => runChecks())}
    >
      Run Checks Now
    </Button>
  );
}

function limitsText(rule: FraudRule): string {
  return orderedLimits(rule.params)
    .map(([k, v]) => {
      const l = limitLabel(k);
      return `${l.label} ${v.toLocaleString('en-KE')}${l.unit ? ` ${l.unit}` : ''}`;
    })
    .join(' · ');
}

/** Every check, grouped by who it is about, with its limits and on/off. */
export function RulesList({ rules, canChange }: { rules: FraudRule[]; canChange: boolean }) {
  const [editing, setEditing] = React.useState<FraudRule | null>(null);
  const groups = SUBJECT_ORDER.map((s) => ({
    subject: s,
    rules: rules.filter((r) => r.subject_type === s),
  })).filter((g) => g.rules.length > 0);

  return (
    <div className="space-y-6">
      {groups.map((g) => {
        const Icon = SUBJECT_ICON[g.subject];
        return (
          <section key={g.subject} aria-label={SUBJECTS[g.subject].plural} className="space-y-3">
            <h2 className="flex items-center gap-2 text-[1.0625rem] font-extrabold">
              <Icon aria-hidden="true" className="text-gold-text h-5 w-5" strokeWidth={1.9} />
              {SUBJECTS[g.subject].plural}
            </h2>
            <ul className="grid gap-3 lg:grid-cols-2">
              {g.rules.map((r) => (
                <li
                  key={r.kind}
                  className="border-border bg-surface flex flex-col gap-3 rounded-2xl border p-4 shadow-[0_1px_2px_rgba(20,20,20,0.04)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[0.9375rem] font-extrabold leading-snug">{r.label}</p>
                      {r.description && (
                        <p className="text-muted mt-1 text-sm leading-snug">{r.description}</p>
                      )}
                    </div>
                    {!r.automated ? (
                      <Pill tone="grey" icon={Hand}>
                        By Hand
                      </Pill>
                    ) : r.enabled ? (
                      <Pill tone="green" dot>
                        On
                      </Pill>
                    ) : (
                      <Pill tone="grey" dot>
                        Off
                      </Pill>
                    )}
                  </div>
                  <div className="text-muted flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold">
                    <SeverityPill flag={r} />
                    {Object.keys(r.params).length > 0 && <span>{limitsText(r)}</span>}
                    <span>
                      {r.open > 0 ? (
                        <span className="text-danger">
                          {r.open} open flag{r.open === 1 ? '' : 's'}
                        </span>
                      ) : (
                        'No open flags'
                      )}
                    </span>
                    {r.last_found_at && <span>Last found {dateTime(r.last_found_at)}</span>}
                  </div>
                  {(r.updated_by || (canChange && r.automated)) && (
                    <div className="border-border flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                      <span className="text-muted-light text-xs">
                        {r.updated_by && r.updated_at
                          ? `Changed by ${r.updated_by}, ${dateTime(r.updated_at)}`
                          : ''}
                      </span>
                      {canChange && r.automated && (
                        <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                          Change
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {editing && <RulePanel rule={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RulePanel({ rule, onClose }: { rule: FraudRule; onClose: () => void }) {
  const [enabled, setEnabled] = React.useState(rule.enabled);
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(orderedLimits(rule.params).map(([k, v]) => [k, String(v)])),
  );
  const { run, busy } = useRunner();
  const switchId = React.useId();

  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title="Change This Check"
      subtitle={rule.label}
      submitLabel="Save"
      busy={busy}
      onSubmit={async () => {
        const params: Record<string, number> = {};
        for (const [k, v] of Object.entries(values)) {
          const n = Number(v);
          if (!Number.isFinite(n) || n <= 0) {
            return run(async () => ({
              ok: false,
              message: `${limitLabel(k).label} must be a number above zero.`,
            }));
          }
          params[k] = n;
        }
        return run(() => setRule(rule.kind, enabled, Object.keys(params).length ? params : null));
      }}
    >
      {rule.description && <p className="text-muted text-sm">{rule.description}</p>}
      <Switch
        id={switchId}
        label="Check Is On"
        description={
          enabled
            ? 'Runs every five minutes and raises flags.'
            : 'Off: nothing new is raised. Flags already raised stay in the queue.'
        }
        checked={enabled}
        onCheckedChange={setEnabled}
      />
      {Object.keys(values).map((k) => {
        const l = limitLabel(k);
        return (
          <TextField
            key={k}
            label={`${l.label}${l.unit ? ` (${l.unit})` : ''}`}
            inputMode="decimal"
            value={values[k] ?? ''}
            onChange={(e) => setValues((prev) => ({ ...prev, [k]: e.target.value }))}
            required
          />
        );
      })}
      <p className="text-muted-light flex items-center gap-1.5 text-xs">
        <ShieldAlert aria-hidden="true" className="h-3.5 w-3.5" />
        Changes are on the audit log with your name.
      </p>
    </FormPanel>
  );
}

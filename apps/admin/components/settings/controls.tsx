'use client';

import { Button, Card, Input, Select, Switch, useToast } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import type { Outcome } from '@/app/settings/actions';

/**
 * The parts of Settings somebody can press.
 *
 * None of them decide anything. Whether a key can be immediate,
 * whether this person may edit this group, who has to approve — all
 * of it is answered by the RPC, and these components only ask
 * clearly and show the answer. Where a control is disabled here, the
 * database would refuse anyway; the disabling is a courtesy, not the
 * rule.
 */

function useRun() {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  return {
    pending,
    run: async (fn: () => Promise<Outcome>) => {
      setPending(true);
      const result = await fn();
      setPending(false);
      toast({
        title: result.ok ? 'Done' : 'Not allowed',
        description: result.message ?? '',
        tone: result.ok ? 'success' : 'danger',
      });
      if (result.ok) router.refresh();
      return result;
    },
  };
}

// ──────────────────────────────────────────── one editable value

/**
 * A single setting.
 *
 * Staging is explicit — the value does not save on blur. A field
 * that writes as soon as focus leaves is a field that changes a
 * commission because somebody tabbed past it.
 */
export function SettingField({
  label,
  help,
  group,
  cityId,
  settingKey,
  category,
  value,
  unit,
  valueType,
  canEdit,
  lockedBy,
  onStage,
  options,
  compact,
}: {
  label: string;
  help?: string | null;
  group: string;
  cityId: string | null;
  settingKey: string;
  category?: string | null;
  value: number | string | boolean | null;
  unit?: string | null;
  valueType: 'int' | 'money' | 'pct' | 'bool' | 'text' | 'enum';
  canEdit: boolean;
  lockedBy?: string;
  options?: { value: string; label: string }[];
  /* Inside a rate-card cell the column header is already the label;
     repeating it in every row is noise on screen and a duplicate
     announcement to a screen reader. The input keeps its accessible
     name either way. */
  compact?: boolean;
  onStage: (input: {
    group: string;
    cityId: string | null;
    key: string;
    value: unknown;
    category?: string | null;
  }) => Promise<Outcome>;
}) {
  const { pending, run } = useRun();
  const [draft, setDraft] = React.useState(
    value === null || value === undefined ? '' : String(value),
  );
  const id = React.useId();

  const live = value === null || value === undefined ? '' : String(value);
  const dirty = draft !== live;

  const stage = () =>
    run(() =>
      onStage({
        group,
        cityId,
        key: settingKey,
        category: category ?? null,
        value:
          draft === ''
            ? null
            : valueType === 'bool'
              ? draft === 'true'
              : valueType === 'text' || valueType === 'enum'
                ? draft
                : Number(draft),
      }),
    );

  if (valueType === 'bool') {
    /* The Switch owns its own label — rendering a second one above it
       would read the setting's name twice to a screen reader. */
    return (
      <div className="py-2">
        <Switch
          id={id}
          label={label}
          checked={value === true}
          disabled={!canEdit || pending}
          loading={pending}
          onCheckedChange={(next) =>
            run(() =>
              onStage({ group, cityId, key: settingKey, category: category ?? null, value: next }),
            )
          }
          description={help ?? undefined}
          disabledReason={!canEdit && lockedBy ? lockedBy : undefined}
        />
      </div>
    );
  }

  return (
    <div className={compact ? '' : 'py-2'}>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1">
          {options ? (
            <Select
              id={id}
              label={label}
              value={draft}
              disabled={!canEdit}
              onValueChange={setDraft}
              options={options}
              hint={help ?? undefined}
            />
          ) : (
            <Input
              id={id}
              label={unit && !compact ? `${label} · ${unit}` : label}
              labelHidden={compact}
              value={draft}
              disabled={!canEdit}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="[—]"
              inputMode={valueType === 'text' ? 'text' : 'decimal'}
              hint={compact ? undefined : (help ?? undefined)}
              className={compact ? 'max-w-[7rem]' : undefined}
            />
          )}
        </div>
        {canEdit && dirty && (
          <Button size="sm" variant="black" loading={pending} onClick={stage}>
            Stage
          </Button>
        )}
      </div>
      {!canEdit && lockedBy && (
        <p className="text-muted-light mt-1 text-[0.6875rem] font-semibold">🔒 {lockedBy}</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────── the save bar

/**
 * The gold button in the header, and what it opens.
 *
 * The dialog has to answer three things before somebody presses
 * send: what changes, what it touches, and who will be asked. An
 * approval request that arrives without those is one that gets
 * approved without being read.
 */
export function SaveBar({
  draft,
  onSubmit,
  onDiscard,
}: {
  draft: {
    change_set_id: string;
    title: string;
    changes: number;
    diff: Record<
      string,
      { label: string; from: unknown; to: unknown; unit: string | null; sensitive: boolean }
    >;
    impact: Record<string, Record<string, unknown>>;
    anyImmediateBlocked: boolean;
    pair: string;
  } | null;
  onSubmit: (
    id: string,
    immediate: boolean,
    reason: string | null,
    effectiveFrom: string | null,
  ) => Promise<Outcome>;
  onDiscard: (id: string) => Promise<Outcome>;
}) {
  const { pending, run } = useRun();
  const [open, setOpen] = React.useState(false);
  const [immediate, setImmediate] = React.useState(false);
  const [reason, setReason] = React.useState('');

  const count = draft?.changes ?? 0;

  if (!draft || count === 0) {
    return (
      <span className="text-muted-light text-[0.75rem] font-semibold">
        Unsaved:&nbsp;<span className="font-extrabold">0</span>
      </span>
    );
  }

  const entries = Object.entries(draft.diff);
  const merchants = Object.values(draft.impact)
    .map((i) => Number(i.merchants ?? 0))
    .reduce((a, b) => Math.max(a, b), 0);
  const riders = Object.values(draft.impact)
    .map((i) => Number(i.riders ?? 0))
    .reduce((a, b) => Math.max(a, b), 0);

  return (
    <>
      <div className="flex items-center gap-3">
        <span className="text-gold-text text-[0.75rem] font-semibold">
          Unsaved:&nbsp;<span className="font-extrabold">{count}</span>
        </span>
        <Button size="sm" variant="gold" onClick={() => setOpen(true)}>
          Save · request approval
        </Button>
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Submit ${count} changes`}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
        >
          <Card className="w-full max-w-[42rem] p-6">
            <h2 className="text-[1.125rem] font-extrabold tracking-tight">{draft.title}</h2>
            <p className="text-muted mt-1 text-[0.8125rem] font-semibold">
              {count} change{count === 1 ? '' : 's'}. Nothing is live until it is approved.
            </p>

            <div className="border-border mt-4 divide-y border-y">
              {entries.map(([key, d]) => (
                <div key={key} className="flex flex-wrap items-center gap-2 py-2.5">
                  <span className="min-w-[10rem] flex-1 text-[0.8125rem] font-bold">
                    {d.label}
                    {d.sensitive && (
                      <span className="text-gold-text ml-1.5 text-[0.625rem] font-extrabold">
                        MONEY
                      </span>
                    )}
                  </span>
                  <span className="text-muted-light text-[0.8125rem] line-through">
                    {render(d.from, d.unit)}
                  </span>
                  <span aria-hidden="true" className="text-muted-light">
                    →
                  </span>
                  <span className="text-[0.8125rem] font-extrabold">{render(d.to, d.unit)}</span>
                </div>
              ))}
            </div>

            <div className="bg-bg mt-4 rounded-lg p-3">
              <p className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-[0.12em]">
                What this touches
              </p>
              <p className="text-muted mt-1 text-[0.8125rem] font-semibold leading-[1.7]">
                {merchants > 0 && `${merchants} live merchant${merchants === 1 ? '' : 's'}. `}
                {riders > 0 && `${riders} active rider${riders === 1 ? '' : 's'}. `}
                Orders a day at the old value: [—] — the orders domain is not built, so that number
                is genuinely unknown rather than zero.
              </p>
            </div>

            <div className="mt-4">
              <p className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-[0.12em]">
                When
              </p>
              <p className="mt-1 text-[0.8125rem] font-semibold">
                {immediate
                  ? 'Now, as soon as it is approved.'
                  : 'The next 00:00 in the city’s own timezone, so everybody sees one price for one day.'}
              </p>

              {draft.anyImmediateBlocked ? (
                <p className="text-muted-light mt-2 text-[0.75rem] font-semibold leading-[1.7]">
                  Immediate is not available: this set contains a price. A fee that changes
                  mid-afternoon means two guests paid different amounts for the same thing on the
                  same day.
                </p>
              ) : (
                <div className="mt-2">
                  <Switch
                    id="immediate"
                    label="Apply immediately (incident)"
                    checked={immediate}
                    onCheckedChange={setImmediate}
                  />
                </div>
              )}
            </div>

            <div className="mt-4">
              <Input
                id="submit-reason"
                label={immediate ? 'Why immediately?' : 'Reason (optional)'}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  immediate
                    ? 'Read later by whoever asks why the number moved today.'
                    : 'Helps whoever changes it next.'
                }
              />
            </div>

            <p className="text-muted-light mt-4 text-[0.75rem] font-semibold leading-[1.7]">
              {draft.pair.startsWith('single:')
                ? `This group needs one person: ${draft.pair.split(':')[1]?.replace('_', ' ')}.`
                : `This will be sent to ${draft.pair.replace('+', ' and ').replace(/_/g, ' ')} — and not to you, even if you hold both roles.`}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                variant="black"
                loading={pending}
                disabled={pending || (immediate && reason.trim() === '')}
                onClick={async () => {
                  const r = await run(() =>
                    onSubmit(draft.change_set_id, immediate, reason || null, null),
                  );
                  if (r.ok) setOpen(false);
                }}
              >
                Send for approval
              </Button>
              <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
                Keep editing
              </Button>
              <Button
                variant="ghost"
                disabled={pending}
                onClick={async () => {
                  const r = await run(() => onDiscard(draft.change_set_id));
                  if (r.ok) setOpen(false);
                }}
              >
                Discard all
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

function render(v: unknown, unit?: string | null): string {
  if (v === null || v === undefined) return '[—]';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return unit ? `${String(v)} ${unit}` : String(v);
}

// ─────────────────────────────────────── the scheduled banner

export function ScheduledBanner({
  sets,
  onApprove,
  onReject,
  onActivate,
}: {
  sets: {
    change_set_id: string;
    title: string;
    status: string;
    effective_from: string | null;
    immediate: boolean;
    changes: number;
    requested_by_name: string | null;
    approved_by_name: string | null;
    reason: string | null;
  }[];
  onApprove: (id: string) => Promise<Outcome>;
  onReject: (id: string, reason: string) => Promise<Outcome>;
  onActivate: () => Promise<Outcome>;
}) {
  const { pending, run } = useRun();
  const [reason, setReason] = React.useState<Record<string, string>>({});

  const live = sets.filter((s) => s.status !== 'draft');
  if (live.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      {live.map((s) => {
        const waiting = s.status === 'awaiting_approval';
        const due = s.effective_from !== null && new Date(s.effective_from).getTime() <= Date.now();
        return (
          <div
            key={s.change_set_id}
            className={`rounded-xl border p-4 ${
              waiting ? 'bg-warning-bg border-warning' : 'bg-info-bg border-info'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[0.8125rem] font-extrabold">{s.title}</span>
              <span className="text-muted-light text-[0.6875rem] font-bold">
                {s.changes} change{s.changes === 1 ? '' : 's'}
              </span>
              <span className="text-muted-light ml-auto text-[0.6875rem] font-bold">
                {s.immediate
                  ? 'immediate'
                  : s.effective_from
                    ? new Date(s.effective_from).toLocaleString('en-GB', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Africa/Nairobi',
                      })
                    : ''}
              </span>
            </div>

            <p className="text-muted mt-1 text-[0.75rem] font-semibold">
              {waiting
                ? `Asked by ${s.requested_by_name ?? '[—]'} — waiting for somebody else to approve.`
                : `Approved by ${s.approved_by_name ?? '[—]'}. Goes live at the time above.`}
              {s.reason ? ` · ${s.reason}` : ''}
            </p>

            {waiting && (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <Button
                  size="sm"
                  variant="black"
                  loading={pending}
                  onClick={() => run(() => onApprove(s.change_set_id))}
                >
                  Approve
                </Button>
                <div className="min-w-[14rem]">
                  <Input
                    id={`reject-${s.change_set_id}`}
                    label="Reason to reject"
                    labelHidden
                    value={reason[s.change_set_id] ?? ''}
                    onChange={(e) =>
                      setReason((p) => ({ ...p, [s.change_set_id]: e.target.value }))
                    }
                    placeholder="Why not"
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || !(reason[s.change_set_id] ?? '').trim()}
                  onClick={() =>
                    run(() => onReject(s.change_set_id, reason[s.change_set_id] ?? ''))
                  }
                >
                  Reject
                </Button>
              </div>
            )}

            {!waiting && due && (
              <div className="mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  loading={pending}
                  onClick={() => run(onActivate)}
                >
                  It is past the time — apply now
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────────────────────────────── rollback

export function RollbackButton({
  versionId,
  onRollback,
}: {
  versionId: string;
  onRollback: (id: string, reason: string) => Promise<Outcome>;
}) {
  const { pending, run } = useRun();
  const [reason, setReason] = React.useState('');
  const [open, setOpen] = React.useState(false);

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Roll back
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[16rem]">
        <Input
          id={`rollback-${versionId}`}
          label="Why roll back"
          labelHidden
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why this is being undone"
        />
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={pending || reason.trim() === ''}
        onClick={() => run(() => onRollback(versionId, reason))}
      >
        Roll back now
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}

// ───────────────────────────────────── the payment incident switch

/**
 * Turning a guest payment method on or off.
 *
 * The reason box is always open rather than appearing after the
 * click, because the reason is the point: this is the one control
 * in Settings that changes what a guest sees without waiting for
 * midnight or a second person, and the thing that keeps it
 * accountable is somebody having written down why.
 */
export function PaymentToggle({
  methodKey,
  label,
  enabled,
  canEdit,
  lockedBy,
  onToggle,
}: {
  methodKey: string;
  label: string;
  enabled: boolean;
  canEdit: boolean;
  lockedBy: string;
  onToggle: (key: string, enabled: boolean, reason: string) => Promise<Outcome>;
}) {
  const { pending, run } = useRun();
  const [reason, setReason] = React.useState('');

  if (!canEdit) {
    return <p className="text-muted-light mt-2 text-[0.6875rem] font-semibold">🔒 {lockedBy}</p>;
  }

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <div className="min-w-[16rem] flex-1">
        <Input
          id={`pm-reason-${methodKey}`}
          label={enabled ? `Why turn ${label} off?` : `Why turn ${label} back on?`}
          labelHidden
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={
            enabled ? 'Guests stop seeing it immediately — say why.' : 'Say what changed.'
          }
        />
      </div>
      <Button
        size="sm"
        variant={enabled ? 'outline' : 'black'}
        loading={pending}
        disabled={pending || reason.trim() === ''}
        onClick={async () => {
          const r = await run(() => onToggle(methodKey, !enabled, reason));
          if (r.ok) setReason('');
        }}
      >
        {enabled ? 'Turn off' : 'Turn on'}
      </Button>
    </div>
  );
}

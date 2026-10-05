'use client';

import { Button, Card, Input, Select, useToast } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import type { Outcome } from '@/app/audit/actions';

/**
 * The interactive parts of the Audit console.
 *
 * Every one of them collects a reason before it will submit, because
 * every corresponding RPC refuses without one. Asking here and
 * refusing there is not duplication — the RPC is the rule, this is
 * the courtesy of saying so before the round trip.
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
      return result.ok;
    },
  };
}

// ──────────────────────────────────────────────────── review an event

export function ReviewControls({
  eventId,
  state,
  onReview,
}: {
  eventId: number;
  state: string;
  onReview: (
    id: number,
    state: 'reviewed' | 'escalated' | 'needs_review',
    note: string | null,
  ) => Promise<Outcome>;
}) {
  const { pending, run } = useRun();
  const [note, setNote] = React.useState('');

  if (state === 'reviewed') return null;

  return (
    <div className="border-border mt-4 border-t pt-4">
      <Input
        id={`review-note-${eventId}`}
        label="What did you find?"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Spoke to them — it was the Kilimani handover."
        hint="An escalation needs a note. You cannot clear a review of your own action."
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="black"
          loading={pending}
          onClick={() => run(() => onReview(eventId, 'reviewed', note || null))}
        >
          Mark reviewed
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || note.trim() === ''}
          onClick={() => run(() => onReview(eventId, 'escalated', note))}
        >
          Escalate
        </Button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────── alerts

export function AlertControls({
  alertId,
  state,
  onAct,
}: {
  alertId: string;
  state: string;
  onAct: (
    id: string,
    action: 'acknowledge' | 'resolve' | 'false_positive',
    note: string | null,
  ) => Promise<Outcome>;
}) {
  const { pending, run } = useRun();
  const [note, setNote] = React.useState('');

  if (state === 'resolved' || state === 'false_positive') return null;

  return (
    <div className="mt-3">
      <Input
        id={`alert-note-${alertId}`}
        label="Closing note"
        labelHidden
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Why this is closed"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {state === 'open' && (
          <Button
            size="sm"
            variant="outline"
            loading={pending}
            onClick={() => run(() => onAct(alertId, 'acknowledge', null))}
          >
            I am on it
          </Button>
        )}
        <Button
          size="sm"
          variant="black"
          disabled={pending || note.trim() === ''}
          onClick={() => run(() => onAct(alertId, 'resolve', note))}
        >
          Resolve
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending || note.trim() === ''}
          onClick={() => run(() => onAct(alertId, 'false_positive', note))}
        >
          False positive
        </Button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────── break-glass

export function BreakGlassForm({
  onOpen,
}: {
  onOpen: (
    reason: string,
    scope: string,
    minutes: number,
    moduleKey: string | null,
    cityId: string | null,
  ) => Promise<Outcome>;
}) {
  const { pending, run } = useRun();
  const [reason, setReason] = React.useState('');
  const [minutes, setMinutes] = React.useState('60');
  const short = reason.trim().length < 20;

  return (
    <Card className="p-5">
      <h3 className="text-[0.875rem] font-extrabold">Open break-glass access</h3>
      <p className="text-muted mt-1.5 text-[0.8125rem] font-semibold leading-[1.7]">
        For an emergency that cannot wait for the person who normally has the access. It expires by
        itself, somebody else reviews it afterwards, and everything you do inside the window is
        listed against it.
      </p>

      <div className="mt-4">
        <Input
          id="bg-reason"
          label="What is the emergency?"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Payment provider outage — riders in Westlands are stranded with cash."
          hint={
            short
              ? `At least a sentence — ${20 - reason.trim().length} more characters.`
              : 'Read later by somebody who was not there.'
          }
        />
      </div>

      <div className="mt-3">
        <Select
          id="bg-minutes"
          label="For how long"
          value={minutes}
          onValueChange={setMinutes}
          options={[
            { value: '15', label: '15 minutes' },
            { value: '60', label: '1 hour' },
            { value: '240', label: '4 hours' },
            { value: '480', label: '8 hours — the maximum' },
          ]}
        />
      </div>

      <Button
        block
        variant="black"
        className="mt-4"
        disabled={pending || short}
        loading={pending}
        onClick={() => run(() => onOpen(reason, 'everything', Number(minutes), null, null))}
      >
        Open it
      </Button>
    </Card>
  );
}

export function BreakGlassActions({
  id,
  openNow,
  needsReview,
  onClose,
  onReview,
}: {
  id: string;
  openNow: boolean;
  needsReview: boolean;
  onClose: (id: string) => Promise<Outcome>;
  onReview: (
    id: string,
    outcome: 'justified' | 'unjustified' | 'inconclusive',
    note: string,
  ) => Promise<Outcome>;
}) {
  const { pending, run } = useRun();
  const [note, setNote] = React.useState('');
  const [outcome, setOutcome] = React.useState('justified');

  return (
    <div className="mt-3">
      {openNow && (
        <Button
          size="sm"
          variant="outline"
          loading={pending}
          onClick={() => run(() => onClose(id))}
        >
          Close it now
        </Button>
      )}
      {needsReview && (
        <div className="mt-2 space-y-2">
          <Select
            id={`bg-outcome-${id}`}
            label="Review outcome"
            labelHidden
            value={outcome}
            onValueChange={setOutcome}
            options={[
              { value: 'justified', label: 'Justified' },
              { value: 'unjustified', label: 'Unjustified' },
              { value: 'inconclusive', label: 'Inconclusive' },
            ]}
          />
          <Input
            id={`bg-note-${id}`}
            label="Review note"
            labelHidden
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What did they actually do with it?"
          />
          <Button
            size="sm"
            variant="black"
            disabled={pending || note.trim() === ''}
            onClick={() =>
              run(() => onReview(id, outcome as 'justified' | 'unjustified' | 'inconclusive', note))
            }
          >
            Record the review
          </Button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────── the chain

export function VerifyChainButton({ onVerify }: { onVerify: () => Promise<Outcome> }) {
  const { pending, run } = useRun();
  return (
    <Button
      size="sm"
      variant="outline"
      loading={pending}
      loadingText="Walking the chain…"
      onClick={() => run(onVerify)}
    >
      Verify now
    </Button>
  );
}

// ──────────────────────────────────────────────────── holds and packs

export function LegalHoldForm({
  onPlace,
}: {
  onPlace: (input: {
    reference: string;
    title: string;
    reason: string;
    subjectType: string;
    instructedBy: string;
    subjectId: string | null;
  }) => Promise<Outcome>;
}) {
  const { pending, run } = useRun();
  const [f, setF] = React.useState({
    reference: '',
    title: '',
    reason: '',
    subjectType: 'rider',
    instructedBy: '',
    subjectId: '',
  });
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const needsId = f.subjectType !== 'everything' && f.subjectType !== 'city';
  const ready =
    f.reference.trim() &&
    f.title.trim() &&
    f.reason.trim() &&
    f.instructedBy.trim() &&
    (!needsId || f.subjectId.trim());

  return (
    <Card className="p-5">
      <h3 className="text-[0.875rem] font-extrabold">Place a legal hold</h3>
      <p className="text-muted mt-1.5 text-[0.8125rem] font-semibold leading-[1.7]">
        Stops every retention rule for this subject until somebody other than you releases it.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Input
          id="lh-reference"
          label="Reference"
          value={f.reference}
          onChange={(e) => set('reference')(e.target.value)}
          placeholder="LH-2026-001"
        />
        <Input
          id="lh-instructed"
          label="Instructed by"
          value={f.instructedBy}
          onChange={(e) => set('instructedBy')(e.target.value)}
          placeholder="Wanjiru & Co, 12 Jan 2026"
        />
      </div>

      <div className="mt-3">
        <Input
          id="lh-title"
          label="Title"
          value={f.title}
          onChange={(e) => set('title')(e.target.value)}
          placeholder="Westlands collision"
        />
      </div>

      <div className="mt-3">
        <Input
          id="lh-reason"
          label="Why"
          value={f.reason}
          onChange={(e) => set('reason')(e.target.value)}
          placeholder="Insurer has asked for everything about this rider."
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Select
          id="lh-subject"
          label="What it covers"
          value={f.subjectType}
          onValueChange={set('subjectType')}
          options={[
            { value: 'rider', label: 'A rider' },
            { value: 'merchant', label: 'A merchant' },
            { value: 'guest', label: 'A guest' },
            { value: 'candidate', label: 'A candidate' },
            { value: 'host', label: 'A host' },
            { value: 'order', label: 'An order' },
            { value: 'everything', label: 'Everything' },
          ]}
        />
        {needsId && (
          <Input
            id="lh-subject-id"
            label="Their id"
            value={f.subjectId}
            onChange={(e) => set('subjectId')(e.target.value)}
            placeholder="uuid"
          />
        )}
      </div>

      <Button
        block
        variant="black"
        className="mt-4"
        disabled={pending || !ready}
        loading={pending}
        onClick={() =>
          run(() =>
            onPlace({
              reference: f.reference,
              title: f.title,
              reason: f.reason,
              subjectType: f.subjectType,
              instructedBy: f.instructedBy,
              subjectId: needsId ? f.subjectId : null,
            }),
          )
        }
      >
        Place the hold
      </Button>
    </Card>
  );
}

export function HoldRelease({
  id,
  onRelease,
}: {
  id: string;
  onRelease: (id: string, reason: string) => Promise<Outcome>;
}) {
  const { pending, run } = useRun();
  const [reason, setReason] = React.useState('');
  return (
    <div className="mt-2 flex flex-wrap items-end gap-2">
      <div className="min-w-[18rem] flex-1">
        <Input
          id={`hold-release-${id}`}
          label="Release reason"
          labelHidden
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why it is being released"
        />
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={pending || reason.trim() === ''}
        onClick={() => run(() => onRelease(id, reason))}
      >
        Release
      </Button>
    </div>
  );
}

export function PackActions({
  id,
  state,
  onFreeze,
  onShare,
}: {
  id: string;
  state: string;
  onFreeze: (id: string) => Promise<Outcome>;
  onShare: (id: string, with_: string, how: string) => Promise<Outcome>;
}) {
  const { pending, run } = useRun();
  const [who, setWho] = React.useState('');
  const [how, setHow] = React.useState('secure_link');

  if (state === 'draft') {
    return (
      <Button size="sm" variant="black" loading={pending} onClick={() => run(() => onFreeze(id))}>
        Freeze and digest
      </Button>
    );
  }
  if (state !== 'frozen') return null;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[14rem]">
        <Input
          id={`pack-who-${id}`}
          label="Who received it"
          labelHidden
          value={who}
          onChange={(e) => setWho(e.target.value)}
          placeholder="Who received it"
        />
      </div>
      <div className="min-w-[12rem]">
        <Select
          id={`pack-how-${id}`}
          label="How it was sent"
          labelHidden
          value={how}
          onValueChange={setHow}
          options={[
            { value: 'secure_link', label: 'Secure link' },
            { value: 'encrypted_file', label: 'Encrypted file' },
            { value: 'in_person', label: 'In person' },
            { value: 'post', label: 'Post' },
          ]}
        />
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={pending || who.trim() === ''}
        onClick={() => run(() => onShare(id, who, how))}
      >
        Record as shared
      </Button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────── retention

export function RetentionApprove({
  rowKey,
  onApprove,
}: {
  rowKey: string;
  onApprove: (key: string) => Promise<Outcome>;
}) {
  const { pending, run } = useRun();
  return (
    <Button
      size="sm"
      variant="outline"
      loading={pending}
      onClick={() => run(() => onApprove(rowKey))}
    >
      Approve
    </Button>
  );
}

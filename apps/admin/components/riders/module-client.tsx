'use client';

import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Eye,
  MapPin,
  MessageSquare,
  PauseCircle,
  PlayCircle,
  PlusCircle,
  UserCheck,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { pauseZone, resumeZone } from '@/app/live/actions';
import { openRiderCase, resolveRiderCase, updateRiderCase } from '@/app/riders/actions';
import {
  ActionMenu,
  FieldRow,
  FormPanel,
  SelectField,
  TextArea,
  TextField,
  useRunner,
} from '@/components/portal/client-kit';
import { HeaderButton } from '@/components/portal/dash';
import {
  CASE_REASON_LABEL,
  CASE_TYPE_LABEL,
  OUTCOME_LABEL,
  PRIORITY_LABEL,
  REPORTER_LABEL,
} from '@/lib/riders-module';

const options = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

/* ─────────────────────────────────────────────────────────── rider rows */

/**
 * The "…" on a rider row. Each item opens the place on the rider's record
 * where that action already lives, audited: messages, the live location
 * reveal, cooldown and the offer switches, and suspension (two-person).
 */
export function RiderRowMenu({ riderId, name }: { riderId: string; name: string }) {
  const router = useRouter();
  const go = (path: string) => () => router.push(`/riders/${riderId}${path}`);
  return (
    <ActionMenu
      label={`Actions for ${name}`}
      actions={[
        { label: 'View record', icon: <Eye className="h-4 w-4" />, onSelect: go('') },
        {
          label: 'Message',
          icon: <MessageSquare className="h-4 w-4" />,
          onSelect: go('?view=messages'),
        },
        {
          label: 'Live location',
          icon: <MapPin className="h-4 w-4" />,
          onSelect: go('?view=overview#live'),
        },
        {
          label: 'Cool down or pause offers',
          icon: <PauseCircle className="h-4 w-4" />,
          onSelect: go('?view=overview#controls'),
        },
        {
          label: 'Suspend',
          icon: <Ban className="h-4 w-4" />,
          tone: 'danger',
          separated: true,
          onSelect: go('?view=application#suspend'),
        },
      ]}
    />
  );
}

/* ──────────────────────────────────────────────────────────── case rows */

export function CaseRowMenu({
  caseId,
  label,
  bucket,
  assigned,
}: {
  caseId: string;
  label: string;
  bucket: string;
  assigned: boolean;
}) {
  const router = useRouter();
  const { run } = useRunner();
  const [resolving, setResolving] = React.useState(false);
  const open = bucket !== 'resolved';
  return (
    <>
      <ActionMenu
        label={`Actions for ${label}`}
        actions={[
          {
            label: 'Open case',
            icon: <Eye className="h-4 w-4" />,
            onSelect: () => router.push(`/riders/incidents/${caseId}`),
          },
          open &&
            !assigned && {
              label: 'Assign to me',
              icon: <UserCheck className="h-4 w-4" />,
              onSelect: () => void run(() => updateRiderCase(caseId, 'assign_me')),
            },
          open &&
            bucket === 'open' && {
              label: 'Start working on it',
              icon: <PlayCircle className="h-4 w-4" />,
              onSelect: () => void run(() => updateRiderCase(caseId, 'start')),
            },
          open &&
            bucket !== 'escalated' && {
              label: 'Escalate',
              icon: <AlertTriangle className="h-4 w-4" />,
              onSelect: () => void run(() => updateRiderCase(caseId, 'escalate')),
            },
          open && {
            label: 'Resolve…',
            icon: <CheckCircle2 className="h-4 w-4" />,
            separated: true,
            opensOverlay: true,
            onSelect: () => setResolving(true),
          },
        ]}
      />
      {resolving && <ResolveCase caseId={caseId} open={resolving} onOpenChange={setResolving} />}
    </>
  );
}

export function ResolveCase({
  caseId,
  open,
  onOpenChange,
}: {
  caseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { run, busy } = useRunner();
  const [outcome, setOutcome] = React.useState('resolved');
  const [text, setText] = React.useState('');
  const [comp, setComp] = React.useState('');
  return (
    <FormPanel
      open={open}
      onOpenChange={onOpenChange}
      title="Resolve case"
      subtitle="The outcome counts on the Case Outcomes chart; the note stays on the case."
      submitLabel="Resolve"
      busy={busy}
      onSubmit={() =>
        run(() =>
          resolveRiderCase(caseId, outcome, text, comp.trim() ? Math.round(Number(comp)) : null),
        )
      }
    >
      <SelectField
        label="Outcome"
        required
        value={outcome}
        onChange={(e) => setOutcome(e.target.value)}
        options={options(OUTCOME_LABEL)}
      />
      <TextArea
        label="How it was resolved"
        required
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={2000}
      />
      {outcome === 'compensated' && (
        <TextField
          label="Compensation (KES)"
          inputMode="numeric"
          pattern="[0-9]*"
          value={comp}
          onChange={(e) => setComp(e.target.value.replace(/[^0-9]/g, ''))}
          hint="What was given back, in whole shillings. Pay it through Finance as usual."
        />
      )}
    </FormPanel>
  );
}

/** The gold Create Case button and its form. */
export function CreateCase({ riders }: { riders: { id: string; name: string }[] }) {
  const { run, busy } = useRunner();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    caseType: 'delivery_dispute',
    priority: 'medium',
    reason: '',
    reportedBy: 'guest',
    riderId: '',
    orderReference: '',
    description: '',
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <>
      <HeaderButton icon={PlusCircle} gold onClick={() => setOpen(true)}>
        Create Case
      </HeaderButton>
      <FormPanel
        open={open}
        onOpenChange={setOpen}
        title="Create case"
        subtitle="An incident or dispute about a rider or a delivery. It is audited and gets an SLA from its priority."
        submitLabel="Create case"
        busy={busy}
        onSubmit={async () => {
          const ok = await run(() => openRiderCase(form));
          if (ok)
            setForm((f) => ({
              ...f,
              orderReference: '',
              description: '',
              riderId: '',
              reason: '',
            }));
          return ok;
        }}
      >
        <FieldRow>
          <SelectField
            label="Type"
            required
            value={form.caseType}
            onChange={set('caseType')}
            options={options(CASE_TYPE_LABEL)}
          />
          <SelectField
            label="Priority"
            required
            value={form.priority}
            onChange={set('priority')}
            options={options(PRIORITY_LABEL)}
            hint="Urgent 1 h, high 4 h, medium 24 h, low 72 h to resolve."
          />
        </FieldRow>
        <FieldRow>
          <SelectField
            label="Reason"
            value={form.reason}
            onChange={set('reason')}
            placeholder="Choose a reason"
            options={options(CASE_REASON_LABEL)}
          />
          <SelectField
            label="Reported by"
            required
            value={form.reportedBy}
            onChange={set('reportedBy')}
            options={options(REPORTER_LABEL)}
          />
        </FieldRow>
        <TextField
          label="Order ID"
          value={form.orderReference}
          onChange={set('orderReference')}
          placeholder="e.g. NX-1A2B3C"
          hint="Optional. The order's rider is filled in from it."
        />
        <SelectField
          label="Rider"
          value={form.riderId}
          onChange={set('riderId')}
          placeholder="From the order, or none"
          options={riders.map((r) => ({ value: r.id, label: r.name }))}
        />
        <TextArea
          label="What happened"
          required
          value={form.description}
          onChange={set('description')}
          maxLength={2000}
        />
      </FormPanel>
    </>
  );
}

/* ─────────────────────────────────────────────────────────── zone switch */

/**
 * A zone's on/off in Zone Management. Off is the live screen's zone pause
 * (rpc_zone_pause: no new orders there, with a reason and an end time);
 * on resumes it. Offered only to the roles the RPC allows.
 */
export function ZoneSwitch({
  zoneId,
  name,
  paused,
  canPause,
}: {
  zoneId: string;
  name: string;
  paused: boolean;
  canPause: boolean;
}) {
  const { run, busy } = useRunner();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [hours, setHours] = React.useState('2');
  const on = !paused;
  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${name}: ${on ? 'taking orders' : 'paused'}`}
        disabled={!canPause || busy}
        title={canPause ? undefined : 'Pausing a zone needs ops manager, city lead or super admin.'}
        onClick={() => {
          if (on) setOpen(true);
          else void run(() => resumeZone(zoneId, ''), `${name} resumed.`);
        }}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
          on ? 'bg-[#1E9E45]' : 'bg-[#C9C4B8]'
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            on ? 'left-[1.375rem]' : 'left-0.5'
          }`}
        />
      </button>
      <FormPanel
        open={open}
        onOpenChange={setOpen}
        title={`Pause ${name}`}
        subtitle="No new orders are taken for this zone until it is resumed or the time runs out."
        submitLabel="Pause zone"
        danger
        busy={busy}
        onSubmit={() =>
          run(
            () =>
              pauseZone(
                zoneId,
                reason,
                hours === 'open'
                  ? null
                  : new Date(Date.now() + Number(hours) * 3_600_000).toISOString(),
              ),
            `${name} paused.`,
          )
        }
      >
        <TextArea label="Why" required value={reason} onChange={(e) => setReason(e.target.value)} />
        <SelectField
          label="For"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          options={[
            { value: '1', label: '1 hour' },
            { value: '2', label: '2 hours' },
            { value: '4', label: '4 hours' },
            { value: '12', label: '12 hours' },
            { value: 'open', label: 'Until resumed' },
          ]}
        />
      </FormPanel>
    </>
  );
}

/** The case page's buttons: the same audited actions as the row menu. */
export function CaseActions({
  caseId,
  status,
  escalated,
  assigned,
}: {
  caseId: string;
  status: string;
  escalated: boolean;
  assigned: boolean;
}) {
  const { run, busy } = useRunner();
  const [resolving, setResolving] = React.useState(false);
  const btn =
    'border-border hover:bg-bg rounded-lg border px-3 py-2 text-[0.8125rem] font-bold disabled:opacity-60';
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {!assigned && (
        <button
          type="button"
          disabled={busy}
          className={btn}
          onClick={() => void run(() => updateRiderCase(caseId, 'assign_me'))}
        >
          Assign to me
        </button>
      )}
      {status === 'open' && (
        <button
          type="button"
          disabled={busy}
          className={btn}
          onClick={() => void run(() => updateRiderCase(caseId, 'start'))}
        >
          Start
        </button>
      )}
      {!escalated && (
        <button
          type="button"
          disabled={busy}
          className={btn}
          onClick={() => void run(() => updateRiderCase(caseId, 'escalate'))}
        >
          Escalate
        </button>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => setResolving(true)}
        className="rounded-lg bg-gradient-to-b from-[#FFD24D] to-[#F5B400] px-3 py-2 text-[0.8125rem] font-bold text-[#1A1A1A]"
      >
        Resolve…
      </button>
      {resolving && <ResolveCase caseId={caseId} open={resolving} onOpenChange={setResolving} />}
    </div>
  );
}

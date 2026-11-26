'use client';

import { Button } from '@nexg/ui';
import {
  CalendarX2,
  CheckCircle2,
  LogIn,
  LogOut,
  PlusCircle,
  ShieldCheck,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import * as React from 'react';

import {
  approveHost,
  blockDates,
  createReservation,
  checkInStay,
  checkOutStay,
  moderateReview,
  openCase,
  rejectHost,
  saveCampaign,
  saveLead,
  savePartner,
  setPropertyManager,
  setUnitRate,
  updateCase,
} from '@/app/stays/actions';
import {
  FieldRow,
  FormPanel,
  SelectField,
  TextArea,
  TextField,
  useRunner,
} from '@/components/portal/client-kit';
import { HeaderButton } from '@/components/portal/dash';
import {
  CAMPAIGN_CHANNEL_LABEL,
  CAMPAIGN_OBJECTIVE_LABEL,
  CASE_CATEGORY_LABEL,
  CASE_STATUS_LABEL,
  LEAD_KIND_LABEL,
  LEAD_SOURCE_LABEL,
  LEAD_STATUS_LABEL,
} from '@/lib/stays-module';

const options = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, text]) => ({ value, label: text }));

/** The designs' outlined gold action under a panel. */
function PanelButton({
  icon: Icon,
  children,
  onClick,
  disabled,
  tone = 'gold',
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'gold' | 'red' | 'green';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        'focus-visible:ring-gold inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-[0.875rem] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50 ' +
        (tone === 'red'
          ? 'border-[#F2B8B3] bg-[#FFF5F4] text-[#C62D22] hover:bg-[#FDE7E5]'
          : tone === 'green'
            ? 'border-[#B7E1C1] bg-[#F1FAF3] text-[#1E7B34] hover:bg-[#E3F5E6]'
            : 'border-[#F5D27A] bg-[#FFFBF0] text-[#8A5C00] hover:bg-[#FFF4D6]')
      }
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
      {children}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────── hosts */

/**
 * Approve, send back or decline a host. Approving is the existing
 * verification: the host's ID and proof of authority must already be
 * approved on their verification page, and the database refuses otherwise.
 */
export function HostDecision({
  hostId,
  name,
  docsReady,
}: {
  hostId: string;
  name: string;
  docsReady: boolean;
}) {
  const { run, busy } = useRunner();
  const [mode, setMode] = React.useState<'approve' | 'reject' | null>(null);
  const [method, setMethod] = React.useState('id_document');
  const [evidence, setEvidence] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [final, setFinal] = React.useState('back');
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <PanelButton icon={CheckCircle2} tone="green" onClick={() => setMode('approve')}>
          Approve
        </PanelButton>
        <PanelButton icon={XCircle} tone="red" onClick={() => setMode('reject')}>
          Reject
        </PanelButton>
      </div>
      {!docsReady && (
        <p className="text-muted mt-2 text-[0.8125rem] font-semibold">
          Approve the host&rsquo;s ID and proof of authority on{' '}
          <a href={`/hotels/hosts/${hostId}/verify`} className="font-bold underline">
            their verification page
          </a>{' '}
          first; approving checks them.
        </p>
      )}
      <FormPanel
        open={mode === 'approve'}
        onOpenChange={(o) => setMode(o ? 'approve' : null)}
        title={`Approve ${name}`}
        subtitle="The host goes live, their ready units show to guests, and they are emailed."
        submitLabel="Approve host"
        busy={busy}
        onSubmit={() => run(() => approveHost({ hostId, method, evidence }))}
      >
        <SelectField
          label="How you checked"
          required
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          options={[
            { value: 'id_document', label: 'ID document' },
            { value: 'listing_ownership', label: 'Listing ownership' },
            { value: 'call', label: 'A call with the host' },
          ]}
        />
        <TextArea
          label="What you checked"
          required
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          maxLength={1000}
        />
      </FormPanel>
      <FormPanel
        open={mode === 'reject'}
        onOpenChange={(o) => setMode(o ? 'reject' : null)}
        title={`Reject ${name}`}
        subtitle="The host is emailed the reason. Their listings stay hidden from guests."
        submitLabel={final === 'final' ? 'Decline application' : 'Send back to fix'}
        busy={busy}
        onSubmit={() => run(() => rejectHost({ hostId, reason, final: final === 'final' }))}
      >
        <SelectField
          label="Outcome"
          required
          value={final}
          onChange={(e) => setFinal(e.target.value)}
          options={[
            { value: 'back', label: 'Send back: they can fix it and apply again' },
            { value: 'final', label: 'Decline: NexG will not take this host' },
          ]}
        />
        <TextArea
          label="Reason the host reads"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          hint="In words they can act on, e.g. 'The ID photo is blurred; upload a clearer one.'"
        />
      </FormPanel>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────── stays */

export function StayMoves({ stayId, status }: { stayId: string; status: string }) {
  const { run, busy } = useRunner();
  return (
    <div className="grid grid-cols-2 gap-2">
      <PanelButton
        icon={LogIn}
        disabled={busy || status !== 'booked'}
        onClick={() => run(() => checkInStay(stayId))}
      >
        Record Check-in
      </PanelButton>
      <PanelButton
        icon={LogOut}
        disabled={busy || status !== 'in_stay'}
        onClick={() => run(() => checkOutStay(stayId))}
      >
        Record Check-out
      </PanelButton>
    </div>
  );
}

/** Block Dates and Edit Rates on a unit. */
export function UnitControls({
  unitId,
  rate,
  units,
}: {
  unitId?: string;
  rate?: number | null;
  /** When there is no unit open, the form picks one. */
  units?: { id: string; label: string }[];
}) {
  const { run, busy } = useRunner();
  const [open, setOpen] = React.useState<'block' | 'rate' | null>(null);
  const [form, setForm] = React.useState({
    unit: unitId ?? '',
    from: '',
    to: '',
    note: '',
    rate: rate ? String(rate) : '',
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const unitField =
    !unitId && units ? (
      <SelectField
        label="Unit"
        required
        value={form.unit}
        onChange={set('unit')}
        placeholder="Choose a unit"
        options={units.map((u) => ({ value: u.id, label: u.label }))}
      />
    ) : null;
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <PanelButton icon={CalendarX2} onClick={() => setOpen('block')}>
          Block Dates
        </PanelButton>
        <PanelButton icon={PlusCircle} onClick={() => setOpen('rate')}>
          Edit Rates
        </PanelButton>
      </div>
      <FormPanel
        open={open === 'block'}
        onOpenChange={(o) => setOpen(o ? 'block' : null)}
        title="Block dates"
        subtitle="Closes the unit to guests for those nights (repairs, owner stay). Refused if a booking or hold is already there."
        submitLabel="Block dates"
        busy={busy}
        onSubmit={() =>
          run(() =>
            blockDates({ unitId: form.unit, from: form.from, to: form.to, note: form.note }),
          )
        }
      >
        {unitField}
        <FieldRow>
          <TextField label="From" type="date" required value={form.from} onChange={set('from')} />
          <TextField
            label="To (check-out day)"
            type="date"
            required
            value={form.to}
            onChange={set('to')}
          />
        </FieldRow>
        <TextField label="Why" value={form.note} onChange={set('note')} maxLength={300} />
      </FormPanel>
      <FormPanel
        open={open === 'rate'}
        onOpenChange={(o) => setOpen(o ? 'rate' : null)}
        title="Nightly rate"
        subtitle="The standard nightly rate guests are quoted for new bookings. Bookings already made keep their price."
        submitLabel="Save rate"
        busy={busy}
        onSubmit={() => run(() => setUnitRate(form.unit, form.rate))}
      >
        {unitField}
        <TextField
          label="Nightly rate (KES)"
          inputMode="numeric"
          required
          value={form.rate}
          onChange={set('rate')}
        />
      </FormPanel>
    </>
  );
}

/** The gold header button that opens the block-dates form for any unit. */
export function UpdateAvailabilityButton({ units }: { units: { id: string; label: string }[] }) {
  const { run, busy } = useRunner();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ unit: '', from: '', to: '', note: '' });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <>
      <HeaderButton icon={PlusCircle} gold onClick={() => setOpen(true)}>
        Update Availability
      </HeaderButton>
      <FormPanel
        open={open}
        onOpenChange={setOpen}
        title="Block dates"
        subtitle="Close a unit to guests for some nights. Rates are edited on the unit's panel."
        submitLabel="Block dates"
        busy={busy}
        onSubmit={() =>
          run(() =>
            blockDates({ unitId: form.unit, from: form.from, to: form.to, note: form.note }),
          )
        }
      >
        <SelectField
          label="Unit"
          required
          value={form.unit}
          onChange={set('unit')}
          placeholder="Choose a unit"
          options={units.map((u) => ({ value: u.id, label: u.label }))}
        />
        <FieldRow>
          <TextField label="From" type="date" required value={form.from} onChange={set('from')} />
          <TextField
            label="To (check-out day)"
            type="date"
            required
            value={form.to}
            onChange={set('to')}
          />
        </FieldRow>
        <TextField label="Why" value={form.note} onChange={set('note')} maxLength={300} />
      </FormPanel>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────── reviews */

export function ReviewControls({
  stayId,
  moderation,
  featured,
}: {
  stayId: string;
  moderation: string;
  featured: boolean;
}) {
  const { run, busy } = useRunner();
  const [open, setOpen] = React.useState(false);
  const [reply, setReply] = React.useState('');
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <PanelButton icon={PlusCircle} onClick={() => setOpen(true)}>
          Respond
        </PanelButton>
        <PanelButton
          icon={ShieldCheck}
          disabled={busy || moderation === 'hidden'}
          onClick={() => run(() => moderateReview(stayId, featured ? 'unfeature' : 'feature'))}
        >
          {featured ? 'Unfeature' : 'Feature Review'}
        </PanelButton>
        {moderation === 'hidden' ? (
          <PanelButton
            icon={CheckCircle2}
            tone="green"
            disabled={busy}
            onClick={() => run(() => moderateReview(stayId, 'publish'))}
          >
            Publish
          </PanelButton>
        ) : (
          <PanelButton
            icon={XCircle}
            tone="red"
            disabled={busy}
            onClick={() => run(() => moderateReview(stayId, 'hide'))}
          >
            Hide
          </PanelButton>
        )}
      </div>
      <FormPanel
        open={open}
        onOpenChange={setOpen}
        title="Respond to this review"
        subtitle="NexG's reply, saved with the review."
        submitLabel="Save reply"
        busy={busy}
        onSubmit={() => run(() => moderateReview(stayId, 'reply', reply))}
      >
        <TextArea
          label="Reply"
          required
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          maxLength={1000}
        />
      </FormPanel>
    </>
  );
}

/** The gold Moderate Review button: opens the first review waiting, or says none is. */
export function ModerateNextButton({ href }: { href: string | null }) {
  return href ? (
    <HeaderButton icon={ShieldCheck} gold href={href}>
      Moderate Review
    </HeaderButton>
  ) : (
    <HeaderButton icon={ShieldCheck} gold disabled>
      Nothing to moderate
    </HeaderButton>
  );
}

/* ─────────────────────────────────────────────────────────────── cases */

export function LogCaseButton({
  label = 'Log Incident / Dispute',
  defaultType = 'incident',
  stayRef = '',
  variant = 'header',
}: {
  label?: string;
  defaultType?: string;
  stayRef?: string;
  variant?: 'header' | 'tile';
}) {
  const { run, busy } = useRunner();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    caseType: defaultType,
    category: 'property',
    title: '',
    description: '',
    stayRef,
    reportedBy: 'guest',
    parties: '',
    amount: '',
    priority: 'medium',
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <>
      {variant === 'header' ? (
        <HeaderButton icon={PlusCircle} gold onClick={() => setOpen(true)}>
          {label}
        </HeaderButton>
      ) : (
        <PanelButton icon={PlusCircle} onClick={() => setOpen(true)}>
          {label}
        </PanelButton>
      )}
      <FormPanel
        open={open}
        onOpenChange={setOpen}
        title="Log an incident, dispute or claim"
        subtitle="Audited. It starts open and assigned to you."
        submitLabel="Log case"
        busy={busy}
        onSubmit={() => run(() => openCase(form))}
      >
        <FieldRow>
          <SelectField
            label="Type"
            required
            value={form.caseType}
            onChange={set('caseType')}
            options={[
              { value: 'incident', label: 'Incident' },
              { value: 'dispute', label: 'Dispute' },
              { value: 'claim', label: 'Claim (refund / damage)' },
            ]}
          />
          <SelectField
            label="Priority"
            required
            value={form.priority}
            onChange={set('priority')}
            options={[
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
              { value: 'urgent', label: 'Urgent' },
            ]}
          />
        </FieldRow>
        <FieldRow>
          <SelectField
            label="Category"
            required
            value={form.category}
            onChange={set('category')}
            options={options(CASE_CATEGORY_LABEL)}
          />
          <SelectField
            label="Reported by"
            required
            value={form.reportedBy}
            onChange={set('reportedBy')}
            options={[
              { value: 'guest', label: 'Guest' },
              { value: 'host', label: 'Host' },
              { value: 'staff', label: 'NexG staff' },
            ]}
          />
        </FieldRow>
        <TextField
          label="Title"
          required
          value={form.title}
          onChange={set('title')}
          maxLength={200}
        />
        <FieldRow>
          <TextField
            label="Booking ref"
            value={form.stayRef}
            onChange={set('stayRef')}
            placeholder="NXG-1A2B3C"
            hint="Links the case to the stay, its unit and host."
          />
          <TextField
            label="Amount (KES)"
            inputMode="numeric"
            value={form.amount}
            onChange={set('amount')}
            hint="For a dispute or claim."
          />
        </FieldRow>
        <TextField
          label="Parties"
          value={form.parties}
          onChange={set('parties')}
          placeholder="Guest vs Host"
          maxLength={120}
        />
        <TextArea
          label="What happened"
          value={form.description}
          onChange={set('description')}
          maxLength={4000}
        />
      </FormPanel>
    </>
  );
}

export function CaseControls({ caseId, status }: { caseId: string; status: string }) {
  const { run, busy } = useRunner();
  const [open, setOpen] = React.useState(false);
  const [next, setNext] = React.useState(status === 'open' ? 'in_progress' : 'resolved');
  const [resolution, setResolution] = React.useState('');
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <PanelButton icon={CheckCircle2} onClick={() => setOpen(true)}>
          Update
        </PanelButton>
        <PanelButton
          icon={ShieldCheck}
          tone="red"
          disabled={busy}
          onClick={() => run(() => updateCase({ caseId, escalate: true, assignToMe: true }))}
        >
          Escalate
        </PanelButton>
      </div>
      <FormPanel
        open={open}
        onOpenChange={setOpen}
        title="Update case"
        subtitle="Resolving or closing needs a resolution; it is audited."
        submitLabel="Save"
        busy={busy}
        onSubmit={() =>
          run(() => updateCase({ caseId, status: next, resolution, assignToMe: true }))
        }
      >
        <SelectField
          label="Status"
          required
          value={next}
          onChange={(e) => setNext(e.target.value)}
          options={options(CASE_STATUS_LABEL)}
        />
        <TextArea
          label="Resolution"
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          maxLength={2000}
        />
      </FormPanel>
    </>
  );
}

/* ─────────────────────────────────────────────────────── growth and partners */

export function AddLeadButton({ managers }: { managers: { id: string; name: string }[] }) {
  const { run, busy } = useRunner();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    name: '',
    phone: '',
    email: '',
    kind: 'host',
    source: 'referral',
    property_name: '',
    area: '',
    units: '',
    next_action: '',
    property_manager_id: '',
    notes: '',
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <>
      <HeaderButton icon={PlusCircle} gold onClick={() => setOpen(true)}>
        Add Lead / Referral
      </HeaderButton>
      <FormPanel
        open={open}
        onOpenChange={setOpen}
        title="Add a lead"
        subtitle="A host, property manager or partner NexG is signing up."
        submitLabel="Add lead"
        busy={busy}
        onSubmit={() => run(() => saveLead(form))}
      >
        <TextField label="Name or company" required value={form.name} onChange={set('name')} />
        <FieldRow>
          <TextField label="Phone" value={form.phone} onChange={set('phone')} />
          <TextField label="Email" type="email" value={form.email} onChange={set('email')} />
        </FieldRow>
        <FieldRow>
          <SelectField
            label="Type"
            value={form.kind}
            onChange={set('kind')}
            options={options(LEAD_KIND_LABEL)}
          />
          <SelectField
            label="Source"
            value={form.source}
            onChange={set('source')}
            options={options(LEAD_SOURCE_LABEL)}
          />
        </FieldRow>
        <FieldRow>
          <TextField
            label="Property / building"
            value={form.property_name}
            onChange={set('property_name')}
          />
          <TextField label="Area" value={form.area} onChange={set('area')} />
        </FieldRow>
        <FieldRow>
          <TextField label="Units" inputMode="numeric" value={form.units} onChange={set('units')} />
          <SelectField
            label="Brought by partner"
            value={form.property_manager_id}
            onChange={set('property_manager_id')}
            placeholder="None"
            options={managers.map((m) => ({ value: m.id, label: m.name }))}
          />
        </FieldRow>
        <TextField label="Next action" value={form.next_action} onChange={set('next_action')} />
      </FormPanel>
    </>
  );
}

export function LeadStatusSelect({ leadId, status }: { leadId: string; status: string }) {
  const { run, busy } = useRunner();
  return (
    <select
      aria-label="Lead status"
      value={status}
      disabled={busy}
      onChange={(e) => run(() => saveLead({ id: leadId, status: e.target.value }))}
      className="border-border-strong bg-surface h-9 rounded-lg border px-2 text-[0.8125rem] font-semibold"
    >
      {Object.entries(LEAD_STATUS_LABEL).map(([value, text]) => (
        <option key={value} value={value}>
          {text}
        </option>
      ))}
    </select>
  );
}

export function AddCampaignButton({ label = 'Create QR Code / Campaign' }: { label?: string }) {
  const { run, busy } = useRunner();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    name: '',
    objective: 'bookings',
    channel: 'social_ads',
    starts_on: '',
    ends_on: '',
    spend_kes: '',
    results: '',
    result_unit: 'bookings',
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <>
      <HeaderButton icon={PlusCircle} gold onClick={() => setOpen(true)}>
        {label}
      </HeaderButton>
      <FormPanel
        open={open}
        onOpenChange={setOpen}
        title="Add a campaign"
        subtitle="Record a stays campaign, what it costs and what it brought. QR cards for units are made on the unit's QR tab."
        submitLabel="Add campaign"
        busy={busy}
        onSubmit={() => run(() => saveCampaign(form))}
      >
        <TextField label="Campaign" required value={form.name} onChange={set('name')} />
        <FieldRow>
          <SelectField
            label="Objective"
            value={form.objective}
            onChange={set('objective')}
            options={options(CAMPAIGN_OBJECTIVE_LABEL)}
          />
          <SelectField
            label="Channel"
            value={form.channel}
            onChange={set('channel')}
            options={options(CAMPAIGN_CHANNEL_LABEL)}
          />
        </FieldRow>
        <FieldRow>
          <TextField
            label="Starts"
            type="date"
            required
            value={form.starts_on}
            onChange={set('starts_on')}
          />
          <TextField label="Ends" type="date" value={form.ends_on} onChange={set('ends_on')} />
        </FieldRow>
        <FieldRow>
          <TextField
            label="Spend (KES)"
            inputMode="numeric"
            value={form.spend_kes}
            onChange={set('spend_kes')}
          />
          <TextField
            label="Results so far"
            inputMode="numeric"
            value={form.results}
            onChange={set('results')}
          />
        </FieldRow>
        <TextField
          label="Results counted in"
          value={form.result_unit}
          onChange={set('result_unit')}
          hint="e.g. bookings, hosts, referrals"
        />
      </FormPanel>
    </>
  );
}

export function CampaignStatus({ id, status }: { id: string; status: string }) {
  const { run, busy } = useRunner();
  return (
    <select
      aria-label="Campaign status"
      value={status}
      disabled={busy}
      onChange={(e) => run(() => saveCampaign({ id, status: e.target.value }))}
      className="border-border-strong bg-surface h-9 rounded-lg border px-2 text-[0.8125rem] font-semibold"
    >
      {['draft', 'active', 'paused', 'ended'].map((s) => (
        <option key={s} value={s}>
          {s.charAt(0).toUpperCase() + s.slice(1)}
        </option>
      ))}
    </select>
  );
}

export function AddPartnerButton() {
  const { run, busy } = useRunner();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    name: '',
    legal_name: '',
    email: '',
    phone: '',
    partner_kind: 'property_manager',
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <>
      <HeaderButton icon={PlusCircle} gold onClick={() => setOpen(true)}>
        Add Partner
      </HeaderButton>
      <FormPanel
        open={open}
        onOpenChange={setOpen}
        title="Add a partner"
        subtitle="A property manager or building partner. Link their buildings on Buildings & Properties."
        submitLabel="Add partner"
        busy={busy}
        onSubmit={() => run(() => savePartner(form))}
      >
        <TextField label="Contact name" required value={form.name} onChange={set('name')} />
        <TextField label="Company" value={form.legal_name} onChange={set('legal_name')} />
        <FieldRow>
          <TextField
            label="Email"
            type="email"
            required
            value={form.email}
            onChange={set('email')}
          />
          <TextField label="Phone" value={form.phone} onChange={set('phone')} />
        </FieldRow>
        <SelectField
          label="Role"
          value={form.partner_kind}
          onChange={set('partner_kind')}
          options={[
            { value: 'property_manager', label: 'Property Manager' },
            { value: 'building_partner', label: 'Building Partner' },
          ]}
        />
      </FormPanel>
    </>
  );
}

export function PartnerControls({ id, status }: { id: string; status: string }) {
  const { run, busy } = useRunner();
  return (
    <div className="grid grid-cols-2 gap-2">
      <PanelButton
        icon={CheckCircle2}
        disabled={busy}
        onClick={() => run(() => savePartner({ id, contacted: true, assign_to_me: true }))}
      >
        Log contact
      </PanelButton>
      <PanelButton
        icon={status === 'active' ? XCircle : CheckCircle2}
        tone={status === 'active' ? 'red' : 'green'}
        disabled={busy}
        onClick={() =>
          run(() => savePartner({ id, status: status === 'active' ? 'paused' : 'active' }))
        }
      >
        {status === 'active' ? 'Pause' : 'Activate'}
      </PanelButton>
    </div>
  );
}

/** Which partner manages a building. */
export function ManagerSelect({
  propertyId,
  managerId,
  managers,
}: {
  propertyId: string;
  managerId: string | null;
  managers: { id: string; name: string }[];
}) {
  const { run, busy } = useRunner();
  return (
    <SelectField
      label="Property manager"
      value={managerId ?? ''}
      disabled={busy}
      onChange={(e) => run(() => setPropertyManager(propertyId, e.target.value))}
      placeholder="None"
      options={managers.map((m) => ({ value: m.id, label: m.name }))}
    />
  );
}

/** A plain button for screens that only need one action. */
export function SimpleAction({
  label: text,
  action,
}: {
  label: string;
  action: () => Promise<{ ok: boolean; message?: string }>;
}) {
  const { run, busy } = useRunner();
  return (
    <Button type="button" variant="outline" disabled={busy} onClick={() => run(action)}>
      {text}
    </Button>
  );
}

/* ─────────────────────────────────────────────────────────── reservations */

/** Create Reservation: a booking taken by phone, at the door or on another site. */
export function CreateReservationButton({
  units,
}: {
  units: { id: string; hostId: string; label: string; rate: number | null }[];
}) {
  const { run, busy } = useRunner();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    unitId: '',
    checkIn: '',
    checkOut: '',
    guest: '',
    phone: '',
    adults: '1',
    children: '0',
    source: 'entered',
    rate: '',
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const unit = units.find((u) => u.id === form.unitId);
  return (
    <>
      <HeaderButton icon={PlusCircle} gold onClick={() => setOpen(true)}>
        Create Reservation
      </HeaderButton>
      <FormPanel
        open={open}
        onOpenChange={setOpen}
        title="Create a reservation"
        subtitle="A booking taken outside NexG checkout. A clash with another booking is saved and flagged for the host, not refused. Guests paying online book on the site."
        submitLabel="Create reservation"
        busy={busy}
        onSubmit={() =>
          run(() =>
            createReservation({
              ...form,
              hostId: unit?.hostId ?? '',
              rate: form.rate || (unit?.rate ? String(unit.rate) : ''),
            }),
          )
        }
      >
        <SelectField
          label="Unit"
          required
          value={form.unitId}
          onChange={set('unitId')}
          placeholder="Choose a unit"
          options={units.map((u) => ({ value: u.id, label: u.label }))}
        />
        <FieldRow>
          <TextField
            label="Check-in"
            type="date"
            required
            value={form.checkIn}
            onChange={set('checkIn')}
          />
          <TextField
            label="Check-out"
            type="date"
            required
            value={form.checkOut}
            onChange={set('checkOut')}
          />
        </FieldRow>
        <FieldRow>
          <TextField
            label="Guest first name"
            required
            value={form.guest}
            onChange={set('guest')}
            maxLength={80}
          />
          <TextField label="Phone" value={form.phone} onChange={set('phone')} />
        </FieldRow>
        <FieldRow>
          <TextField
            label="Adults"
            inputMode="numeric"
            value={form.adults}
            onChange={set('adults')}
          />
          <TextField
            label="Children"
            inputMode="numeric"
            value={form.children}
            onChange={set('children')}
          />
        </FieldRow>
        <FieldRow>
          <SelectField
            label="Source"
            required
            value={form.source}
            onChange={set('source')}
            options={[
              { value: 'entered', label: 'Direct (phone / email)' },
              { value: 'walk_in', label: 'Walk-in' },
              { value: 'airbnb', label: 'Airbnb' },
              { value: 'booking_com', label: 'Booking.com' },
            ]}
          />
          <TextField
            label="Rate per night (KES)"
            inputMode="numeric"
            value={form.rate}
            onChange={set('rate')}
            placeholder={unit?.rate ? String(unit.rate) : ''}
            hint="Empty uses the unit's rate."
          />
        </FieldRow>
      </FormPanel>
    </>
  );
}

'use client';

import { Button, cn, useToast } from '@nexg/ui';
import {
  Ban,
  CalendarClock,
  Eye,
  FileText,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import {
  addSuppression,
  previewCampaign,
  queueAction,
  recordConsent,
  removeSuppression,
  resendMessage,
  saveSchedule,
  saveSender,
  saveSetting,
  saveTemplate,
  saveWorkflow,
  sendCampaign,
  sendManual,
  sendTest,
  setScheduleStatus,
  toggleWorkflow,
  type CampaignInput,
  type Preview,
  type TemplateInput,
  type WorkflowInput,
} from '@/app/communications/actions';
import {
  ConfirmAction,
  FieldRow,
  FormPanel,
  SelectField,
  TextArea,
  TextField,
  useRunner,
} from '@/components/portal/client-kit';
import {
  AUDIENCE_LABEL,
  AUDIENCES,
  CATEGORY_LABEL,
  CHANNEL_LABEL,
  CONSENT_SOURCE_LABEL,
  label,
  renderPreview,
  SAMPLE_VARS,
  smsParts,
  SUPPRESSION_REASON_LABEL,
  WEEKDAY_LABEL,
} from '@/lib/comms';

const options = (labels: Record<string, string>, keys?: string[]) =>
  (keys ?? Object.keys(labels)).map((value) => ({ value, label: labels[value] ?? value }));

/* ─────────────────────────────────────────────────────────── small parts */

/** The designs' gold pill switch, for a row in a table. Saves on change. */
export function PillSwitch({
  checked,
  onChange,
  label: name,
  disabled,
  busy,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={name}
      disabled={disabled || busy}
      onClick={() => onChange(!checked)}
      className={cn(
        'focus-visible:ring-gold relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50',
        checked ? 'bg-[#F5A623]' : 'bg-[#D9D4CA]',
        busy && 'animate-pulse',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

/** A switch for one workflow: custom (wf:<id>), a bell email (kind:<kind>) or an app email group. */
export function WorkflowSwitch({
  id,
  enabled,
  name,
  canEdit,
}: {
  id: string;
  enabled: boolean;
  name: string;
  canEdit: boolean;
}) {
  const { run, busy } = useRunner();
  const [on, setOn] = React.useState(enabled);
  React.useEffect(() => setOn(enabled), [enabled]);
  return (
    <PillSwitch
      checked={on}
      label={`${name}: ${on ? 'on' : 'off'}`}
      disabled={!canEdit}
      busy={busy}
      onChange={async (next) => {
        setOn(next);
        const ok = await run(() => toggleWorkflow(id, next));
        if (!ok) setOn(!next);
      }}
    />
  );
}

/** Ticks for channels or audiences. */
export function CheckList({
  name,
  items,
  value,
  onChange,
  counts,
  columns = 2,
}: {
  name: string;
  items: { value: string; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  counts?: Record<string, number>;
  columns?: 1 | 2 | 3 | 5;
}) {
  return (
    <fieldset>
      <legend className="sr-only">{name}</legend>
      <div
        className={cn(
          'grid gap-2',
          columns === 2 && 'sm:grid-cols-2',
          columns === 3 && 'sm:grid-cols-3',
          columns === 5 && 'grid-cols-2 sm:grid-cols-5',
        )}
      >
        {items.map((it) => {
          const on = value.includes(it.value);
          return (
            <label
              key={it.value}
              className={cn(
                'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3 text-[0.875rem] font-semibold',
                on ? 'border-[#F5D27A] bg-[#FFFBF0]' : 'border-border',
              )}
            >
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#F5A623]"
                checked={on}
                onChange={(e) =>
                  onChange(
                    e.target.checked ? [...value, it.value] : value.filter((v) => v !== it.value),
                  )
                }
              />
              <span className="min-w-0 flex-1">{it.label}</span>
              {counts && counts[it.value] != null && (
                <span className="text-muted tabular-nums">
                  ({counts[it.value]!.toLocaleString('en-KE')})
                </span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

const CHANNEL_OPTIONS = (['email', 'sms', 'whatsapp', 'in_app'] as const).map((c) => ({
  value: c,
  label: CHANNEL_LABEL[c]!,
}));
const AUDIENCE_OPTIONS = AUDIENCES.map((a) => ({ value: a, label: AUDIENCE_LABEL[a]! }));

/** The outlined gold action under a panel. */
export function PanelButton({
  icon: Icon,
  children,
  onClick,
  disabled,
  type = 'button',
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="focus-visible:ring-gold inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#F5D27A] bg-[#FFFBF0] px-3 text-[0.875rem] font-bold text-[#8A5C00] transition-colors hover:bg-[#FFF4D6] focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50"
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
      {children}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────── test send */

/** Send a test on one channel to an address the staff member types. */
export function TestSendForm({
  channel,
  templates = [],
  placeholder,
  canEdit,
  cta,
}: {
  channel: 'email' | 'sms' | 'whatsapp' | 'in_app';
  templates?: { id: string; name: string }[];
  placeholder?: string;
  canEdit: boolean;
  cta?: string;
}) {
  const { run, busy } = useRunner();
  const [to, setTo] = React.useState('');
  const [tpl, setTpl] = React.useState('');
  const [done, setDone] = React.useState<string | null>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run(() => sendTest({ channel, recipient: to, template_id: tpl || null }));
        if (ok) setDone(channel === 'in_app' ? 'your own bell' : to);
      }}
    >
      {channel !== 'in_app' && (
        <TextField
          label={channel === 'email' ? 'Send to' : 'Recipient Number'}
          required
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder={placeholder ?? (channel === 'email' ? 'you@nexgapp.com' : '+254 7…')}
          type={channel === 'email' ? 'email' : 'tel'}
          disabled={!canEdit}
        />
      )}
      {templates.length > 0 && (
        <SelectField
          label="Template"
          value={tpl}
          onChange={(e) => setTpl(e.target.value)}
          placeholder="A plain test message"
          options={templates.map((t) => ({ value: t.id, label: t.name }))}
          disabled={!canEdit}
        />
      )}
      <Button
        type="submit"
        variant="gold"
        block
        loading={busy}
        disabled={!canEdit}
        leadingIcon={<Send className="h-4 w-4" />}
      >
        {cta ??
          `Send Test ${channel === 'email' ? 'Email' : channel === 'in_app' ? 'Notification' : 'Message'}`}
      </Button>
      {done && (
        <p
          role="status"
          className="rounded-lg bg-[#E3F5E6] p-3 text-[0.8125rem] font-semibold text-[#1E7B34]"
        >
          Test queued for {done}. Check the Delivery Logs to see it go out; if the provider is not
          connected it will wait there with the reason.
        </p>
      )}
    </form>
  );
}

/* ─────────────────────────────────────────────────────────── templates */

export interface TemplateRow {
  id: string;
  name: string;
  audience: string;
  category: string;
  purpose: string;
  trigger_label: string | null;
  channels: string[];
  status: string;
  email_subject: string | null;
  email_body: string | null;
  sms_body: string | null;
  whatsapp_body: string | null;
  push_title: string | null;
  push_body: string | null;
}

const EMPTY_TEMPLATE: TemplateInput = {
  name: '',
  audience: 'guests',
  category: 'promotions',
  purpose: 'marketing',
  trigger_label: '',
  channels: ['email'],
  status: 'draft',
  email_subject: '',
  email_body: '',
  sms_body: '',
  whatsapp_body: '',
  push_title: '',
  push_body: '',
};

const VARIABLES = ['first_name', 'name', 'city'];

/** The right-hand editor on Message Templates: one template, its words per channel, preview and test. */
export function TemplateEditor({
  template,
  canEdit,
  newHref,
}: {
  template: TemplateRow | null;
  canEdit: boolean;
  newHref: string;
}) {
  const router = useRouter();
  const { run, busy } = useRunner();
  const [t, setT] = React.useState<TemplateInput>(() => fromRow(template));
  const [tab, setTab] = React.useState<'email' | 'sms' | 'whatsapp' | 'in_app'>('email');
  const [preview, setPreview] = React.useState(false);
  const [testTo, setTestTo] = React.useState('');
  React.useEffect(() => setT(fromRow(template)), [template]);
  const set = (k: keyof TemplateInput, v: unknown) => setT((x) => ({ ...x, [k]: v }));
  const bodyKey = {
    email: 'email_body',
    sms: 'sms_body',
    whatsapp: 'whatsapp_body',
    in_app: 'push_body',
  }[tab] as keyof TemplateInput;
  const body = (t[bodyKey] as string) ?? '';
  const sms = smsParts(t.sms_body ?? '');
  const insert = (v: string) => set(bodyKey, `${body}{{${v}}}`);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run(() => saveTemplate({ ...t, id: template?.id ?? null }));
        if (ok && !template) router.push(newHref.replace(/selected=[^&]*/, ''));
      }}
    >
      <TextField
        label="Template Name"
        required
        value={t.name}
        onChange={(e) => set('name', e.target.value)}
        disabled={!canEdit}
        maxLength={120}
      />
      <FieldRow>
        <SelectField
          label="Audience"
          required
          value={t.audience}
          onChange={(e) => set('audience', e.target.value)}
          options={options({ ...AUDIENCE_LABEL }, [...AUDIENCES, 'all'])}
          disabled={!canEdit}
        />
        <SelectField
          label="Category"
          required
          value={t.category}
          onChange={(e) => set('category', e.target.value)}
          options={options(CATEGORY_LABEL)}
          disabled={!canEdit}
        />
      </FieldRow>
      <FieldRow>
        <TextField
          label="Trigger / Event"
          value={t.trigger_label ?? ''}
          onChange={(e) => set('trigger_label', e.target.value)}
          placeholder="Booking successful"
          disabled={!canEdit}
          maxLength={120}
        />
        <SelectField
          label="Purpose"
          value={t.purpose}
          onChange={(e) => set('purpose', e.target.value)}
          options={[
            { value: 'marketing', label: 'Marketing (consent needed)' },
            { value: 'operational', label: 'Operational (service message)' },
          ]}
          disabled={!canEdit}
        />
      </FieldRow>
      <div>
        <p className="mb-1.5 text-sm font-bold">Channels</p>
        <CheckList
          name="Channels"
          items={CHANNEL_OPTIONS}
          value={t.channels}
          onChange={(v) => set('channels', v)}
        />
      </div>
      <p className="pt-1 text-[1rem] font-extrabold">Message Content</p>
      <div role="tablist" aria-label="Channel" className="border-border flex gap-1 border-b">
        {CHANNEL_OPTIONS.map((c) => (
          <button
            key={c.value}
            type="button"
            role="tab"
            aria-selected={tab === c.value}
            onClick={() => setTab(c.value)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-[0.875rem] font-bold',
              tab === c.value ? 'border-[#F5A623] text-[#8A5C00]' : 'text-muted border-transparent',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      {tab === 'email' && (
        <TextField
          label="Email Subject"
          value={t.email_subject ?? ''}
          onChange={(e) => set('email_subject', e.target.value)}
          placeholder="Your NexG booking is confirmed – {{first_name}}"
          disabled={!canEdit}
          maxLength={200}
        />
      )}
      {tab === 'in_app' && (
        <TextField
          label="Notification title"
          value={t.push_title ?? ''}
          onChange={(e) => set('push_title', e.target.value)}
          disabled={!canEdit}
          maxLength={80}
        />
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold">
          {tab === 'email'
            ? 'Email Message'
            : tab === 'in_app'
              ? 'Notification text'
              : `${CHANNEL_LABEL[tab]} Message`}
        </span>
        <select
          aria-label="Insert a variable"
          value=""
          onChange={(e) => e.target.value && insert(e.target.value)}
          className="border-border rounded-lg border px-2 py-1 text-[0.8125rem] font-semibold"
          disabled={!canEdit}
        >
          <option value="">Insert Variable {'{ }'}</option>
          {VARIABLES.map((v) => (
            <option key={v} value={v}>{`{{${v}}}`}</option>
          ))}
        </select>
      </div>
      <textarea
        aria-label="Message"
        value={body}
        onChange={(e) => set(bodyKey, e.target.value)}
        rows={tab === 'email' ? 9 : 5}
        maxLength={tab === 'sms' ? 640 : tab === 'in_app' ? 400 : 10000}
        disabled={!canEdit}
        className="border-border-strong focus:ring-gold w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
      />
      {tab === 'sms' && (
        <p className="text-muted text-xs font-semibold">
          {sms.chars} characters · {sms.parts} SMS part{sms.parts === 1 ? '' : 's'} per person. A
          marketing SMS also gets a short opt-out link.
        </p>
      )}
      {t.purpose === 'marketing' && (
        <p className="text-muted text-xs">
          Marketing goes only to people who said yes to marketing on that channel, and every message
          carries an opt-out link (Kenya Data Protection Act 2019).
        </p>
      )}
      {preview && (
        <div className="bg-bg rounded-xl p-3 text-sm">
          {tab === 'email' && t.email_subject && (
            <p className="mb-2 font-extrabold">{renderPreview(t.email_subject, SAMPLE_VARS)}</p>
          )}
          <p className="whitespace-pre-wrap">{renderPreview(body, SAMPLE_VARS) || '—'}</p>
        </div>
      )}
      <FieldRow>
        <SelectField
          label="Status"
          value={t.status}
          onChange={(e) => set('status', e.target.value)}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'draft', label: 'Draft' },
            { value: 'inactive', label: 'Inactive' },
          ]}
          disabled={!canEdit}
        />
        <TextField
          label={
            tab === 'email'
              ? 'Test to (email)'
              : tab === 'in_app'
                ? 'Test goes to your bell'
                : 'Test to (phone)'
          }
          value={testTo}
          onChange={(e) => setTestTo(e.target.value)}
          disabled={!canEdit || tab === 'in_app'}
          placeholder={tab === 'email' ? 'you@nexgapp.com' : '+254 7…'}
        />
      </FieldRow>
      <div className="grid grid-cols-3 gap-2">
        <Button
          type="button"
          variant="outline"
          leadingIcon={<Eye className="h-4 w-4" />}
          onClick={() => setPreview((p) => !p)}
        >
          Preview
        </Button>
        <Button
          type="button"
          variant="outline"
          leadingIcon={<Send className="h-4 w-4" />}
          disabled={!canEdit || !template || busy}
          title={!template ? 'Save the template first' : undefined}
          onClick={() =>
            void run(() =>
              sendTest({ channel: tab, recipient: testTo, template_id: template?.id ?? null }),
            )
          }
        >
          Test Send
        </Button>
        <Button
          type="submit"
          variant="gold"
          loading={busy}
          disabled={!canEdit}
          leadingIcon={<Save className="h-4 w-4" />}
        >
          Save
        </Button>
      </div>
    </form>
  );
}

function fromRow(row: TemplateRow | null): TemplateInput {
  if (!row) return { ...EMPTY_TEMPLATE };
  return {
    id: row.id,
    name: row.name,
    audience: row.audience,
    category: row.category,
    purpose: row.purpose,
    trigger_label: row.trigger_label ?? '',
    channels: row.channels,
    status: row.status,
    email_subject: row.email_subject ?? '',
    email_body: row.email_body ?? '',
    sms_body: row.sms_body ?? '',
    whatsapp_body: row.whatsapp_body ?? '',
    push_title: row.push_title ?? '',
    push_body: row.push_body ?? '',
  };
}

/* ─────────────────────────────────────────────────────────── workflows */

export interface WorkflowRow {
  id: string;
  name: string;
  trigger_kind: string;
  condition: string;
  template_id: string;
  channels: string[];
  delay_minutes: number;
  follow_up_template_id: string | null;
  follow_up_after_minutes: number | null;
  enabled: boolean;
}

/** "Create Workflow" and "Edit": the trigger, the condition, what it sends and the follow-up. */
export function WorkflowEditor({
  workflow,
  kinds,
  templates,
  canEdit,
  trigger,
}: {
  workflow: WorkflowRow | null;
  kinds: string[];
  templates: { id: string; name: string; channels: string[]; purpose: string }[];
  canEdit: boolean;
  trigger: 'create' | 'edit';
}) {
  const { run, busy } = useRunner();
  const [open, setOpen] = React.useState(false);
  const blank: WorkflowInput = {
    name: '',
    trigger_kind: kinds[0] ?? '',
    condition: 'none',
    template_id: templates[0]?.id ?? '',
    channels: ['email'],
    delay_minutes: 0,
    follow_up_template_id: null,
    follow_up_after_minutes: null,
    enabled: false,
  };
  const [w, setW] = React.useState<WorkflowInput>(blank);
  const set = (k: keyof WorkflowInput, v: unknown) => setW((x) => ({ ...x, [k]: v }));
  const tpl = templates.find((t) => t.id === w.template_id);
  return (
    <>
      {trigger === 'create' ? (
        <Button
          variant="gold"
          size="sm"
          leadingIcon={<Plus className="h-4 w-4" />}
          disabled={!canEdit || templates.length === 0}
          title={templates.length === 0 ? 'Add an active template first' : undefined}
          onClick={() => {
            setW(blank);
            setOpen(true);
          }}
        >
          Create Workflow
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={!canEdit}
          onClick={() => {
            if (workflow) setW({ ...workflow });
            setOpen(true);
          }}
        >
          Edit
        </Button>
      )}
      <FormPanel
        open={open}
        onOpenChange={setOpen}
        title={workflow && trigger === 'edit' ? 'Edit workflow' : 'Create workflow'}
        subtitle="When a NexG event rings someone's bell, send them a template."
        submitLabel="Save workflow"
        busy={busy}
        onSubmit={() =>
          run(() => saveWorkflow({ ...w, id: trigger === 'edit' ? workflow?.id : null }))
        }
      >
        <TextField
          label="Name"
          required
          value={w.name}
          onChange={(e) => set('name', e.target.value)}
          maxLength={120}
        />
        <SelectField
          label="Trigger (the event)"
          required
          value={w.trigger_kind}
          onChange={(e) => set('trigger_kind', e.target.value)}
          options={kinds.map((k) => ({ value: k, label: k }))}
          hint="Every event NexG rings a bell for. The workflow sends to the person whose bell rang."
        />
        <SelectField
          label="Condition"
          value={tpl?.purpose === 'marketing' ? 'marketing_consent' : w.condition}
          onChange={(e) => set('condition', e.target.value)}
          options={[
            { value: 'none', label: 'Always (service message)' },
            { value: 'marketing_consent', label: 'Only if they said yes to marketing' },
          ]}
          disabled={tpl?.purpose === 'marketing'}
          hint={
            tpl?.purpose === 'marketing'
              ? 'A marketing template always needs their yes.'
              : undefined
          }
        />
        <SelectField
          label="Send this template"
          required
          value={w.template_id}
          onChange={(e) => {
            const next = templates.find((t) => t.id === e.target.value);
            setW((x) => ({
              ...x,
              template_id: e.target.value,
              condition: next?.purpose === 'marketing' ? 'marketing_consent' : x.condition,
              channels: x.channels.filter((c) => next?.channels.includes(c)),
            }));
          }}
          options={templates.map((t) => ({ value: t.id, label: t.name }))}
        />
        <div>
          <p className="mb-1.5 text-sm font-bold">On these channels</p>
          <CheckList
            name="Channels"
            items={CHANNEL_OPTIONS.filter((c) => tpl?.channels.includes(c.value))}
            value={w.channels}
            onChange={(v) => set('channels', v)}
          />
        </div>
        <TextField
          label="Wait before sending (minutes)"
          type="number"
          min={0}
          max={43200}
          value={String(w.delay_minutes)}
          onChange={(e) => set('delay_minutes', Number(e.target.value) || 0)}
          hint="0 sends straight away. Push & in-app always goes straight away."
        />
        <FieldRow>
          <SelectField
            label="Follow-up template"
            value={w.follow_up_template_id ?? ''}
            onChange={(e) => set('follow_up_template_id', e.target.value || null)}
            placeholder="No follow-up"
            options={templates.map((t) => ({ value: t.id, label: t.name }))}
          />
          <TextField
            label="Follow up after (minutes)"
            type="number"
            min={1}
            max={43200}
            value={w.follow_up_after_minutes == null ? '' : String(w.follow_up_after_minutes)}
            onChange={(e) =>
              set('follow_up_after_minutes', e.target.value ? Number(e.target.value) : null)
            }
            disabled={!w.follow_up_template_id}
          />
        </FieldRow>
        <label className="flex items-center gap-2.5 text-sm font-bold">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[#F5A623]"
            checked={w.enabled}
            onChange={(e) => set('enabled', e.target.checked)}
          />
          Switch it on now
        </label>
      </FormPanel>
    </>
  );
}

/* ───────────────────────────────────────────────────────── bulk sending */

interface ComposeTemplate {
  id: string;
  name: string;
  channels: string[];
  email_subject: string | null;
  email_body: string | null;
  sms_body: string | null;
}

/**
 * Compose → Preview the audience → Confirm. The confirm names how many people
 * get it and how many are left out because they have not said yes to
 * marketing; the server refuses if that number moved in between.
 */
export function Composer({
  audiences,
  templates,
  cityId,
  cityName,
  canSend,
  canEdit,
}: {
  audiences: Record<string, number>;
  templates: ComposeTemplate[];
  cityId: string | null;
  cityName: string | null;
  canSend: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { run, busy } = useRunner();
  const [type, setType] = React.useState<'bulk' | 'manual' | 'announcement'>('bulk');
  const [channels, setChannels] = React.useState<string[]>(['email']);
  const [aud, setAud] = React.useState<string[]>(['guests']);
  const [name, setName] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [body, setBody] = React.useState('');
  const [tpl, setTpl] = React.useState('');
  const [to, setTo] = React.useState('');
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [tab, setTab] = React.useState<'email' | 'sms' | 'whatsapp' | 'in_app'>('email');

  const input = (): CampaignInput => ({
    name: name || subject || 'Bulk message',
    kind: type === 'announcement' ? 'announcement' : 'bulk',
    audiences: aud,
    channels,
    city_id: cityId,
    template_id: tpl || null,
    subject,
    body,
  });

  React.useEffect(() => setPreview(null), [type, channels, aud, tpl, cityId]);

  const check = async () => {
    setChecking(true);
    const r = await previewCampaign(input());
    setChecking(false);
    if (!r.ok) {
      toast({ tone: 'danger', title: 'Not checked', description: r.message });
      return;
    }
    setPreview(r.data as Preview);
  };

  const words = renderPreview(body, SAMPLE_VARS);
  const manual = type === 'manual';

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
      {/* Compose */}
      <section aria-label="Compose message" className="space-y-3">
        <p className="text-sm font-bold">Message Type</p>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ['bulk', 'Bulk Message'],
              ['manual', 'Manual Message'],
              ['announcement', 'Announcement'],
            ] as const
          ).map(([k, text]) => (
            <button
              key={k}
              type="button"
              aria-pressed={type === k}
              onClick={() => setType(k)}
              className={cn(
                'min-h-11 rounded-xl border px-2 text-[0.8125rem] font-bold',
                type === k ? 'border-[#F5A623] bg-[#FFF4D6] text-[#8A5C00]' : 'border-border',
              )}
            >
              {text}
            </button>
          ))}
        </div>
        <div>
          <p className="mb-1.5 text-sm font-bold">Channel(s)</p>
          <CheckList
            name="Channels"
            items={manual ? CHANNEL_OPTIONS.filter((c) => c.value !== 'in_app') : CHANNEL_OPTIONS}
            value={channels}
            onChange={setChannels}
          />
        </div>
        {!manual && templates.length > 0 && (
          <SelectField
            label="Start from a template"
            value={tpl}
            placeholder="Write it here"
            onChange={(e) => {
              setTpl(e.target.value);
              const t = templates.find((x) => x.id === e.target.value);
              if (t) {
                setSubject(t.email_subject ?? '');
                setBody(t.email_body ?? t.sms_body ?? '');
                setName(t.name);
              }
            }}
            options={templates.map((t) => ({ value: t.id, label: t.name }))}
          />
        )}
        {manual && (
          <TextField
            label="Send to (email or phone)"
            required
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="name@example.com or +254 7…"
          />
        )}
        <TextField
          label="Name (for the history)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="NexG Weekend Deals"
          maxLength={160}
        />
        {channels.includes('email') && (
          <TextField
            label="Subject (Email)"
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
          />
        )}
        <TextArea
          label="Message Content"
          required={!tpl}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={7}
          maxLength={1000}
          hint={`${body.length} / 1,000 · {{first_name}}, {{name}} and {{city}} are filled per person${tpl ? '. With a template, each channel uses the template’s own words' : ''}.`}
        />
      </section>

      {/* Audience */}
      <section aria-label="Select audience" className="space-y-3">
        {manual ? (
          <div className="bg-bg rounded-xl p-4 text-sm leading-relaxed">
            <p className="font-extrabold">A one-off service message</p>
            <p className="text-muted mt-1">
              For a person who asked to be told something, or a correction. It is not marketing, so
              no marketing consent is needed, but it is not sent to an address on a suppression list
              or to someone who turned that channel off.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm font-bold">
              Choose who will receive this message{cityName ? ` in ${cityName}` : ''}
            </p>
            <CheckList
              name="Audiences"
              items={AUDIENCE_OPTIONS}
              value={aud}
              onChange={setAud}
              counts={cityId ? undefined : audiences}
              columns={1}
            />
            <p className="text-muted text-xs leading-relaxed">
              The numbers are everyone in each group. Only those who said yes to marketing on a
              channel get it there; Check audience shows exactly who.
            </p>
            {preview && (
              <div className="rounded-xl border border-[#F5D27A] bg-[#FFFBF0] p-3 text-sm">
                <p className="font-extrabold">
                  {preview.reachable.toLocaleString('en-KE')} of{' '}
                  {preview.people.toLocaleString('en-KE')} people will get it (
                  {preview.messages.toLocaleString('en-KE')} messages)
                </p>
                <ul className="text-muted mt-1 space-y-0.5 text-[0.8125rem] font-semibold">
                  <li>
                    {preview.no_consent.toLocaleString('en-KE')} left out: no yes to marketing
                  </li>
                  <li>
                    {preview.suppressed.toLocaleString('en-KE')} left out: on a suppression list
                  </li>
                  <li>
                    {preview.no_address.toLocaleString('en-KE')} left out: no address for those
                    channels
                  </li>
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      {/* Preview */}
      <section aria-label="Message preview" className="space-y-3">
        <p className="text-sm font-bold">Message Preview</p>
        <div role="tablist" aria-label="Preview channel" className="flex gap-1">
          {CHANNEL_OPTIONS.map((c) => (
            <button
              key={c.value}
              type="button"
              role="tab"
              aria-selected={tab === c.value}
              onClick={() => setTab(c.value)}
              className={cn(
                'rounded-lg px-2.5 py-1.5 text-[0.8125rem] font-bold',
                tab === c.value ? 'bg-[#FFF4D6] text-[#8A5C00]' : 'text-muted',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="border-border overflow-hidden rounded-2xl border">
          <div className="bg-[#141414] px-4 py-3 text-center text-[1.125rem] font-extrabold tracking-wide text-[#F5C842]">
            NEXG
          </div>
          <div className="space-y-2 p-4 text-sm">
            {tab === 'email' && subject && (
              <p className="font-extrabold">{renderPreview(subject, SAMPLE_VARS)}</p>
            )}
            <p className="whitespace-pre-wrap leading-relaxed">
              {words || 'Your message shows here.'}
            </p>
            {!manual && (
              <p className="text-muted border-border border-t pt-2 text-[0.75rem]">
                {tab === 'email'
                  ? 'Stop them: nexgapp.com/u/… (added to every marketing message)'
                  : tab === 'in_app'
                    ? 'Shown in the NexG bell and as a browser push where allowed.'
                    : 'Opt out: nexgapp.com/u/…'}
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-2 lg:col-span-3">
        {!manual && (
          <Button
            variant="outline"
            leadingIcon={<CalendarClock className="h-4 w-4" />}
            onClick={() => router.push('/communications/scheduled')}
          >
            Schedule Message
          </Button>
        )}
        {manual ? (
          <ConfirmAction
            tone="black"
            title={`Send to ${to || 'this address'}?`}
            body="It goes out with the next dispatch run, within a minute."
            confirmLabel="Send"
            onConfirm={async () => {
              const ok = await run(() =>
                sendManual({
                  recipient: to,
                  channels,
                  subject,
                  body,
                  name: name || 'Manual message',
                }),
              );
              if (ok) setBody('');
              return ok;
            }}
            trigger={
              <Button
                variant="gold"
                disabled={!canEdit || !to || !body}
                leadingIcon={<Send className="h-4 w-4" />}
              >
                Send Now
              </Button>
            }
          />
        ) : preview ? (
          <ConfirmAction
            tone="black"
            title={`Send to ${preview.reachable.toLocaleString('en-KE')} people?`}
            body={
              <>
                {preview.messages.toLocaleString('en-KE')} message(s) on{' '}
                {channels.map((c) => label(CHANNEL_LABEL, c)).join(', ')}.{' '}
                {preview.no_consent.toLocaleString('en-KE')} people are left out because they have
                not said yes to marketing. This cannot be called back once sent.
              </>
            }
            confirmLabel="Yes, send"
            onConfirm={async () => {
              const r = await sendCampaign(input(), preview.reachable);
              if (!r.ok) {
                toast({ tone: 'danger', title: 'Not sent', description: r.message });
                if (r.data) setPreview(r.data as Preview);
                return false;
              }
              toast({ tone: 'success', title: 'Sent', description: r.message });
              setPreview(null);
              setBody('');
              router.refresh();
              return true;
            }}
            trigger={
              <Button
                variant="gold"
                disabled={!canSend || preview.reachable === 0}
                leadingIcon={<Send className="h-4 w-4" />}
              >
                Send Now
              </Button>
            }
          />
        ) : (
          <Button
            variant="gold"
            loading={checking || busy}
            disabled={!canSend || aud.length === 0 || channels.length === 0 || (!body && !tpl)}
            title={!canSend ? 'Sending to an audience needs full Communications access' : undefined}
            leadingIcon={<Eye className="h-4 w-4" />}
            onClick={() => void check()}
          >
            Check audience
          </Button>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────── scheduling */

/** "Schedule a Message": template or words, audience, channels, once or recurring. */
export function ScheduleForm({
  templates,
  cityId,
  canSend,
}: {
  templates: { id: string; name: string; channels: string[] }[];
  cityId: string | null;
  canSend: boolean;
}) {
  const { run, busy } = useRunner();
  const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
  const blank = {
    name: '',
    template_id: templates[0]?.id ?? '',
    body: '',
    subject: '',
    audiences: ['guests'] as string[],
    channels: ['email'] as string[],
    kind: 'recurring' as 'one_time' | 'recurring',
    frequency: 'weekly',
    weekday: 5,
    monthday: 1,
    time_of_day: '16:00',
    run_date: today,
    starts_on: today,
    ends_on: '',
  };
  const [s, setS] = React.useState(blank);
  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) =>
    setS((x) => ({ ...x, [k]: v }));
  const tpl = templates.find((t) => t.id === s.template_id);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run(() =>
          saveSchedule({
            name: s.name || tpl?.name || 'Scheduled message',
            template_id: s.template_id || null,
            subject: s.subject,
            body: s.body,
            audiences: s.audiences,
            channels: s.channels,
            city_id: cityId,
            kind: s.kind,
            run_at: s.kind === 'one_time' ? `${s.run_date}T${s.time_of_day}:00+03:00` : null,
            frequency: s.kind === 'recurring' ? s.frequency : null,
            weekday: s.frequency === 'weekly' ? s.weekday : null,
            monthday: s.frequency === 'monthly' ? s.monthday : null,
            time_of_day: s.time_of_day,
            starts_on: s.kind === 'recurring' ? s.starts_on : null,
            ends_on: s.kind === 'recurring' && s.ends_on ? s.ends_on : null,
          }),
        );
        if (ok) setS(blank);
      }}
    >
      <TextField
        label="Name"
        value={s.name}
        onChange={(e) => set('name', e.target.value)}
        placeholder={tpl?.name ?? 'Weekend picks'}
        maxLength={120}
      />
      <SelectField
        label="Message Template"
        required={!s.body}
        value={s.template_id}
        placeholder="None: write it below"
        onChange={(e) => set('template_id', e.target.value)}
        options={templates.map((t) => ({ value: t.id, label: t.name }))}
      />
      {!s.template_id && (
        <>
          <TextField
            label="Subject (email)"
            value={s.subject}
            onChange={(e) => set('subject', e.target.value)}
            maxLength={200}
          />
          <TextArea
            label="Message"
            required
            value={s.body}
            onChange={(e) => set('body', e.target.value)}
            rows={4}
            maxLength={1000}
          />
        </>
      )}
      <div>
        <p className="mb-1.5 text-sm font-bold">Audience *</p>
        <CheckList
          name="Audience"
          items={AUDIENCE_OPTIONS}
          value={s.audiences}
          onChange={(v) => set('audiences', v)}
          columns={1}
        />
      </div>
      <div>
        <p className="mb-1.5 text-sm font-bold">Channels *</p>
        <CheckList
          name="Channels"
          items={
            tpl ? CHANNEL_OPTIONS.filter((c) => tpl.channels.includes(c.value)) : CHANNEL_OPTIONS
          }
          value={s.channels}
          onChange={(v) => set('channels', v)}
        />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-bold">Schedule *</legend>
        <div className="flex gap-4 text-sm font-semibold">
          {(['one_time', 'recurring'] as const).map((k) => (
            <label key={k} className="flex items-center gap-2">
              <input
                type="radio"
                name="kind"
                className="accent-[#F5A623]"
                checked={s.kind === k}
                onChange={() => set('kind', k)}
              />
              {k === 'one_time' ? 'One-time' : 'Recurring'}
            </label>
          ))}
        </div>
      </fieldset>
      {s.kind === 'one_time' ? (
        <FieldRow>
          <TextField
            label="Date"
            type="date"
            required
            min={today}
            value={s.run_date}
            onChange={(e) => set('run_date', e.target.value)}
          />
          <TextField
            label="Time (Nairobi)"
            type="time"
            required
            value={s.time_of_day}
            onChange={(e) => set('time_of_day', e.target.value)}
          />
        </FieldRow>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <SelectField
              label="Frequency"
              value={s.frequency}
              onChange={(e) => set('frequency', e.target.value)}
              options={[
                { value: 'daily', label: 'Daily' },
                { value: 'weekly', label: 'Weekly' },
                { value: 'monthly', label: 'Monthly' },
              ]}
            />
            {s.frequency === 'weekly' ? (
              <SelectField
                label="Day"
                value={String(s.weekday)}
                onChange={(e) => set('weekday', Number(e.target.value))}
                options={WEEKDAY_LABEL.map((d, i) => ({ value: String(i + 1), label: d }))}
              />
            ) : s.frequency === 'monthly' ? (
              <SelectField
                label="Day"
                value={String(s.monthday)}
                onChange={(e) => set('monthday', Number(e.target.value))}
                options={Array.from({ length: 28 }, (_, i) => ({
                  value: String(i + 1),
                  label: String(i + 1),
                }))}
              />
            ) : (
              <span />
            )}
            <TextField
              label="Time"
              type="time"
              required
              value={s.time_of_day}
              onChange={(e) => set('time_of_day', e.target.value)}
            />
          </div>
          <FieldRow>
            <TextField
              label="Start Date"
              type="date"
              value={s.starts_on}
              min={today}
              onChange={(e) => set('starts_on', e.target.value)}
            />
            <TextField
              label="End Date (optional)"
              type="date"
              value={s.ends_on}
              min={s.starts_on}
              onChange={(e) => set('ends_on', e.target.value)}
            />
          </FieldRow>
        </>
      )}
      <p className="text-muted text-xs leading-relaxed">
        Scheduled messages are marketing: each run goes only to people who said yes on that channel
        at the time it runs, never to a suppressed address.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={() => setS(blank)}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="gold"
          loading={busy}
          disabled={!canSend}
          title={!canSend ? 'Needs full Communications access' : undefined}
        >
          Save Schedule
        </Button>
      </div>
    </form>
  );
}

export function ScheduleActions({
  id,
  status,
  canEdit,
}: {
  id: string;
  status: string;
  canEdit: boolean;
}) {
  const { run, busy } = useRunner();
  if (!canEdit || status === 'cancelled' || status === 'completed') return null;
  return (
    <span className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() =>
          void run(() => setScheduleStatus(id, status === 'paused' ? 'scheduled' : 'paused'))
        }
      >
        {status === 'paused' ? 'Resume' : 'Pause'}
      </Button>
      <ConfirmAction
        title="Cancel this schedule?"
        body="Nothing more is sent from it. The runs already sent stay in the history."
        confirmLabel="Cancel schedule"
        onConfirm={() => run(() => setScheduleStatus(id, 'cancelled'))}
        trigger={
          <Button variant="ghost" size="sm" aria-label="Cancel schedule">
            <Trash2 className="h-4 w-4" />
          </Button>
        }
      />
    </span>
  );
}

/* ───────────────────────────────────────────────────── queue and logs */

export function QueueActions({
  id,
  status,
  canEdit,
}: {
  id: string;
  status: string;
  canEdit: boolean;
}) {
  const { run, busy } = useRunner();
  if (!canEdit || status === 'sent') return null;
  return (
    <span className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        aria-label="Try again now"
        onClick={() => void run(() => queueAction(id, 'retry'))}
      >
        <RotateCcw className="h-4 w-4" />
      </Button>
      {status !== 'failed' && (
        <ConfirmAction
          title="Cancel this message?"
          body="It will not be sent. The log keeps a record that staff cancelled it."
          confirmLabel="Cancel message"
          onConfirm={() => run(() => queueAction(id, 'cancel'))}
          trigger={
            <Button variant="ghost" size="sm" aria-label="Cancel message">
              <Ban className="h-4 w-4" />
            </Button>
          }
        />
      )}
    </span>
  );
}

export function ResendButton({
  logId,
  canEdit,
  resendable,
}: {
  logId: string;
  canEdit: boolean;
  resendable: boolean;
}) {
  const { run, busy } = useRunner();
  return (
    <ConfirmAction
      tone="black"
      title="Send this message again?"
      body="The same words go to the same address. A message that held a one-time code cannot be sent again."
      confirmLabel="Resend"
      onConfirm={() => run(() => resendMessage(logId))}
      trigger={
        <Button
          variant="outline"
          block
          disabled={!canEdit || !resendable || busy}
          leadingIcon={<Send className="h-4 w-4" />}
        >
          Resend
        </Button>
      }
    />
  );
}

/** Opens a message's words or raw record in a drawer. */
export function ViewText({
  title,
  text,
  icon = FileText,
}: {
  title: string;
  text: string;
  icon?: LucideIcon;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <PanelButton icon={icon} onClick={() => setOpen(true)}>
        {title}
      </PanelButton>
      <FormPanel
        open={open}
        onOpenChange={setOpen}
        title={title}
        submitLabel="Close"
        onSubmit={async () => true}
      >
        <pre className="bg-bg max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-xl p-3 text-[0.8125rem]">
          {text}
        </pre>
      </FormPanel>
    </>
  );
}

/* ──────────────────────────────────────────────────────────── settings */

export function RetryForm({
  value,
  canEdit,
  compact = false,
}: {
  value: { max_attempts?: number; base_minutes?: number; on_final?: string } | null;
  canEdit: boolean;
  compact?: boolean;
}) {
  const { run, busy } = useRunner();
  const [max, setMax] = React.useState(String(value?.max_attempts ?? 5));
  const [base, setBase] = React.useState(String(value?.base_minutes ?? 1));
  const [final, setFinal] = React.useState(value?.on_final ?? 'mark_failed');
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() =>
          saveSetting('retry', {
            max_attempts: Number(max),
            base_minutes: Number(base),
            on_final: final,
          }),
        );
      }}
    >
      <div className={cn('grid gap-3', compact ? 'grid-cols-1' : 'sm:grid-cols-2')}>
        <SelectField
          label="Max Retry Attempts"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          options={Array.from({ length: 10 }, (_, i) => ({
            value: String(i + 1),
            label: String(i + 1),
          }))}
          disabled={!canEdit}
        />
        <SelectField
          label="Retry Interval"
          value={base}
          onChange={(e) => setBase(e.target.value)}
          options={[1, 2, 5, 10, 15, 30, 60].map((m) => ({
            value: String(m),
            label: `${m} minute${m === 1 ? '' : 's'}`,
          }))}
          disabled={!canEdit}
          hint="Grows with each try: the interval × 1, 4, 9, 16…"
        />
      </div>
      <SelectField
        label="On Final Failure"
        value={final}
        onChange={(e) => setFinal(e.target.value)}
        options={[
          { value: 'mark_failed', label: 'Mark as failed' },
          { value: 'mark_failed_notify', label: 'Mark as failed & notify staff' },
        ]}
        disabled={!canEdit}
      />
      <Button
        type="submit"
        variant="outline"
        block
        loading={busy}
        disabled={!canEdit}
        leadingIcon={<RefreshCw className="h-4 w-4" />}
      >
        Save rules
      </Button>
    </form>
  );
}

export function EmailLimitsForm({
  value,
  canEdit,
}: {
  value: { daily?: number; per_minute?: number } | null;
  canEdit: boolean;
}) {
  const { run, busy } = useRunner();
  const [daily, setDaily] = React.useState(String(value?.daily ?? 0));
  const [minute, setMinute] = React.useState(String(value?.per_minute ?? 0));
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() =>
          saveSetting('email_limits', { daily: Number(daily), per_minute: Number(minute) }),
        );
      }}
    >
      <TextField
        label="Daily sending limit"
        type="number"
        min={0}
        value={daily}
        onChange={(e) => setDaily(e.target.value)}
        disabled={!canEdit}
        hint="0 = no limit"
      />
      <TextField
        label="Per-minute limit"
        type="number"
        min={0}
        value={minute}
        onChange={(e) => setMinute(e.target.value)}
        disabled={!canEdit}
        hint="0 = no limit"
      />
      <Button type="submit" variant="outline" loading={busy} disabled={!canEdit}>
        Save limits
      </Button>
    </form>
  );
}

export function CostForm({
  channel,
  value,
  canEdit,
}: {
  channel: 'email' | 'sms' | 'whatsapp';
  value: Record<string, number> | null;
  canEdit: boolean;
}) {
  const { run, busy } = useRunner();
  const [cost, setCost] = React.useState(String(value?.[channel] ?? 0));
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => saveSetting('cost_kes', { ...(value ?? {}), [channel]: Number(cost) }));
      }}
    >
      <TextField
        className="flex-1"
        label="Cost per message (KES)"
        type="number"
        min={0}
        step="0.01"
        value={cost}
        onChange={(e) => setCost(e.target.value)}
        disabled={!canEdit}
        hint="From the provider's price list; used for the estimates here."
      />
      <Button type="submit" variant="outline" loading={busy} disabled={!canEdit}>
        Save
      </Button>
    </form>
  );
}

export function SenderForm({
  value,
  canEdit,
}: {
  value: { from_name?: string; from_email?: string; reply_to?: string | null } | null;
  canEdit: boolean;
}) {
  const { run, busy } = useRunner();
  const [name, setName] = React.useState(value?.from_name ?? 'NexG');
  const [email, setEmail] = React.useState(value?.from_email ?? '');
  const [reply, setReply] = React.useState(value?.reply_to ?? '');
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => saveSender({ from_name: name, from_email: email, reply_to: reply }));
      }}
    >
      <TextField
        label="Sender Name"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={!canEdit}
        maxLength={80}
      />
      <TextField
        label="Sender Email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={!canEdit}
        hint="Must be on a domain verified in Resend."
      />
      <TextField
        label="Reply-To Email"
        type="email"
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        disabled={!canEdit}
      />
      <Button
        type="submit"
        variant="outline"
        block
        loading={busy}
        disabled={!canEdit}
        leadingIcon={<Save className="h-4 w-4" />}
      >
        Save sender
      </Button>
    </form>
  );
}

/* ───────────────────────────────────────────────────────────── consent */

export function ConsentForm({ canEdit }: { canEdit: boolean }) {
  const { run, busy } = useRunner();
  const [open, setOpen] = React.useState(false);
  const blank = {
    address: '',
    audience: 'guests',
    kind: 'marketing',
    channel: 'all',
    granted: 'true',
    source: 'staff',
    evidence: '',
  };
  const [c, setC] = React.useState(blank);
  const set = (k: keyof typeof blank, v: string) => setC((x) => ({ ...x, [k]: v }));
  return (
    <>
      <PanelButton icon={ShieldCheck} onClick={() => setOpen(true)} disabled={!canEdit}>
        Record Consent or Withdrawal
      </PanelButton>
      <FormPanel
        open={open}
        onOpenChange={setOpen}
        title="Record consent"
        subtitle="What a person told NexG themselves, with how they said it."
        submitLabel="Record"
        busy={busy}
        onSubmit={async () => {
          const ok = await run(() => recordConsent({ ...c, granted: c.granted === 'true' }));
          if (ok) setC(blank);
          return ok;
        }}
      >
        <TextField
          label="Their email or phone"
          required
          value={c.address}
          onChange={(e) => set('address', e.target.value)}
        />
        <FieldRow>
          <SelectField
            label="Audience"
            value={c.audience}
            onChange={(e) => set('audience', e.target.value)}
            options={AUDIENCE_OPTIONS}
          />
          <SelectField
            label="Their answer"
            value={c.granted}
            onChange={(e) => set('granted', e.target.value)}
            options={[
              { value: 'true', label: 'Yes (granted)' },
              { value: 'false', label: 'No (withdrawn)' },
            ]}
          />
        </FieldRow>
        <FieldRow>
          <SelectField
            label="Kind"
            value={c.kind}
            onChange={(e) => set('kind', e.target.value)}
            options={[
              { value: 'marketing', label: 'Marketing' },
              { value: 'operational', label: 'Service messages' },
            ]}
          />
          <SelectField
            label="Channel"
            value={c.channel}
            onChange={(e) => set('channel', e.target.value)}
            options={[{ value: 'all', label: 'All channels' }, ...CHANNEL_OPTIONS]}
          />
        </FieldRow>
        <SelectField
          label="Source"
          value={c.source}
          onChange={(e) => set('source', e.target.value)}
          options={options(CONSENT_SOURCE_LABEL, [
            'staff',
            'support',
            'web',
            'app_onboarding',
            'account_settings',
            'checkout',
            'import',
            'other',
          ])}
        />
        <TextArea
          label="How they told you"
          required
          value={c.evidence}
          onChange={(e) => set('evidence', e.target.value)}
          maxLength={500}
          placeholder="Call on 12 Dec, ticket SUP-1042; signed form in Company Files"
        />
      </FormPanel>
    </>
  );
}

export function SuppressionForm({ canEdit }: { canEdit: boolean }) {
  const { run, busy } = useRunner();
  const [open, setOpen] = React.useState(false);
  const blank = { channel: 'all', address: '', reason: 'opted_out', note: '' };
  const [s, setS] = React.useState(blank);
  const set = (k: keyof typeof blank, v: string) => setS((x) => ({ ...x, [k]: v }));
  return (
    <>
      <PanelButton icon={Plus} onClick={() => setOpen(true)} disabled={!canEdit}>
        Add to a Suppression List
      </PanelButton>
      <FormPanel
        open={open}
        onOpenChange={setOpen}
        title="Add to a suppression list"
        subtitle="Nothing from Communications goes to this address on that channel."
        submitLabel="Add"
        busy={busy}
        onSubmit={async () => {
          const ok = await run(() => addSuppression(s));
          if (ok) setS(blank);
          return ok;
        }}
      >
        <TextField
          label="Email or phone"
          required
          value={s.address}
          onChange={(e) => set('address', e.target.value)}
        />
        <FieldRow>
          <SelectField
            label="Channel"
            value={s.channel}
            onChange={(e) => set('channel', e.target.value)}
            options={[{ value: 'all', label: 'All channels' }, ...CHANNEL_OPTIONS]}
          />
          <SelectField
            label="Reason"
            value={s.reason}
            onChange={(e) => set('reason', e.target.value)}
            options={options(SUPPRESSION_REASON_LABEL)}
          />
        </FieldRow>
        <TextArea
          label="Note"
          value={s.note}
          onChange={(e) => set('note', e.target.value)}
          maxLength={500}
        />
      </FormPanel>
    </>
  );
}

export function RemoveSuppression({ id, canEdit }: { id: string; canEdit: boolean }) {
  const { run } = useRunner();
  if (!canEdit) return null;
  return (
    <ConfirmAction
      title="Take this address off the list?"
      body="Messages can go to it again. Only do this when the person asked, or it was added by mistake."
      confirmLabel="Remove"
      reason={{ label: 'Why', required: true }}
      onConfirm={(why) => run(() => removeSuppression(id, why))}
      trigger={
        <Button variant="ghost" size="sm" aria-label="Remove from list">
          <Trash2 className="h-4 w-4" />
        </Button>
      }
    />
  );
}

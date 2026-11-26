'use server';

import { revalidatePath } from 'next/cache';

import { UUID } from '@/lib/comms';
import { canOpenComms } from '@/lib/comms-server';
import { requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

/*
 * The Communications screens' buttons. Each goes through one of the RPCs in
 * 20270331000100_communications_module.sql, which check the caller's
 * Communications level, hold the rules (marketing only to people who said
 * yes, suppressed addresses skipped, a bulk send confirmed against its
 * preview) and write the audit event in the same transaction. Nothing here
 * updates a table directly.
 */

export interface Outcome {
  ok: boolean;
  message?: string;
  data?: unknown;
}

type Untyped = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
};

async function call(fn: string, args: Record<string, unknown>, done?: string): Promise<Outcome> {
  const staff = await requireStaff();
  if (!canOpenComms(staff))
    return { ok: false, message: 'Communications are not open to your role.' };
  const db = createClient() as unknown as Untyped;
  const { data, error } = await db.rpc(fn, args);
  if (error) {
    return {
      ok: false,
      message:
        error.code === 'PGRST202' || error.code === '42883'
          ? 'The database has not been updated for this screen yet.'
          : error.message,
    };
  }
  revalidatePath('/communications', 'layout');
  return { ok: true, message: done, data };
}

const uuid = (v: string | null | undefined) => (v && UUID.test(v) ? v : null);

/* ─────────────────────────────────────────────────────────── templates */

export interface TemplateInput {
  id?: string | null;
  name: string;
  audience: string;
  category: string;
  purpose: string;
  trigger_label?: string;
  channels: string[];
  status: string;
  email_subject?: string;
  email_body?: string;
  sms_body?: string;
  whatsapp_body?: string;
  push_title?: string;
  push_body?: string;
}

export async function saveTemplate(input: TemplateInput): Promise<Outcome> {
  return call(
    'rpc_comms_template_save',
    { p: { ...input, id: uuid(input.id) } },
    input.id ? 'Template saved.' : 'Template added.',
  );
}

/* ─────────────────────────────────────────────────────────── workflows */

export interface WorkflowInput {
  id?: string | null;
  name: string;
  trigger_kind: string;
  condition: string;
  template_id: string;
  channels: string[];
  delay_minutes: number;
  follow_up_template_id?: string | null;
  follow_up_after_minutes?: number | null;
  enabled: boolean;
}

export async function saveWorkflow(input: WorkflowInput): Promise<Outcome> {
  return call(
    'rpc_comms_workflow_save',
    {
      p: {
        ...input,
        id: uuid(input.id),
        follow_up_template_id: uuid(input.follow_up_template_id),
        follow_up_after_minutes: uuid(input.follow_up_template_id)
          ? input.follow_up_after_minutes
          : null,
      },
    },
    'Workflow saved.',
  );
}

export async function toggleWorkflow(key: string, enabled: boolean): Promise<Outcome> {
  if (!/^(wf|kind|group):[a-z0-9_.-]{2,80}$/i.test(key))
    return { ok: false, message: 'Unknown workflow.' };
  return call(
    'rpc_comms_workflow_toggle',
    { p_key: key, p_enabled: enabled },
    enabled ? 'Switched on.' : 'Switched off.',
  );
}

/* ─────────────────────────────────────────────────────────── schedules */

export interface ScheduleInput {
  id?: string | null;
  name: string;
  template_id?: string | null;
  subject?: string;
  body?: string;
  audiences: string[];
  channels: string[];
  city_id?: string | null;
  kind: 'one_time' | 'recurring';
  run_at?: string | null;
  frequency?: string | null;
  weekday?: number | null;
  monthday?: number | null;
  time_of_day?: string | null;
  starts_on?: string | null;
  ends_on?: string | null;
}

export async function saveSchedule(input: ScheduleInput): Promise<Outcome> {
  return call(
    'rpc_comms_schedule_save',
    {
      p: {
        ...input,
        id: uuid(input.id),
        template_id: uuid(input.template_id),
        city_id: uuid(input.city_id),
      },
    },
    'Scheduled.',
  );
}

export async function setScheduleStatus(id: string, status: string): Promise<Outcome> {
  if (!uuid(id)) return { ok: false, message: 'Unknown schedule.' };
  return call(
    'rpc_comms_schedule_set_status',
    { p_id: id, p_status: status },
    status === 'cancelled' ? 'Cancelled.' : status === 'paused' ? 'Paused.' : 'Resumed.',
  );
}

/* ─────────────────────────────────────────────────────── sending things */

export interface CampaignInput {
  name: string;
  kind: 'bulk' | 'announcement';
  audiences: string[];
  channels: string[];
  city_id?: string | null;
  template_id?: string | null;
  subject?: string;
  body?: string;
}

export interface Preview {
  people: number;
  reachable: number;
  messages: number;
  no_consent: number;
  suppressed: number;
  no_address: number;
  by_audience: Record<string, number>;
  by_channel: Record<string, number>;
}

function spec(input: CampaignInput) {
  return { ...input, city_id: uuid(input.city_id), template_id: uuid(input.template_id) };
}

/** Counts who a send would reach. Sends nothing. */
export async function previewCampaign(input: CampaignInput): Promise<Outcome> {
  return call('rpc_comms_campaign_preview', { p: spec(input) });
}

/** Sends, if the audience still matches the count that was confirmed. */
export async function sendCampaign(
  input: CampaignInput,
  confirmReachable: number,
): Promise<Outcome> {
  const r = await call('rpc_comms_campaign_send', {
    p: { ...spec(input), confirm_reachable: confirmReachable },
  });
  if (!r.ok) return r;
  const d = (r.data ?? {}) as { ok?: boolean; ref?: string; result?: Preview; preview?: Preview };
  if (!d.ok) {
    return {
      ok: false,
      message: 'The audience changed since you checked it. Check the new count and confirm again.',
      data: d.preview,
    };
  }
  return {
    ok: true,
    message: `${d.ref}: ${d.result?.messages ?? 0} message(s) queued for ${d.result?.reachable ?? 0} people.`,
    data: d,
  };
}

export async function sendManual(input: {
  recipient: string;
  to_name?: string;
  audience?: string;
  channels: string[];
  subject?: string;
  body: string;
  name?: string;
}): Promise<Outcome> {
  const r = await call('rpc_comms_manual_send', { p: input });
  if (!r.ok) return r;
  const d = (r.data ?? {}) as {
    ok?: boolean;
    ref?: string;
    sent?: number;
    skipped?: Record<string, string>;
  };
  const skipped = Object.entries(d.skipped ?? {})
    .map(([c, why]) => `${c}: ${why}`)
    .join('; ');
  return d.ok
    ? { ok: true, message: `${d.ref}: queued${skipped ? ` (not sent on ${skipped})` : ''}.` }
    : { ok: false, message: `Nothing was sent${skipped ? `: ${skipped}` : ''}.` };
}

export async function sendTest(input: {
  channel: string;
  recipient: string;
  template_id?: string | null;
  subject?: string;
  body?: string;
}): Promise<Outcome> {
  return call(
    'rpc_comms_test_send',
    {
      p_channel: input.channel,
      p_recipient: input.recipient,
      p_template_id: uuid(input.template_id),
      p_subject: input.subject ?? null,
      p_body: input.body ?? null,
    },
    input.channel === 'in_app'
      ? 'Test sent to your own bell.'
      : 'Test queued. It goes out with the next dispatch run, within a minute.',
  );
}

export async function resendMessage(logId: string): Promise<Outcome> {
  if (!uuid(logId)) return { ok: false, message: 'Unknown message.' };
  return call('rpc_comms_resend', { p_log_id: logId }, 'Queued again.');
}

export async function queueAction(id: string, action: 'retry' | 'cancel'): Promise<Outcome> {
  if (!uuid(id)) return { ok: false, message: 'Unknown message.' };
  return call(
    'rpc_comms_queue_action',
    { p_id: id, p_action: action },
    action === 'retry' ? 'It will be tried again within a minute.' : 'Cancelled.',
  );
}

/* ──────────────────────────────────────────────────────────── settings */

export async function saveSetting(
  key: 'retry' | 'email_limits' | 'cost_kes',
  value: Record<string, unknown>,
): Promise<Outcome> {
  return call('rpc_comms_setting_save', { p_key: key, p_value: value }, 'Saved.');
}

export async function saveSender(input: {
  from_name: string;
  from_email: string;
  reply_to: string;
}): Promise<Outcome> {
  return call(
    'rpc_comms_sender_save',
    { p_from_name: input.from_name, p_from_email: input.from_email, p_reply_to: input.reply_to },
    'Sender saved.',
  );
}

/* ───────────────────────────────────────────────────────────── consent */

export async function recordConsent(input: {
  address: string;
  audience?: string;
  kind: string;
  channel: string;
  granted: boolean;
  source: string;
  evidence: string;
}): Promise<Outcome> {
  return call('rpc_comms_consent_record', { p: input }, 'Recorded.');
}

export async function addSuppression(input: {
  channel: string;
  address: string;
  reason: string;
  note?: string;
}): Promise<Outcome> {
  return call(
    'rpc_comms_suppression_add',
    {
      p_channel: input.channel,
      p_address: input.address,
      p_reason: input.reason,
      p_note: input.note ?? null,
    },
    'Added to the list.',
  );
}

export async function removeSuppression(id: string, reason: string): Promise<Outcome> {
  if (!uuid(id)) return { ok: false, message: 'Unknown entry.' };
  return call(
    'rpc_comms_suppression_remove',
    { p_id: id, p_reason: reason },
    'Taken off the list.',
  );
}

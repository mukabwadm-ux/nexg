import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import {
  Workbench,
  type WorkBlock,
  type WorkMessage,
  type WorkPlan,
} from '@/components/experiences/workbench';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Plan workbench' };
export const dynamic = 'force-dynamic';

export default async function PlanWorkbenchPage({ params }: { params: { id: string } }) {
  const staff = await requireStaff();
  requireModule(staff, 'experiences');
  const supabase = createClient();

  const [{ data: plan }, { data: blocks }, { data: messages }, { data: fee }] = await Promise.all([
    supabase
      .from('plan')
      .select(
        'id, reference, status, guest_name, guest_phone, stay_label, party_type, party_size, date, budget_kes, estimate_total_kes, quote_total_kes, pay_on_day_total_kes, concierge_fee_kes, notes, moods, answers, claimed_at, sla_quote_due_at, flags, staff_user!plan_concierge_id_fkey(display_name)',
      )
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('plan_block')
      .select(
        'id, slot, start_time, kind, title_snapshot, subtitle_snapshot, price_estimate_kes, price_quoted_kes, status, change_note, changed_from, hold_status, included_by, anchored, swap_group, done_at, experience_component(experience_partner(name))',
      )
      .eq('plan_id', params.id)
      .order('sort'),
    supabase
      .from('plan_message')
      .select('id, author_type, body, created_at, staff_user(display_name)')
      .eq('plan_id', params.id)
      .order('created_at'),
    supabase
      .from('setting')
      .select('value')
      .eq('key', 'experience_fee_rule')
      .eq('scope', 'global')
      .maybeSingle(),
  ]);

  /* RLS already refused if this is not theirs to see; a missing row here
     is a missing row, and a 404 says so without hinting it exists. */
  if (!plan) notFound();

  const workPlan: WorkPlan = {
    id: plan.id,
    reference: plan.reference,
    status: plan.status,
    guest_name: plan.guest_name,
    guest_phone: plan.guest_phone,
    stay_label: plan.stay_label,
    party_type: plan.party_type,
    party_size: plan.party_size,
    date: plan.date,
    budget_kes: plan.budget_kes,
    estimate_total_kes: plan.estimate_total_kes,
    quote_total_kes: plan.quote_total_kes,
    pay_on_day_total_kes: plan.pay_on_day_total_kes,
    concierge_fee_kes: plan.concierge_fee_kes,
    notes: plan.notes,
    moods: (plan.moods as string[] | null) ?? [],
    answers: (plan.answers as Record<string, unknown> | null) ?? {},
    concierge_name: (plan.staff_user as { display_name: string } | null)?.display_name ?? null,
    claimed_at: plan.claimed_at,
    quote_due_in_s: plan.sla_quote_due_at
      ? Math.round((new Date(plan.sla_quote_due_at).getTime() - Date.now()) / 1000)
      : null,
    flags: (plan.flags as { severity: string; kind: string; text: string }[] | null) ?? [],
  };

  const workBlocks: WorkBlock[] = ((blocks ?? []) as Record<string, unknown>[]).map((b) => ({
    id: b.id as string,
    slot: b.slot as string,
    start_time: b.start_time as string | null,
    kind: b.kind as string,
    title_snapshot: b.title_snapshot as string,
    subtitle_snapshot: b.subtitle_snapshot as string | null,
    price_estimate_kes: b.price_estimate_kes as number | null,
    price_quoted_kes: b.price_quoted_kes as number | null,
    status: b.status as string,
    change_note: b.change_note as string | null,
    changed_from: b.changed_from as { title?: string; start_time?: string } | null,
    hold_status: b.hold_status as string,
    included_by: b.included_by as string | null,
    anchored: b.anchored as boolean,
    swap_group: b.swap_group as string | null,
    done_at: b.done_at as string | null,
    partner_name:
      (
        (b.experience_component as { experience_partner?: { name: string } } | null)
          ?.experience_partner ?? null
      )?.name ?? null,
  }));

  const workMessages: WorkMessage[] = ((messages ?? []) as Record<string, unknown>[]).map((m) => ({
    id: m.id as string,
    author_type: m.author_type as string,
    body: m.body as string,
    created_at: m.created_at as string,
    author_name: (m.staff_user as { display_name: string } | null)?.display_name ?? null,
  }));

  return (
    <ConsoleShell staff={staff} current="/experiences">
      <ConsoleHeader
        title={`${workPlan.guest_name ?? '[Guest name]'} · ${workPlan.reference}`}
        breadcrumb="Grow → Experiences → Plan workbench"
      />
      <Workbench
        plan={workPlan}
        blocks={workBlocks}
        messages={workMessages}
        feeRuleSet={fee?.value !== null && fee?.value !== undefined}
      />
    </ConsoleShell>
  );
}

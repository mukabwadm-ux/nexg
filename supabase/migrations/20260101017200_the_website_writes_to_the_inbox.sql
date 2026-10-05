-- The website writes to the inbox.
--
-- Folding the old tickets in was only half the job: the Help
-- form on nexgapp.com still called `rpc_support_ticket_create`,
-- so every new message landed back in the table we had just
-- emptied. A consolidation that leaves the inflow pointing at
-- the old place is not a consolidation, it is a copy.
--
-- This is the anonymous entry point. It is the only RPC in this
-- module `anon` may call, and it is deliberately narrow: it
-- writes one conversation and one message, and hands back a
-- reference and nothing else. A visitor must never be able to
-- read a conversation back out of here — not their own, and
-- certainly not by guessing.

create or replace function rpc_msg_contact(
  p_name text,
  p_contact text,
  p_topic msg_topic,
  p_body text,
  p_city_slug text default null,
  p_consent boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_city uuid;
  v_conv uuid;
  v_visitor uuid;
  v_participant uuid;
  v_rule public.msg_routing_rule;
  v_team text := 'concierge';
  v_priority public.msg_priority := 'normal';
  v_sla integer := 120;
  v_kind text;
  v_ref text;
begin
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Tell us what you need and we will help.';
  end if;
  if coalesce(trim(p_contact), '') = '' then
    raise exception 'We need a way to reply to you — a phone number or an email.';
  end if;
  if not p_consent then
    /* Said plainly rather than assumed from the act of typing.
       The contact details are the only personal thing this form
       collects and the only reason it collects them. */
    raise exception 'We need your agreement to reply to you before we can take this.';
  end if;

  v_kind := case when position('@' in p_contact) > 0 then 'email' else 'phone' end;

  select id into v_city from public.city where slug = p_city_slug;

  v_rule := public.fn_msg_route(p_topic, false, v_city);
  if v_rule.id is not null then
    v_team := v_rule.owner_team;
    v_priority := v_rule.priority_out;
    v_sla := v_rule.first_response_sla_s;
  end if;

  insert into public.msg_visitor (session_hash, display_name, contact, contact_kind, consent_at)
  values (encode(extensions.digest(p_contact || coalesce(p_city_slug, ''), 'sha256'), 'hex'),
          nullif(trim(p_name), ''), trim(p_contact), v_kind, now())
  on conflict (session_hash) do update
    set display_name = coalesce(excluded.display_name, public.msg_visitor.display_name)
  returning id into v_visitor;

  insert into public.msg_conversation (
    kind, subject, topic, city_id, origin_channel, current_channel,
    owner_team, priority, first_response_due_at)
  values ('external',
          coalesce(nullif(trim(p_name), ''), 'Someone')
            || ' · ' || replace(p_topic::text, '_', ' '),
          p_topic, v_city, 'web', 'web', v_team, v_priority,
          now() + make_interval(secs => v_sla))
  returning id into v_conv;

  insert into public.msg_participant (
    conversation_id, kind, user_id, display_name, can_see_internal, can_reply_external)
  values (v_conv, 'visitor', v_visitor,
          coalesce(nullif(trim(p_name), ''), 'Someone'), false, true)
  returning id into v_participant;

  insert into public.msg_message (conversation_id, kind, body, visibility)
  values (v_conv, 'system',
          'Started from the website · ' || replace(p_topic::text, '_', ' ')
            || ' · replying by ' || v_kind, 'external');

  insert into public.msg_message (
    conversation_id, kind, author_participant_id, body, visibility)
  values (v_conv, 'text', v_participant, trim(p_body), 'external');

  /* Short, readable, and not the conversation's id — handing a
     visitor the primary key invites them to try the next one. */
  v_ref := 'NXM-' || upper(substr(encode(extensions.digest(v_conv::text, 'sha256'), 'hex'), 1, 6));

  return jsonb_build_object(
    'ok', true,
    'reference', v_ref,
    /* Handed back so the caller can send the acknowledgement it
       always sent. Null when they gave a phone number, which is
       the common case here and not an error. */
    'to_email', case when v_kind = 'email' then trim(p_contact) end,
    'message', 'Got it. A person will reply to you on ' || trim(p_contact) || '.');
end;
$$;

comment on function rpc_msg_contact is
  'The website contact form. The only RPC in this module anon may call: it writes one conversation and returns a reference, and reads nothing back.';

revoke execute on function rpc_msg_contact(text, text, msg_topic, text, text, boolean) from public;
grant execute on function rpc_msg_contact(text, text, msg_topic, text, text, boolean)
  to anon, authenticated;

-- ════════════════════════════ and the old write path stops
--
-- The first attempt at this stubbed the legacy RPCs to raise.
-- It did not work and should not have been tried: one of them
-- returns `support_ticket` rather than jsonb, so the replacement
-- was rejected, and the other has two overloads — so the stub
-- quietly created a *third* function rather than replacing
-- anything. A `create or replace` that does not match an
-- existing signature is a new function, and the schema ends up
-- with a decoy nobody called for.
--
-- The honest fix is smaller: repoint the one caller. The Help
-- form now calls `rpc_msg_contact`, nothing else writes to
-- tickets, and the old functions are left exactly as they were
-- with a comment saying so. A legacy function with no callers
-- is harmless; a half-replaced one is not.

drop function if exists public.rpc_support_ticket_create(
  text, text, text, text, text, text, text, text);

/*
 * The two legacy write paths are closed with a sentence rather
 * than left working.
 *
 * Left working they would be a second place a reply can land,
 * and a reply on a ticket whose history now lives in a
 * conversation is a divergence nobody notices until somebody
 * quotes the wrong transcript in a dispute.
 *
 * Same signature and same return type as the originals — a
 * `create or replace` that differs in either is not a
 * replacement, it is a new function sitting beside the one you
 * meant to change. That happened on the first attempt here and
 * left a decoy in the schema.
 */
create or replace function public.rpc_support_ticket_reply(
  p_ticket_id uuid,
  p_body text,
  p_internal boolean default false
)
returns public.support_ticket
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception
    'Support tickets are conversations now. This ticket was brought across with its history — reply to it in Messaging.'
    using errcode = '42501';
end;
$$;

create or replace function public.rpc_support_ticket_set_status(
  p_ticket_id uuid,
  p_status public.ticket_status,
  p_assign_to_me boolean default false
)
returns public.support_ticket
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception
    'Support tickets are conversations now. Resolve it in Messaging, where the topic is recorded with it.'
    using errcode = '42501';
end;
$$;

comment on function public.rpc_support_ticket_reply(uuid, text, boolean) is
  'Closed. Superseded by the Messaging module; it raises with a pointer rather than writing to a table nobody reads.';

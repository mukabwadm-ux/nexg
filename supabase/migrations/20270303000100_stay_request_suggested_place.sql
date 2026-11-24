-- ════════════════════════════════════════════════════════════════════
-- Stay request: "Suggest a place you know or would like to try"
--
-- One optional free-text answer on the stays request form. Stored on
-- the request, shown to the desk in the console (Hotels > Requests) and
-- carried onto the support ticket the request opens.
--
-- Backward-compatible: a nullable column; the RPC still takes the one
-- jsonb payload, and a payload without the key saves null as before.
-- The function body is 20261123000100's, plus the new field.
-- ════════════════════════════════════════════════════════════════════

alter table public.stay_request
  add column if not exists suggested_place text
    constraint stay_request_suggested_place_len check (char_length(suggested_place) <= 300);

comment on column public.stay_request.suggested_place is
  'Optional: a place the guest knows or would like to try. Free text, up to 300 characters.';

create or replace function public.rpc_stay_request_create(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.stay_request;
  v_ref text;
  v_phone text := nullif(trim(p_payload ->> 'phone'), '');
  v_email text := nullif(trim(p_payload ->> 'email'), '');
  v_ticket_id uuid;
  v_ticket_ref text;
  v_body text;
  v_city text;
begin
  if v_phone is null and v_email is null then
    raise exception 'We need a phone number or an email, or we cannot come back to you.'
      using errcode = 'check_violation';
  end if;

  v_ref := 'ST-' || (
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                             1 + floor(random() * 32)::integer, 1), '')
    from generate_series(1, 6)
  );
  while exists (select 1 from public.stay_request where reference = v_ref) loop
    v_ref := 'ST-' || (
      select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                               1 + floor(random() * 32)::integer, 1), '')
      from generate_series(1, 6)
    );
  end loop;

  insert into public.stay_request (
    reference, requester_name, requester_phone, requester_email,
    city_id, areas, check_in, check_out, guests, bedrooms_needed,
    budget_per_night_kes, purpose, must_haves, notes, source, consent_marketing,
    suggested_place
  )
  values (
    v_ref,
    nullif(trim(p_payload ->> 'name'), ''),
    v_phone,
    v_email,
    (select id from public.city where slug = coalesce(p_payload ->> 'city', 'nairobi')),
    coalesce(
      (select array_agg(value #>> '{}') from jsonb_array_elements(p_payload -> 'areas')),
      '{}'),
    nullif(p_payload ->> 'check_in', '')::date,
    nullif(p_payload ->> 'check_out', '')::date,
    nullif(p_payload ->> 'guests', '')::integer,
    nullif(p_payload ->> 'bedrooms', '')::integer,
    nullif(p_payload ->> 'budget', '')::bigint,
    nullif(p_payload ->> 'purpose', ''),
    coalesce(
      (select array_agg(value #>> '{}') from jsonb_array_elements(p_payload -> 'must_haves')),
      '{}'),
    nullif(trim(p_payload ->> 'notes'), ''),
    coalesce(nullif(p_payload ->> 'source', ''), 'stays_hero'),
    coalesce((p_payload ->> 'consent_marketing')::boolean, false),
    left(nullif(trim(p_payload ->> 'suggested_place'), ''), 300)
  )
  returning * into v_request;

  insert into public.notification (kind, status) values ('stay_request_received', 'pending');

  perform audit.log('guest'::public.actor_type, 'hotels', 'stay_request.received',
    p_target_type => 'stay_request', p_target_id => v_request.id,
    p_city_id => v_request.city_id,
    p_after => jsonb_build_object('reference', v_ref, 'guests', v_request.guests,
                                  'purpose', v_request.purpose));

  -- ═════════════════════════════════════ and Support has it too
  select c.name into v_city from public.city c where c.id = v_request.city_id;
  v_body := coalesce(v_request.requester_name, 'A guest') || ' is looking for a stay'
    || case when cardinality(v_request.areas) > 0
            then ' in ' || array_to_string(v_request.areas, ', ') else '' end
    || coalesce(' (' || v_city || ')', '')
    || case when v_request.check_in is not null
            then ', ' || to_char(v_request.check_in, 'DD Mon')
                 || coalesce(' to ' || to_char(v_request.check_out, 'DD Mon YYYY'), '')
            else ', dates open' end
    || coalesce(', ' || v_request.guests || ' guest' || case when v_request.guests = 1 then '' else 's' end, '')
    || coalesce(', ' || v_request.bedrooms_needed || ' bedroom'
                || case when v_request.bedrooms_needed = 1 then '' else 's' end, '')
    || coalesce(', up to KES ' || to_char(v_request.budget_per_night_kes, 'FM999,999,999') || ' a night', '')
    || '. Stay request ' || v_ref || '.'
    || coalesce(E'\n\n' || v_request.notes, '')
    || coalesce(E'\n\nA place they suggest: ' || v_request.suggested_place, '');

  v_ticket_ref := 'NX-T-' || nextval('public.support_ticket_reference_seq')::text;

  insert into public.support_ticket (
    reference, channel, from_role, topic, full_name, email, phone,
    body, details, source_form, city_id
  )
  values (
    v_ticket_ref, 'web_form', 'guest', 'concierge_request',
    v_request.requester_name, v_request.requester_email, v_request.requester_phone,
    v_body,
    jsonb_strip_nulls(jsonb_build_object(
      'stay_request_id', v_request.id,
      'stay_request', v_ref,
      'check_in', v_request.check_in,
      'check_out', v_request.check_out,
      'guests', v_request.guests,
      'bedrooms', v_request.bedrooms_needed,
      'budget_per_night_kes', v_request.budget_per_night_kes,
      'areas', case when cardinality(v_request.areas) > 0 then to_jsonb(v_request.areas) end,
      'purpose', v_request.purpose,
      'must_haves', case when cardinality(v_request.must_haves) > 0 then to_jsonb(v_request.must_haves) end,
      'city', v_city,
      'source', v_request.source,
      'suggested_place', v_request.suggested_place
    )),
    'stays_request',
    v_request.city_id
  )
  returning id into v_ticket_id;

  update public.stay_request set ticket_id = v_ticket_id where id = v_request.id;

  perform audit.log('guest'::public.actor_type, 'support', 'support.ticket_created',
    p_target_type => 'support_ticket', p_target_id => v_ticket_id,
    p_city_id => v_request.city_id,
    p_after => jsonb_build_object('reference', v_ticket_ref, 'topic', 'concierge_request',
                                  'from', 'guest', 'stay_request', v_ref));

  return jsonb_build_object('ok', true, 'reference', v_ref, 'ticket_reference', v_ticket_ref);
end;
$$;

grant execute on function public.rpc_stay_request_create(jsonb) to anon, authenticated;

-- The console view, with the new column appended at the end.
create or replace view public.console_stay_request_v
with (security_invoker = true) as
select
  r.id,
  r.reference,
  r.requester_name,
  public.fn_mask_phone(r.requester_phone) as phone_masked,
  r.requester_email,
  r.city_id,
  c.name as city_name,
  r.areas,
  r.check_in,
  r.check_out,
  case when r.check_in is not null and r.check_out is not null
    then (r.check_out - r.check_in) end as nights,
  r.guests,
  r.bedrooms_needed,
  r.budget_per_night_kes,
  r.purpose,
  r.must_haves,
  r.notes,
  r.status,
  r.source,
  r.created_at,
  r.sent_at,
  r.outcome_note,
  su.display_name as assigned_to_name,
  (select count(*) from public.stay_request_match m where m.request_id = r.id) as options,
  round(extract(epoch from (now() - r.created_at)) / 3600)::integer as age_hours,
  r.suggested_place
from public.stay_request r
left join public.city c on c.id = r.city_id
left join public.staff_user su on su.id = r.assigned_to;

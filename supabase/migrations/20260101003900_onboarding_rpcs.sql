-- Saving the onboarding flow, one tap at a time.
--
-- Every write here is a security-definer RPC rather than a PostgREST update,
-- for the same reason the rest of this schema is: the checks that matter —
-- who owns this draft, is this column theirs to set, does this zone exist —
-- are not expressible in a policy, and a policy is the only thing standing
-- between a REST client and the table.

-- ------------------------------------------------------- shared ownership check

create or replace function public.fn_merchant_draft_for_write(p_merchant_id uuid)
returns public.merchant
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m public.merchant;
begin
  select * into m from public.merchant where id = p_merchant_id;

  if m.id is null then
    raise exception 'We could not find that registration.' using errcode = 'no_data_found';
  end if;

  if not authz.is_merchant_member(m.id) then
    raise exception 'That registration belongs to someone else.'
      using errcode = 'insufficient_privilege';
  end if;

  /* Once a business is live, paused or delisted, onboarding is over: changes
     go through the dashboard and, where they affect what a guest is promised,
     through staff. */
  if m.status not in ('applied', 'documents_pending', 'under_review') then
    raise exception 'This business is already set up. Use your dashboard.'
      using errcode = 'check_violation';
  end if;

  return m;
end;
$$;

-- ------------------------------------------------------------------ step 1

/*
 * Start, or pick up, a registration.
 *
 * The caller is already signed in — anonymously is fine — because ownership
 * is what makes every later step safe to save without asking again. Knowing a
 * phone number gets you nothing: an existing draft is only handed over to
 * somebody who already owns it.
 */
create or replace function public.rpc_merchant_start(
  p_trading_name text,
  p_contact_name text,
  p_contact_phone text,
  p_contact_email text default null,
  p_source text default 'scratch',
  p_source_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  m public.merchant;
begin
  if v_caller is null then
    raise exception 'Start a session first.' using errcode = 'insufficient_privilege';
  end if;

  if coalesce(trim(p_trading_name), '') = '' then
    raise exception 'Tell us the name guests should see.' using errcode = 'check_violation';
  end if;

  if p_contact_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Enter a valid phone number.' using errcode = 'check_violation';
  end if;

  -- A draft this caller already owns — the ordinary "came back" case.
  select * into m
  from public.merchant
  where contact_phone = p_contact_phone
    and submitted_at is null
    and authz.is_merchant_member(id)
  order by updated_at desc
  limit 1;

  if m.id is not null then
    update public.merchant
    set trading_name = trim(p_trading_name),
        contact_name = coalesce(nullif(trim(p_contact_name), ''), contact_name),
        contact_email = coalesce(nullif(lower(trim(p_contact_email)), ''), contact_email),
        onboarding_source = coalesce(p_source, onboarding_source),
        source_url = coalesce(p_source_url, source_url)
    where id = m.id
    returning * into m;

    return m.id;
  end if;

  insert into public.merchant (
    trading_name, contact_name, contact_phone, contact_email,
    onboarding_source, source_url, status, onboarding_step
  )
  values (
    trim(p_trading_name),
    nullif(trim(p_contact_name), ''),
    p_contact_phone,
    nullif(lower(trim(p_contact_email)), ''),
    p_source,
    p_source_url,
    'applied',
    2
  )
  returning * into m;

  insert into public.merchant_user (merchant_id, user_id, role)
  values (m.id, v_caller, 'owner');

  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type,
    p_module => 'merchant',
    p_action => 'merchant.applied',
    p_target_type => 'merchant',
    p_target_id => m.id,
    p_after => jsonb_build_object('source', p_source, 'trading_name', m.trading_name)
  );

  return m.id;
end;
$$;

comment on function public.rpc_merchant_start is
  'Creates the draft and makes the caller its owner. A draft on the same phone is only resumed for someone who already owns it — knowing the number is not a credential.';

-- ------------------------------------------------------------------ step 2

/*
 * The category and its answers.
 *
 * Separate from the generic step save because two of the things it decides
 * are not the merchant's to assert: requires_ops_mapping, which sends the
 * application to a human, and the price band shown on their card.
 */
create or replace function public.rpc_merchant_set_category(
  p_merchant_id uuid,
  p_category public.merchant_category,
  p_answers jsonb default '{}',
  p_category_other text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  v_cfg public.category_config;
begin
  m := public.fn_merchant_draft_for_write(p_merchant_id);

  select * into v_cfg from public.category_config where category = p_category;
  if v_cfg.category is null then
    raise exception 'We do not have that kind of business on the list.'
      using errcode = 'no_data_found';
  end if;

  update public.merchant
  set category = p_category,
      /* Switching category throws the answers away on purpose. They were
         answers to different questions. */
      answers = case when m.category is distinct from p_category
                     then coalesce(p_answers, '{}'::jsonb)
                     else coalesce(p_answers, m.answers) end,
      category_other = nullif(trim(p_category_other), ''),
      requires_ops_mapping = v_cfg.requires_ops_mapping,
      price_band = coalesce(p_answers ->> 'spend_band', price_band),
      onboarding_step = greatest(onboarding_step, 3)
  where id = m.id;

  if m.category is distinct from p_category then
    perform audit.log(
      p_actor_type => 'merchant_user'::public.actor_type,
      p_module => 'merchant',
      p_action => 'merchant.category_set',
      p_target_type => 'merchant',
      p_target_id => m.id,
      p_before => jsonb_build_object('category', m.category),
      p_after => jsonb_build_object('category', p_category)
    );
  end if;

  return public.fn_merchant_readiness(m.id);
end;
$$;

-- ------------------------------------------------ steps 3, 4, 6 and 7

/*
 * Everything a merchant may say about how they trade.
 *
 * A patch rather than a column per argument, because the flow saves on every
 * tap and most taps change one field. Keys that are not on this list are
 * ignored rather than rejected: a newer browser sending a field this
 * migration has not heard of should not fail the save of the four it has.
 */
create or replace function public.rpc_merchant_save_step(
  p_merchant_id uuid,
  p_step smallint,
  p_patch jsonb default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  v_advanced boolean;
begin
  m := public.fn_merchant_draft_for_write(p_merchant_id);
  v_advanced := p_step > m.onboarding_step;

  update public.merchant set
    trading_name = coalesce(nullif(trim(p_patch ->> 'trading_name'), ''), trading_name),
    legal_name = coalesce(nullif(trim(p_patch ->> 'legal_name'), ''), legal_name),
    contact_name = coalesce(nullif(trim(p_patch ->> 'contact_name'), ''), contact_name),
    contact_email = case when p_patch ? 'contact_email'
                         then nullif(lower(trim(p_patch ->> 'contact_email')), '')
                         else contact_email end,
    cover_photo_path = coalesce(p_patch ->> 'cover_photo_path', cover_photo_path),

    -- step 3
    pickup_instructions = coalesce(p_patch ->> 'pickup_instructions', pickup_instructions),
    rider_parking = coalesce(p_patch ->> 'rider_parking', rider_parking),
    landmark = case when p_patch ? 'landmark'
                    then nullif(trim(p_patch ->> 'landmark'), '') else landmark end,
    branch_count_band = coalesce(p_patch ->> 'branch_count_band', branch_count_band),

    -- step 4
    hours_pattern = coalesce(p_patch ->> 'hours_pattern', hours_pattern),
    hours = coalesce(p_patch -> 'hours', hours),
    late_night_until = case when p_patch ? 'late_night_until'
                            then nullif(p_patch ->> 'late_night_until', '')::time
                            else late_night_until end,
    prep_minutes = coalesce((p_patch ->> 'prep_minutes')::int, prep_minutes),
    order_channels = coalesce(
      (select array_agg(value #>> '{}')
       from jsonb_array_elements(p_patch -> 'order_channels')),
      order_channels),
    when_busy = coalesce(p_patch ->> 'when_busy', when_busy),
    packaging = coalesce(p_patch ->> 'packaging', packaging),
    has_own_riders = coalesce((p_patch ->> 'has_own_riders')::boolean, has_own_riders),
    fleet_dispatch_preference = coalesce(
      p_patch ->> 'fleet_dispatch_preference', fleet_dispatch_preference),

    -- step 6
    payout_rail = coalesce(p_patch ->> 'payout_rail', payout_rail),
    payout_account = coalesce(p_patch -> 'payout_account', payout_account),

    -- step 7
    onboarding_call_at = case when p_patch ? 'onboarding_call_at'
                              then nullif(p_patch ->> 'onboarding_call_at', '')::timestamptz
                              else onboarding_call_at end,

    onboarding_step = greatest(onboarding_step, p_step)
  where id = m.id;

  /*
   * Opening hours are published as rows as well as kept as a pattern. The
   * merchant page and the "Open now" pill already read merchant_hours; the
   * pattern exists so that "weekdays vs weekend" can be edited later as two
   * ranges rather than as fourteen times nobody typed.
   */
  if p_patch ? 'hours' then
    delete from public.merchant_hours where merchant_id = m.id;

    insert into public.merchant_hours (merchant_id, day_of_week, opens, closes, closed)
    select
      m.id,
      d.dow,
      nullif(p_patch #>> array['hours', d.key, 'open'], '')::time,
      nullif(p_patch #>> array['hours', d.key, 'close'], '')::time,
      coalesce((p_patch #>> array['hours', d.key, 'closed'])::boolean, false)
    from (values
      ('sun', 0), ('mon', 1), ('tue', 2), ('wed', 3),
      ('thu', 4), ('fri', 5), ('sat', 6)
    ) as d(key, dow)
    where p_patch -> 'hours' ? d.key
    on conflict (merchant_id, day_of_week) do nothing;
  end if;

  /* One audit row per step reached, not one per tap. A debounced draft save
     is not a state change worth a hash-chained record; finishing a step is. */
  if v_advanced then
    perform audit.log(
      p_actor_type => 'merchant_user'::public.actor_type,
      p_module => 'merchant',
      p_action => 'merchant.step_saved',
      p_target_type => 'merchant',
      p_target_id => m.id,
      p_after => jsonb_build_object('step', p_step)
    );
  end if;

  return public.fn_merchant_readiness(m.id);
end;
$$;

/*
 * The waitlist was built for guests asking for their city. A merchant whose
 * pin fell outside every zone is asking the same question from the other side
 * of the counter, and belongs in the same list.
 */
alter table public.waitlist_signup drop constraint if exists waitlist_signup_source_check;
alter table public.waitlist_signup
  add constraint waitlist_signup_source_check check (
    source in ('homepage_app', 'homepage_city', 'homepage_request', 'merchant_outside_zone')
  );

-- ------------------------------------------------------------------ step 3

/*
 * The branches, and the zones they fall in.
 *
 * The whole list is replaced rather than diffed. A branch has no identity the
 * merchant is aware of while they are still adding them, and a merchant who
 * removes the second of three and adds another expects the result to be what
 * is on their screen.
 *
 * The city is taken from where the primary pin actually landed, not from a
 * dropdown. A merchant who says Nairobi and drops a pin in Kitengela is in
 * Kitengela, and the flow has to treat them that way.
 */
create or replace function public.rpc_merchant_set_branches(
  p_merchant_id uuid,
  p_branches jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  b jsonb;
  v_zone record;
  v_primary_city uuid;
  v_seen_primary boolean := false;
  v_out jsonb := '[]'::jsonb;
  v_idx integer := 0;
begin
  m := public.fn_merchant_draft_for_write(p_merchant_id);

  if jsonb_typeof(p_branches) <> 'array' or jsonb_array_length(p_branches) = 0 then
    raise exception 'We need at least one place to collect from.'
      using errcode = 'check_violation';
  end if;

  delete from public.merchant_branch where merchant_id = m.id;

  for b in select value from jsonb_array_elements(p_branches)
  loop
    v_zone := null;

    if (b ->> 'lat') is not null and (b ->> 'lng') is not null then
      select * into v_zone
      from public.zone_for_point((b ->> 'lng')::double precision, (b ->> 'lat')::double precision);
    end if;

    insert into public.merchant_branch (
      merchant_id, name, address_text, latitude, longitude,
      zone_id, is_primary, inherits_hours, source, sort
    )
    values (
      m.id,
      nullif(trim(b ->> 'name'), ''),
      nullif(trim(b ->> 'address_text'), ''),
      (b ->> 'lat')::double precision,
      (b ->> 'lng')::double precision,
      v_zone.id,
      not v_seen_primary,
      coalesce((b ->> 'inherits_hours')::boolean, v_seen_primary),
      coalesce(b ->> 'source', 'manual'),
      v_idx
    );

    if not v_seen_primary then
      v_primary_city := v_zone.city_id;
      v_seen_primary := true;
    end if;

    v_out := v_out || jsonb_build_object(
      'address_text', b ->> 'address_text',
      'zone', v_zone.name,
      'tier', v_zone.tier,
      'eta_min', v_zone.eta_min,
      'eta_max', v_zone.eta_max,
      'cod_allowed', v_zone.cod_allowed
    );

    v_idx := v_idx + 1;
  end loop;

  update public.merchant
  set city_id = coalesce(v_primary_city, city_id),
      onboarding_step = greatest(onboarding_step, 4)
  where id = m.id;

  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type,
    p_module => 'merchant',
    p_action => 'merchant.branch_set',
    p_target_type => 'merchant',
    p_target_id => m.id,
    p_after => jsonb_build_object('branches', jsonb_array_length(p_branches), 'zones', v_out)
  );

  return jsonb_build_object(
    'branches', v_out,
    'readiness', public.fn_merchant_readiness(m.id)
  );
end;
$$;

/*
 * Outside every zone.
 *
 * Nothing about the application changes — the draft stays a draft, the status
 * stays `applied` — because being early is not being rejected. All this
 * records is that they asked, and where from, so the answer to "should we
 * open Kitengela next?" is a query rather than a guess.
 */
create or replace function public.rpc_merchant_waitlist(
  p_merchant_id uuid,
  p_lng double precision,
  p_lat double precision,
  p_area text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  v_near record;
begin
  m := public.fn_merchant_draft_for_write(p_merchant_id);

  select * into v_near from public.distance_to_nearest_zone(p_lng, p_lat);

  insert into public.waitlist_signup (source, city_id, email, payload)
  values (
    'merchant_outside_zone',
    v_near.city_id,
    m.contact_email,
    jsonb_build_object(
      'merchant_id', m.id,
      'trading_name', m.trading_name,
      'phone', m.contact_phone,
      'area', p_area,
      'lng', p_lng,
      'lat', p_lat,
      'km_from_zone', v_near.km,
      'nearest_zone', v_near.zone_name
    )
  );

  update public.merchant
  set waitlisted_at = now()
  where id = m.id;

  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type,
    p_module => 'merchant',
    p_action => 'merchant.waitlisted',
    p_target_type => 'merchant',
    p_target_id => m.id,
    p_after => jsonb_build_object('area', p_area, 'km_from_zone', v_near.km)
  );

  return jsonb_build_object('km', v_near.km, 'nearest', v_near.zone_name, 'city', v_near.city_name);
end;
$$;

-- ---------------------------------------------- step 4 · the merchant's riders

/*
 * A merchant declaring their own riders.
 *
 * Declaring somebody grants them nothing. The invite sends them into the same
 * rider onboarding, with the same documents and the same admin verification,
 * as anyone who walked in off the street — because the guest reading a rider
 * card has no way to tell the two apart and should not have to.
 *
 * The raw invite tokens are returned to the caller once, to be sent. Only
 * their hashes are stored.
 */
create or replace function public.rpc_merchant_declare_fleet(
  p_merchant_id uuid,
  p_riders jsonb,
  p_preference text default 'own_first'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  r jsonb;
  v_max integer;
  v_token text;
  v_existing_rider uuid;
  v_row public.merchant_fleet_rider;
  v_out jsonb := '[]'::jsonb;
  v_declarer uuid;
begin
  m := public.fn_merchant_draft_for_write(p_merchant_id);

  select (value #>> '{}')::int into v_max
  from public.setting where key = 'fleet_max_declared' and scope = 'global';
  v_max := coalesce(v_max, 20);

  if jsonb_array_length(coalesce(p_riders, '[]'::jsonb)) > v_max then
    raise exception 'You can add up to % riders here. The rest go in from your dashboard.', v_max
      using errcode = 'check_violation';
  end if;

  select id into v_declarer
  from public.merchant_user
  where merchant_id = m.id and user_id = (select auth.uid())
  limit 1;

  for r in select value from jsonb_array_elements(coalesce(p_riders, '[]'::jsonb))
  loop
    /* Somebody who already rides for NexG is linked, not invited again and
       not duplicated: they already have an account and a verified plate. */
    select id into v_existing_rider
    from public.rider where phone = r ->> 'phone' limit 1;

    v_token := encode(extensions.gen_random_bytes(32), 'hex');

    insert into public.merchant_fleet_rider (
      merchant_id, branch_id, name, phone, vehicle, plate_no,
      invite_status, invite_token_hash, invite_expires_at, rider_id,
      invited_at, declared_by
    )
    values (
      m.id,
      nullif(r ->> 'branch_id', '')::uuid,
      trim(r ->> 'name'),
      r ->> 'phone',
      (r ->> 'vehicle')::public.vehicle_type,
      nullif(trim(r ->> 'plate_no'), ''),
      /* Cast spelled out: a CASE yields text, which will not bind to an
         enum column however unambiguous the labels look. */
      (case when v_existing_rider is not null then 'active' else 'invited' end)
        ::public.fleet_invite_status,
      case when v_existing_rider is null
           then encode(extensions.digest(v_token, 'sha256'), 'hex') end,
      case when v_existing_rider is null then now() + interval '14 days' end,
      v_existing_rider,
      now(),
      v_declarer
    )
    on conflict (merchant_id, phone) do update
      set name = excluded.name,
          vehicle = excluded.vehicle,
          plate_no = excluded.plate_no,
          branch_id = excluded.branch_id
    returning * into v_row;

    v_out := v_out || jsonb_build_object(
      'id', v_row.id,
      'name', v_row.name,
      'phone', v_row.phone,
      'status', v_row.invite_status,
      'already_a_rider', v_existing_rider is not null,
      /* Sent by the caller and then forgotten. Re-reading this row will not
         produce it again. */
      'token', case when v_existing_rider is null then v_token end
    );
  end loop;

  update public.merchant
  set has_own_riders = jsonb_array_length(coalesce(p_riders, '[]'::jsonb)) > 0,
      fleet_dispatch_preference = coalesce(p_preference, fleet_dispatch_preference)
  where id = m.id;

  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type,
    p_module => 'merchant',
    p_action => 'fleet_rider.declared',
    p_target_type => 'merchant',
    p_target_id => m.id,
    p_after => jsonb_build_object(
      'count', jsonb_array_length(coalesce(p_riders, '[]'::jsonb)),
      'preference', p_preference)
  );

  return v_out;
end;
$$;

comment on function public.rpc_merchant_declare_fleet is
  'Records the riders a merchant says work for them and returns one-time invite tokens. Being declared skips no part of rider verification.';

-- ------------------------------------------------------------------ step 6

/*
 * Submit for verification.
 *
 * This is the only place onboarding writes submitted_at, and it is the moment
 * the draft stops being the merchant's private working copy and becomes
 * something a reviewer is accountable for. It does not make anything public —
 * only rpc_merchant_go_live does that, and only once the documents are
 * verified.
 */
create or replace function public.rpc_merchant_submit(p_merchant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  v_missing text;
begin
  m := public.fn_merchant_draft_for_write(p_merchant_id);

  if m.submitted_at is not null then
    return jsonb_build_object('already_submitted', true, 'reference', 'NX-M-' || left(m.id::text, 6));
  end if;

  if m.category is null then
    raise exception 'Tell us what you sell before we can check you.'
      using errcode = 'check_violation';
  end if;

  if m.city_id is null then
    raise exception 'Drop a pin on your main branch before we can check you.'
      using errcode = 'check_violation';
  end if;

  /* The legal name goes on the settlement and the permit check. Where the
     merchant never gave one, the trading name is the best we have and the
     reviewer corrects it on the call. */
  select string_agg(r.label, ', ') into v_missing
  from public.fn_merchant_required_docs(m.id) r
  where r.essential
    and not exists (
      select 1 from public.document d
      where d.owner_type = 'merchant' and d.owner_id = m.id
        and d.requirement_id = r.id and d.status in ('uploaded', 'verified')
    );

  if v_missing is not null then
    raise exception 'We still need: %', v_missing using errcode = 'check_violation';
  end if;

  update public.merchant
  set submitted_at = now(),
      legal_name = coalesce(legal_name, trading_name),
      onboarding_step = 7
  where id = m.id;

  perform public.fn_partner_recompute_status('merchant'::public.document_owner_type, m.id);

  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type,
    p_module => 'merchant',
    p_action => 'merchant.submitted',
    p_target_type => 'merchant',
    p_target_id => m.id,
    p_after => jsonb_build_object('category', m.category, 'city_id', m.city_id),
    p_city_id => m.city_id
  );

  return jsonb_build_object(
    'reference', 'NX-M-' || left(m.id::text, 6),
    'submitted_at', now(),
    'readiness', public.fn_merchant_readiness(m.id)
  );
end;
$$;

-- -------------------------------------------------------- save and come back

/*
 * A link that puts the merchant back where they were, on whatever device the
 * link opened on.
 *
 * Whoever holds the link becomes an owner of the draft. That is what a resume
 * link is — the same bargain as a magic link — so it is single use, expires
 * in seven days, and only its hash is stored.
 */
create or replace function public.rpc_merchant_resume_token(p_merchant_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  v_token text;
begin
  m := public.fn_merchant_draft_for_write(p_merchant_id);

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  update public.merchant
  set resume_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
      resume_token_expires_at = now() + interval '7 days'
  where id = m.id;

  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type,
    p_module => 'merchant',
    p_action => 'merchant.resume_link_sent',
    p_target_type => 'merchant',
    p_target_id => m.id
  );

  return v_token;
end;
$$;

create or replace function public.rpc_merchant_resume_claim(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  v_caller uuid := (select auth.uid());
begin
  if v_caller is null then
    raise exception 'Start a session first.' using errcode = 'insufficient_privilege';
  end if;

  select * into m
  from public.merchant
  where resume_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');

  if m.id is null or m.resume_token_expires_at < now() then
    raise exception 'That link has expired. Ask for a new one.' using errcode = 'no_data_found';
  end if;

  /* Single use: consumed whether or not the claim below adds a new owner. */
  update public.merchant
  set resume_token_hash = null, resume_token_expires_at = null
  where id = m.id;

  insert into public.merchant_user (merchant_id, user_id, role)
  values (m.id, v_caller, 'owner')
  on conflict (merchant_id, user_id) do nothing;

  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type,
    p_module => 'merchant',
    p_action => 'merchant.resumed',
    p_target_type => 'merchant',
    p_target_id => m.id
  );

  return jsonb_build_object('merchant_id', m.id, 'step', m.onboarding_step);
end;
$$;

-- ------------------------------------------------------------------ grants

grant execute on function public.fn_merchant_draft_for_write(uuid) to authenticated;
grant execute on function public.rpc_merchant_start(text, text, text, text, text, text)
  to authenticated;
grant execute on function public.rpc_merchant_set_category(
  uuid, public.merchant_category, jsonb, text) to authenticated;
grant execute on function public.rpc_merchant_save_step(uuid, smallint, jsonb) to authenticated;
grant execute on function public.rpc_merchant_set_branches(uuid, jsonb) to authenticated;
grant execute on function public.rpc_merchant_waitlist(uuid, double precision, double precision, text)
  to authenticated;
grant execute on function public.rpc_merchant_declare_fleet(uuid, jsonb, text) to authenticated;
grant execute on function public.rpc_merchant_submit(uuid) to authenticated;
grant execute on function public.rpc_merchant_resume_token(uuid) to authenticated;
grant execute on function public.rpc_merchant_resume_claim(text) to authenticated;

-- ---------------------------------------------------------------- settings

insert into public.setting (scope, key, value, effective_from)
values
  ('global', 'fleet_max_declared', '20'::jsonb, now()),
  ('global', 'doc_grace_days', '14'::jsonb, now()),
  /* A pattern, not a calendar. The flow offers the next two working days at
     these times; a real calendar replaces this without touching the UI. */
  ('global', 'onboarding_call_times', '["10:00", "15:00"]'::jsonb, now())
on conflict do nothing;

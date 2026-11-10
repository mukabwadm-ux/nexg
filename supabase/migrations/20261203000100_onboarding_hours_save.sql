-- The onboarding hours step saves again.
--
-- rpc_merchant_save_step publishes the week it is sent as merchant_hours rows,
-- and its insert named `on conflict (merchant_id, day_of_week)`. That key was
-- dropped in 20260101020300, when hours gained services and branches, for a
-- unique index on (merchant, branch, day, service). Postgres will not infer an
-- arbiter it cannot match, so every save that carried `hours` has failed since
-- with "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification", and no applicant could get past the hours step.
--
-- The rows for the business are deleted just before the insert, so there is
-- nothing left for it to collide with: the conflict clause goes, and nothing
-- else changes. Same signature, security definer, search_path and audit call;
-- `create or replace` keeps the owner and the execute grants as they are.

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
   *
   * The week is replaced, not merged: every row for the business goes,
   * then the days in the patch go in, so the insert has nothing to
   * collide with and names no conflict target. A second save waits on the
   * merchant row the update above has locked.
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
    where p_patch -> 'hours' ? d.key;
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

-- Featured says one thing.
--
-- Two bugs, both found by tests that had stopped running and so
-- had not reported anything in a while.
--
-- ─────────────────────────────────────────────────────────────
-- One: the flag and the truth could disagree.
--
-- `merchant.featured` is an ordinary boolean column, and
-- `fn_merchant_is_featured` derives the same fact from the slot
-- weeks actually sold. Four merchants on this database had the
-- flag set with no live slot behind it.
--
-- That is not cosmetic. Anything reading the column shows a
-- SPONSORED badge for somebody who is not paying, or — the
-- expensive direction — drops the badge for somebody who is,
-- which is a refund conversation and a lost renewal.
--
-- The flag cannot simply be deleted; a good deal of code reads
-- it and a join to the slot weeks on every merchant listing is
-- not free. So it stays, and stops being writable. Anything
-- that sets it by hand is overruled, the slot weeks maintain
-- it, and the hourly expiry cron reconciles the whole table
-- because this fact changes with the calendar and not only with
-- a row.
--
-- ─────────────────────────────────────────────────────────────
-- Two: a pitch email with no body at all.
--
-- `replace(v_body, '{{slots}}', nullif(v_slots, ''))` — and
-- `replace()` with a null argument returns null, so a merchant
-- in a city with no open placements got a pitch whose entire
-- body was null. The line below it does the same substitution
-- for `{{note}}` wrapped in a coalesce, with a comment
-- explaining exactly this hazard. The idea was right and half
-- of it was applied.

-- ══════════════════════════════════════════ one: the flag

create or replace function fn_featured_reconcile(p_merchant_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_rows integer;
begin
  /*
   * Writes only the rows that are wrong. A blanket update would
   * touch every merchant hourly, which is a lot of WAL and a
   * lot of audit noise to say nothing changed.
   */
  with wrong as (
    select m.id, public.fn_merchant_is_featured(m.id) as truth
      from public.merchant m
     where (p_merchant_id is null or m.id = p_merchant_id)
       and m.featured is distinct from public.fn_merchant_is_featured(m.id)
  ),
  fixed as (
    update public.merchant m
       set featured = w.truth
      from wrong w
     where m.id = w.id
    returning 1
  )
  select count(*)::integer into v_rows from fixed;

  return v_rows;
end;
$$;

comment on function fn_featured_reconcile is
  'Brings merchant.featured back in line with the slot weeks actually sold. Writes only the rows that are wrong.';

/*
 * The flag is derived, so a direct write to it is overruled
 * rather than rejected.
 *
 * Overruled and not rejected on purpose: a seed file, a
 * migration or an import that sets `featured` is not doing
 * anything wrong, it is just not the authority on this. Raising
 * would break those writers for a column they have no reason to
 * care about; correcting the value keeps the system consistent
 * and silent.
 */
create or replace function tg_merchant_featured_is_derived()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.featured := public.fn_merchant_is_featured(new.id);
  return new;
end;
$$;

/*
 * The name is doing work. Postgres fires BEFORE triggers in
 * alphabetical order, and `merchant_protected_columns` is the
 * guard that raises 42501 when somebody who does not own this
 * column tries to set it — by comparing old.featured to
 * new.featured.
 *
 * Named `merchant_featured_is_derived`, this trigger sorted
 * first, rewrote new.featured to the derived value, and the
 * guard then saw no change and allowed the write. A merchant
 * owner could call the update and get no error. The guard was
 * still there, still correct, and no longer reached.
 *
 * So it sorts last, deliberately. The guard refuses the writers
 * who may not set this; the derive then corrects the ones who
 * may — a seed, a migration, an import — none of whom are the
 * authority on whether a slot was sold.
 */
drop trigger if exists merchant_featured_is_derived on public.merchant;
drop trigger if exists merchant_zz_featured_is_derived on public.merchant;
create trigger merchant_zz_featured_is_derived
  before insert or update of featured on public.merchant
  for each row execute function tg_merchant_featured_is_derived();

/* And the slot weeks push the fact the other way, so the flag
   is right the moment a week goes live or ends rather than at
   the top of the next hour. */
create or replace function tg_slot_week_syncs_merchant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_booking uuid := coalesce(new.booking_id, old.booking_id);
begin
  perform public.fn_featured_reconcile(b.merchant_id)
     from public.featured_booking b
    where b.id = v_booking;
  return null;
end;
$$;

drop trigger if exists slot_week_syncs_merchant on public.featured_slot_week;
create trigger slot_week_syncs_merchant
  after insert or update or delete on public.featured_slot_week
  for each row execute function tg_slot_week_syncs_merchant();

/*
 * The hourly reconcile.
 *
 * Needed as well as the triggers, because this fact changes
 * when the calendar moves and not only when a row does: a week
 * that ended at midnight makes the flag wrong on a table where
 * nothing was written. The triggers keep it immediate; this
 * keeps it true.
 */
create or replace function cron_featured_reconcile()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_fixed integer;
begin
  v_fixed := public.fn_featured_reconcile();
  return jsonb_build_object(
    'ok', true,
    'corrected', v_fixed,
    'message', case when v_fixed = 0
      then 'Every merchant flag already matched the slots sold.'
      else v_fixed || ' merchant flags disagreed with the slots sold and were corrected.' end);
end;
$$;

do $cron$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed here; the featured reconcile is not scheduled.';
    return;
  end if;
  /* Twenty past, so it does not land on the same minute as
     featured-expire at ten past and reconcile a table that is
     still being changed. */
  perform cron.schedule('featured-reconcile', '20 * * * *',
    $sched$select public.cron_featured_reconcile()$sched$);
end
$cron$;

revoke execute on function fn_featured_reconcile(uuid) from public, anon, authenticated;
revoke execute on function cron_featured_reconcile() from public, anon, authenticated;
grant execute on function fn_featured_reconcile(uuid) to service_role;
grant execute on function cron_featured_reconcile() to service_role;

/* The four that were already wrong. */
do $fix$
declare v integer;
begin
  v := public.fn_featured_reconcile();
  if v > 0 then
    raise notice 'Corrected % merchant featured flags that disagreed with the slots sold.', v;
  end if;
end
$fix$;

-- ══════════════════════════════════════════ two: the pitch body

create or replace function fn_render_featured_pitch(p_payload jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  t public.message_template;
  v_body text;
  v_slots text := '';
  s jsonb;
begin
  select * into t from public.message_template where key = 'merchant_featured_pitch';
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_template');
  end if;

  /* One line per placement, with the price and when it starts. A
     table would not survive a plain-text email client. */
  for s in select * from jsonb_array_elements(coalesce(p_payload -> 'slots', '[]'::jsonb))
  loop
    v_slots := v_slots
      || '  · ' || coalesce(s ->> 'what_it_is', '[placement]')
      || E'\n    KES '
      || coalesce(to_char(nullif(s ->> 'price_per_week', '')::bigint, 'FM999,999,999'), '[—]')
      || ' a week · ' || coalesce(s ->> 'weeks_open', '[—]') || ' weeks available'
      || ' · from '
      || coalesce(to_char(nullif(s ->> 'earliest_week', '')::date, 'FMDay DD Mon'), '[—]')
      || E'\n';
  end loop;

  v_body := t.body;
  v_body := replace(v_body, '{{name}}', coalesce(p_payload ->> 'name', 'there'));
  v_body := replace(v_body, '{{city}}', coalesce(p_payload ->> 'city', 'your city'));
  v_body := replace(v_body, '{{category}}',
    coalesce(replace(p_payload ->> 'category', '_', ' '), 'yours'));

  /*
   * The bug. `replace()` returns null if any argument is null,
   * so `nullif(v_slots, '')` on an empty list did not leave the
   * placeholder blank — it made the entire body null, and the
   * caller sent a pitch with nothing in it.
   *
   * There is no honest empty rendering of this section: a pitch
   * email is a list of things to buy, and without one there is
   * no pitch. So it says so, in the bracket convention used
   * everywhere a real figure is missing, and whoever is
   * previewing can see there is nothing to sell before they
   * send it.
   */
  v_body := replace(v_body, '{{slots}}',
    coalesce(nullif(v_slots, ''), '  · [no placements are open in this city just now]'));

  v_body := replace(v_body, '{{from}}', coalesce(p_payload ->> 'from', 'The NexG team'));

  /* An empty note leaves a blank line rather than the word "null". */
  v_body := replace(v_body, '{{note}}', coalesce(nullif(trim(p_payload ->> 'note'), ''), ''));
  v_body := regexp_replace(v_body, E'\n{3,}', E'\n\n', 'g');

  return jsonb_build_object(
    'ok', true,
    'subject', 'Being first on NexG in '
      || coalesce(p_payload ->> 'city', 'your city'),
    'body', v_body);
end;
$$;

grant execute on function fn_render_featured_pitch(jsonb) to authenticated, service_role;

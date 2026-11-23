-- A customer who confirms their phone by SMS code gets the orders they placed
-- as a guest with that number (shared services D6, owner 23 Nov 2026).
--
-- Since 20261223000200 a number already on a customer record (public.guest)
-- is never attached to whoever types it: anyone can type a number. An SMS code
-- proves the number is theirs, which is the "SMS-code linking" that decision
-- foresaw. So when Supabase marks an account's phone confirmed
-- (auth.users.phone_confirmed_at), the customer record holding that number
-- joins the account, and with it every order, payment and saved place that
-- point at the record.
--
-- The rules, decided here to keep data safe:
--   * The number is matched however it was typed: 07…, 7…, 254…, +254….
--   * A record is linked only if it belongs to nobody, or to a temporary
--     (anonymous) session. A record held by another full account is never
--     taken.
--   * An account has one customer record (order placement reads it by
--     user_id). If the account has none, the phone's record becomes its own.
--     If it has one with nothing pointing at it, that empty record is
--     removed and the phone's record takes its place. If its record has
--     history of its own, the two are not merged automatically: merging
--     means moving rows in every table that points at a customer record.
--     The case is audited as customer.phone_link_needs_support for support,
--     who link it as before.
--   * Every outcome is audited (customer.phone_linked or
--     customer.phone_link_needs_support).
--
-- Rollback:
--   drop trigger if exists users_link_guest_by_phone on auth.users;
--   drop function if exists public.tg_users_link_guest_by_phone();
--   drop function if exists public.fn_link_guest_by_confirmed_phone(uuid, text);
--   drop function if exists public.fn_phone_key(text);
--   delete from audit.action_registry where action in
--     ('customer.phone_linked', 'customer.phone_link_needs_support');

insert into audit.action_registry (action, module, default_severity, description) values
  ('customer.phone_linked', 'customers', 'notice',
   'An account confirmed its phone by SMS and took over the customer record with that number'),
  ('customer.phone_link_needs_support', 'customers', 'high',
   'An account confirmed a phone whose customer record could not be linked automatically')
on conflict (action) do nothing;

/* A Kenyan mobile as 2547…/2541…, however it was typed; other numbers as their digits. */
create or replace function public.fn_phone_key(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when d is null or d = '' then null
    when d ~ '^0[17][0-9]{8}$' then '254' || substr(d, 2)
    when d ~ '^[17][0-9]{8}$' then '254' || d
    else d
  end
  from (select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as d) x;
$$;

create or replace function public.fn_link_guest_by_confirmed_phone(p_user_id uuid, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := public.fn_phone_key(p_phone);
  v_phone_guest public.guest;
  v_own public.guest;
  v_holder_anonymous boolean;
  v_refs integer := 0;
  v_fk record;
  v_n integer;
  v_outcome text;
begin
  if p_user_id is null or v_key is null then
    return jsonb_build_object('outcome', 'nothing');
  end if;

  select g.* into v_phone_guest
    from public.guest g
   where public.fn_phone_key(g.phone) = v_key and g.anonymised_at is null
   order by g.created_at
   limit 1
   for update;
  if not found then
    return jsonb_build_object('outcome', 'no_record');
  end if;
  if v_phone_guest.user_id = p_user_id then
    return jsonb_build_object('outcome', 'already', 'guest_id', v_phone_guest.id);
  end if;

  /* Never take a record from another full account. */
  if v_phone_guest.user_id is not null then
    select u.is_anonymous into v_holder_anonymous from auth.users u where u.id = v_phone_guest.user_id;
    if coalesce(v_holder_anonymous, true) is false then
      v_outcome := 'held_by_another_account';
    end if;
  end if;

  if v_outcome is null then
    select g.* into v_own from public.guest g
     where g.user_id = p_user_id and g.id <> v_phone_guest.id
     order by g.created_at limit 1
     for update;

    if found then
      /* Does anything point at the account's own record? */
      for v_fk in
        select c.conrelid::regclass as tbl, a.attname as col
          from pg_constraint c
          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
         where c.confrelid = 'public.guest'::regclass and c.contype = 'f'
           and not exists (select 1 from pg_inherits i where i.inhrelid = c.conrelid)
      loop
        execute format('select count(*) from %s where %I = $1', v_fk.tbl, v_fk.col)
          into v_n using v_own.id;
        v_refs := v_refs + v_n;
      end loop;

      if v_refs > 0 then
        v_outcome := 'account_has_history';
      else
        delete from public.guest where id = v_own.id;
      end if;
    end if;
  end if;

  if v_outcome is not null then
    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'customers',
      p_action => 'customer.phone_link_needs_support',
      p_target_type => 'guest', p_target_id => v_phone_guest.id,
      p_reason => v_outcome,
      p_context => jsonb_build_object('user_id', p_user_id, 'own_guest_id', v_own.id));
    return jsonb_build_object('outcome', v_outcome, 'guest_id', v_phone_guest.id);
  end if;

  update public.guest set user_id = p_user_id, updated_at = now() where id = v_phone_guest.id;

  perform audit.log(
    p_actor_type => 'system'::public.actor_type, p_module => 'customers',
    p_action => 'customer.phone_linked',
    p_target_type => 'guest', p_target_id => v_phone_guest.id,
    p_before => jsonb_build_object('user_id', v_phone_guest.user_id),
    p_after => jsonb_build_object('user_id', p_user_id),
    p_context => jsonb_build_object('replaced_empty_record', v_own.id));
  return jsonb_build_object('outcome', 'linked', 'guest_id', v_phone_guest.id,
                            'replaced_empty_record', v_own.id);
end;
$$;

revoke execute on function public.fn_link_guest_by_confirmed_phone(uuid, text) from public, anon, authenticated;
revoke execute on function public.fn_phone_key(text) from public, anon;

/* Supabase confirms the phone; the link follows in the same transaction. */
create or replace function public.tg_users_link_guest_by_phone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.phone_confirmed_at is not null and coalesce(new.phone, '') <> ''
     and not coalesce(new.is_anonymous, false)
     and (tg_op = 'INSERT'
          or old.phone_confirmed_at is null
          or old.phone is distinct from new.phone) then
    /* Linking must never stop Supabase confirming the phone. */
    begin
      perform public.fn_link_guest_by_confirmed_phone(new.id, new.phone);
    exception when others then
      raise warning 'Linking the customer record for a confirmed phone failed: %', sqlerrm;
    end;
  end if;
  return null;
end;
$$;

revoke execute on function public.tg_users_link_guest_by_phone() from public, anon, authenticated;

drop trigger if exists users_link_guest_by_phone on auth.users;
create trigger users_link_guest_by_phone
  after insert or update of phone_confirmed_at, phone on auth.users
  for each row execute function public.tg_users_link_guest_by_phone();

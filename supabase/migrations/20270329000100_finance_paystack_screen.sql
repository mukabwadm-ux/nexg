-- Finance › Paystack: one screen in the console for NexG, merchants, hosts and
-- riders (owner: "PAYSTACKS SCREEN SHOULD GO TO THE ADMIN INSIDE THE ADMIN",
-- "Paste keys there"). The migration id is a placeholder until it is pushed.
--
-- In this migration, all additive:
--
--  1. Paystack keys pasted in the console: rpc_paystack_key_set,
--     rpc_paystack_key_remove and rpc_paystack_key_status (a super admin whose
--     grant names no city), and rpc_paystack_server_keys, through which NexG's
--     own servers fetch them with a time-limited proof of a one-time token. No
--     key is ever returned to a signed-in person. No function sets that token:
--     the owner puts it in Vault as paystack_keys_server_token once, in the SQL
--     editor. Whoever could set it from the console could read the keys back.
--  2. The screen's reads, all for people who reach Finance, and nothing else:
--     rpc_finance_nexg, rpc_finance_paystack_payees,
--     rpc_finance_paystack_approvals, rpc_finance_paystack_refunds and
--     rpc_finance_paystack_problems. Money is integer cents.
--  3. rpc_finance_paystack_problem_review: full Finance or a super admin marks
--     one of the listed problems reviewed. The list drops a problem only for
--     such a person's review.
--
-- Nothing here switches on live payments, moves money, calls Paystack or posts
-- to the ledger. No existing function, table or policy changes.
--
-- Rollback:
--   drop function public.rpc_paystack_key_set(text, text),
--     public.rpc_paystack_key_remove(text, text), public.rpc_paystack_key_status(),
--     public.rpc_paystack_server_keys(bigint, text), public.rpc_finance_nexg(date, date),
--     public.rpc_finance_paystack_payees(), public.rpc_finance_paystack_approvals(),
--     public.rpc_finance_paystack_refunds(text), public.rpc_finance_paystack_problems(integer),
--     public.rpc_finance_paystack_problem_review(bigint, text),
--     public.fn_paystack_problem_actions(), authz.staff_had_full_finance(uuid, timestamptz),
--     public.fn_paystack_refund_label(text, uuid, uuid, uuid), authz.is_global_super_admin();
--   delete from public.wiring_anon_allow where function_name = 'rpc_paystack_server_keys';
--   delete from audit.action_registry where action in ('paystack.key_set', 'paystack.key_removed')
--   (only while no audit event carries them). The Vault keys stay: remove them
--   in the SQL editor if they must go.

-- ═══════════════════════════════════════════════ 0. audit actions

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, pii_fields, description)
values
  ('paystack.key_set', 'finance', 'high', false, false, true, '{}',
   'A super admin saved a Paystack secret key in the console'),
  ('paystack.key_removed', 'finance', 'high', false, false, true, '{}',
   'A super admin removed a Paystack secret key in the console')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════ 1. the keys

/*
 * A live super_admin grant with no city. authz.is_super_admin() also passes a
 * grant for one city, which is not enough to hold the company's keys.
 *
 * This is only as strong as who may write role_grant. Today the older staff
 * functions and role_grant's own policies accept a super admin for one city, who
 * could therefore make a grant with no city. Closing that changes how staff
 * roles work and is not done here: before the keys are saved, check that no
 * live super_admin grant names a city (docs/DEPLOY.md section 7).
 */
create or replace function authz.is_global_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.role_grant rg
    join public.role r on r.id = rg.role_id
    join public.staff_user su on su.id = rg.staff_user_id
    where su.user_id = (select auth.uid())
      and su.status = 'active'
      and r.key = 'super_admin'
      and rg.city_id is null
      and rg.revoked_at is null
      and (rg.expires_at is null or rg.expires_at > now()))
$$;

revoke execute on function authz.is_global_super_admin() from public, anon, authenticated;

/*
 * Saves one Paystack secret key in Vault (paystack_test_secret_key or
 * paystack_live_secret_key). Spaces and line breaks around it are dropped. The
 * value is never returned, audited or named in an error.
 *
 * Arguments: p_mode 'test' | 'live'; p_value the key, starting sk_test_ or
 * sk_live_ to match, then 16 to 200 letters, digits or underscores.
 *
 * Returns:
 *   { "ok": true, "mode": "test"|"live", "set": true,
 *     "last4": text, "updated_at": timestamptz }
 *
 * Errors: 42501 not a super admin for every city; 22023 wrong mode or key;
 * P0001 Vault refused the write.
 */
create or replace function public.rpc_paystack_key_set(p_mode text, p_value text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_value text := regexp_replace(coalesce(p_value, ''), '^\s+|\s+$', '', 'g');
  v_name text;
  v_secret_id uuid;
  v_at timestamptz;
begin
  if not coalesce(authz.is_global_super_admin(), false) then
    raise exception 'Only a super admin for every city can save Paystack keys.' using errcode = '42501';
  end if;
  if p_mode is null or p_mode not in ('test', 'live') then
    raise exception 'Choose test or live.' using errcode = '22023';
  end if;
  if not starts_with(v_value, 'sk_' || p_mode || '_') then
    raise exception 'A % secret key starts sk_%_.', p_mode, p_mode using errcode = '22023';
  end if;
  if v_value !~ '^sk_(test|live)_[A-Za-z0-9_]{16,200}$' then
    raise exception 'That is not a whole Paystack secret key. Copy it again.' using errcode = '22023';
  end if;

  v_name := 'paystack_' || p_mode || '_secret_key';
  -- Two saves at once take turns.
  perform pg_advisory_xact_lock(hashtextextended(v_name, 0));
  begin
    select id into v_secret_id from vault.secrets where name = v_name;
    if v_secret_id is null then
      perform vault.create_secret(v_value, v_name, 'Paystack ' || p_mode || ' secret key');
    else
      perform vault.update_secret(v_secret_id, v_value);
    end if;
  exception when others then
    -- The database's own message could quote what was being written.
    raise exception 'The key could not be saved (code %). Try again.', sqlstate using errcode = 'P0001';
  end;
  select s.updated_at into v_at from vault.secrets s where s.name = v_name;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_actor_id => authz.staff_id(), p_module => 'finance',
    p_action => 'paystack.key_set', p_target_type => 'paystack_key',
    p_target_label => p_mode || ' secret key',
    p_after => jsonb_build_object('mode', p_mode, 'last4', right(v_value, 4)),
    p_severity => 'high'::public.audit_severity);

  return jsonb_build_object('ok', true, 'mode', p_mode, 'set', true,
    'last4', right(v_value, 4), 'updated_at', v_at);
end;
$$;

revoke execute on function public.rpc_paystack_key_set(text, text) from public, anon;
grant execute on function public.rpc_paystack_key_set(text, text) to authenticated;

/*
 * Removes one Paystack secret key from Vault, with a reason. Asking again
 * changes nothing and audits nothing.
 *
 * Arguments: p_mode 'test' | 'live'; p_reason why (up to 500 characters, never
 * a key).
 *
 * Returns:
 *   { "ok": true, "mode": "test"|"live", "removed": boolean }
 *
 * Errors: 42501 not a super admin for every city; 22023 wrong mode or reason.
 */
create or replace function public.rpc_paystack_key_remove(p_mode text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_name text;
  v_secret_id uuid;
  v_old text;
begin
  if not coalesce(authz.is_global_super_admin(), false) then
    raise exception 'Only a super admin for every city can remove Paystack keys.' using errcode = '42501';
  end if;
  if p_mode is null or p_mode not in ('test', 'live') then
    raise exception 'Choose test or live.' using errcode = '22023';
  end if;
  if v_reason is null then
    raise exception 'Say why this key is being removed.' using errcode = '22023';
  end if;
  if length(v_reason) > 500 then
    raise exception 'Keep the reason under 500 characters.' using errcode = '22023';
  end if;
  if v_reason ~* 'sk_(test|live)_' then
    raise exception 'Do not put a key in the reason.' using errcode = '22023';
  end if;

  v_name := 'paystack_' || p_mode || '_secret_key';
  perform pg_advisory_xact_lock(hashtextextended(v_name, 0));
  select s.id, regexp_replace(s.decrypted_secret, '^\s+|\s+$', '', 'g') into v_secret_id, v_old
    from vault.decrypted_secrets s where s.name = v_name;
  if v_secret_id is null then
    return jsonb_build_object('ok', true, 'mode', p_mode, 'removed', false);
  end if;
  delete from vault.secrets where id = v_secret_id;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_actor_id => authz.staff_id(), p_module => 'finance',
    p_action => 'paystack.key_removed', p_target_type => 'paystack_key',
    p_target_label => p_mode || ' secret key', p_reason => v_reason,
    p_before => jsonb_build_object('mode', p_mode,
      'last4', case when length(v_old) >= 16 then right(v_old, 4) end),
    p_after => jsonb_build_object('mode', p_mode, 'set', false),
    p_severity => 'high'::public.audit_severity);

  return jsonb_build_object('ok', true, 'mode', p_mode, 'removed', true);
end;
$$;

revoke execute on function public.rpc_paystack_key_remove(text, text) from public, anon;
grant execute on function public.rpc_paystack_key_remove(text, text) to authenticated;

/*
 * What the Keys tab shows. Never a key: only whether each is saved, its last
 * four characters and when it was last saved, and whether the one-time server
 * token is in Vault and long enough to be used.
 *
 * Returns:
 *   { "test": { "set": boolean, "last4": text|null, "updated_at": timestamptz|null },
 *     "live": { "set": boolean, "last4": text|null, "updated_at": timestamptz|null },
 *     "server_token_set": boolean }
 *
 * Errors: 42501 not a super admin for every city.
 */
create or replace function public.rpc_paystack_key_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce(authz.is_global_super_admin(), false) then
    raise exception 'Only a super admin for every city can see the Paystack keys screen.'
      using errcode = '42501';
  end if;
  return (
    select jsonb_object_agg(m.mode, jsonb_build_object(
             'set', d.value is not null,
             'last4', case when length(d.value) >= 16 then right(d.value, 4) end,
             'updated_at', case when d.value is not null then d.saved_at end))
      from (values ('test'), ('live')) as m (mode)
      left join lateral (
        select nullif(regexp_replace(s.decrypted_secret, '^\s+|\s+$', '', 'g'), '') as value,
               s.updated_at as saved_at
          from vault.decrypted_secrets s
         where s.name = 'paystack_' || m.mode || '_secret_key'
      ) d on true
  ) || jsonb_build_object('server_token_set', coalesce((
    select length(regexp_replace(s.decrypted_secret, '^\s+|\s+$', '', 'g')) >= 32
      from vault.decrypted_secrets s where s.name = 'paystack_keys_server_token'), false));
end;
$$;

revoke execute on function public.rpc_paystack_key_status() from public, anon;
grant execute on function public.rpc_paystack_key_status() to authenticated;

/*
 * NexG's web and admin servers fetch the keys. They call with the anonymous key
 * and no session; the barrier is the one-time token, which sits in Vault as
 * paystack_keys_server_token (32 characters or more) and in each server's
 * PAYSTACK_KEYS_TOKEN. Both sides drop surrounding spaces and line breaks.
 *
 * Arguments:
 *   p_minute  whole minutes since 1970-01-01 UTC (floor(epoch seconds / 60)),
 *             within one minute of the database's clock;
 *   p_proof   64 lowercase hex characters: HMAC-SHA256 of the text
 *             'paystack-keys:' followed by p_minute in decimal, keyed with the
 *             token.
 *             Node: createHmac('sha256', token).update(`paystack-keys:${minute}`).digest('hex')
 *
 * Returns:
 *   { "test": text|null, "live": text|null }
 *
 * Errors: 42501 'Not allowed.' for every failure, with no hint of which.
 */
create or replace function public.rpc_paystack_server_keys(p_minute bigint, p_proof text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now bigint := floor(extract(epoch from now()) / 60)::bigint;
  v_token text;
  v_ok boolean := false;
  v_test text;
  v_live text;
begin
  select regexp_replace(s.decrypted_secret, '^\s+|\s+$', '', 'g') into v_token
    from vault.decrypted_secrets s where s.name = 'paystack_keys_server_token';
  -- Nested, so a malformed value is never decoded or compared.
  if v_token is not null and length(v_token) >= 32
     and p_minute is not null and p_proof is not null then
    if p_minute between v_now - 1 and v_now + 1 and p_proof ~ '^[0-9a-f]{64}$' then
      v_ok := coalesce(authz.payment_proof_equal(
        decode(p_proof, 'hex'),
        extensions.hmac(convert_to('paystack-keys:' || p_minute::text, 'UTF8'),
                        convert_to(v_token, 'UTF8'), 'sha256')), false);
    end if;
  end if;
  if not v_ok then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;

  select nullif(regexp_replace(s.decrypted_secret, '^\s+|\s+$', '', 'g'), '') into v_test
    from vault.decrypted_secrets s where s.name = 'paystack_test_secret_key';
  select nullif(regexp_replace(s.decrypted_secret, '^\s+|\s+$', '', 'g'), '') into v_live
    from vault.decrypted_secrets s where s.name = 'paystack_live_secret_key';
  return jsonb_build_object('test', v_test, 'live', v_live);
end;
$$;

revoke execute on function public.rpc_paystack_server_keys(bigint, text)
  from public, authenticated, service_role;
grant execute on function public.rpc_paystack_server_keys(bigint, text) to anon;

insert into public.wiring_anon_allow (function_name, reason, guarded_by) values
  ('rpc_paystack_server_keys', 'NexG''s web and admin servers fetch the Paystack keys with no session.',
   'Refused unless p_proof is an HMAC-SHA256, for a minute within one of now, made with the Vault token paystack_keys_server_token (32 characters or more), which no function or screen can set or read back.')
on conflict (function_name) do update set reason = excluded.reason, guarded_by = excluded.guarded_by;

-- ═══════════════════════════════════════════════ 2. NexG's own money

/*
 * NexG's earnings from the ledger for a period of Nairobi days (both ends
 * included, two years at most), with Paystack's fees and the Paystack money
 * not yet on the books. Test payments are left out. Reads only.
 *
 * Arguments: p_from date, p_to date.
 *
 * Returns:
 *   { "from": date, "to": date,
 *     "revenue": [                       -- accounts with entries in the period, by code
 *       { "account": text,               -- e.g. 'revenue.commission'
 *         "name": text,
 *         "earned_cents": int,           -- everything but the two columns below
 *         "refunded_cents": int,         -- taken back for refunds (positive)
 *         "recovered_cents": int,        -- carried by merchants after a refund
 *         "net_cents": int } ],          -- earned - refunded + recovered
 *     "vat_cents": int,                  -- VAT on NexG's fees; not earnings
 *     "transfer_fees_cents": int,        -- Paystack transfer fees NexG paid
 *     "collection_fees_cents": int,      -- Paystack's fee on live payments paid in the period
 *     "fee_unknown_count": int,          -- of those, payments with no fee reported
 *     "off_books": {                     -- live Paystack payments the ledger does not carry
 *       "booking": { "count": int, "collected_cents": int, "refunded_cents": int },
 *       "cinema":  { "count": int, "collected_cents": int, "refunded_cents": int } },
 *     "receivable_ledger_cents": int }   -- the ledger's Paystack receivable, all time:
 *                                        -- NOT the money Paystack holds
 *
 * A reversal counts in the same column as what it reverses. refunded_cents
 * under off_books is what Paystack has processed back, on those payments, so far.
 *
 * Errors: 42501 not Finance; 22023 bad period.
 */
create or replace function public.rpc_finance_nexg(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lo timestamptz;
  v_hi timestamptz;
begin
  perform public.fn_finance_period_check(p_from, p_to);
  v_lo := p_from::timestamp at time zone 'Africa/Nairobi';
  v_hi := (p_to + 1)::timestamp at time zone 'Africa/Nairobi';

  return (
    with posted as (
      select a.base, a.name, a.kind::text as account_kind,
             e.debit::bigint as debit, e.credit::bigint as credit,
             coalesce(o.kind, t.kind) as txn_kind
        from ledger.entry e
        join ledger.account a on a.code = e.account_code
        join ledger.transaction t on t.id = e.transaction_id
        left join ledger.transaction o on o.id = t.reversal_of
       where e.effective_at >= v_lo and e.effective_at < v_hi
         and (a.kind::text = 'revenue' or a.base in ('tax.vat_output', 'expense.provider_fees'))
    ),
    revenue as (
      select x.base, min(x.name) as name,
             coalesce(sum(x.credit - x.debit) filter (where x.txn_kind not in
               ('refund_approved', 'stay_cancelled_refund_due',
                'merchant_refund_by_paystack', 'merchant_refund_recovery')), 0)::bigint as earned,
             coalesce(sum(x.debit - x.credit) filter (where x.txn_kind in
               ('refund_approved', 'stay_cancelled_refund_due')), 0)::bigint as refunded,
             coalesce(sum(x.credit - x.debit) filter (where x.txn_kind in
               ('merchant_refund_by_paystack', 'merchant_refund_recovery')), 0)::bigint as recovered,
             coalesce(sum(x.credit - x.debit), 0)::bigint as net
        from posted x
       where x.account_kind = 'revenue'
       group by x.base
    ),
    paid as (
      select p.id, p.intent::text as intent, p.amount_cents, p.provider_fee_cents
        from public.payment p
       where p.provider = 'paystack' and not p.is_test and p.state in ('paid', 'reversed')
         and p.paid_at >= v_lo and p.paid_at < v_hi
    )
    select jsonb_build_object(
      'from', p_from,
      'to', p_to,
      'revenue', coalesce((select jsonb_agg(jsonb_build_object(
          'account', r.base, 'name', r.name, 'earned_cents', r.earned,
          'refunded_cents', r.refunded, 'recovered_cents', r.recovered, 'net_cents', r.net)
          order by r.base) from revenue r), '[]'::jsonb),
      'vat_cents', (select coalesce(sum(x.credit - x.debit), 0)::bigint
                      from posted x where x.base = 'tax.vat_output'),
      'transfer_fees_cents', (select coalesce(sum(x.debit - x.credit), 0)::bigint
                                from posted x
                               where x.base = 'expense.provider_fees' and x.txn_kind = 'payout_fee'),
      'collection_fees_cents', (select coalesce(sum(p.provider_fee_cents), 0)::bigint from paid p),
      'fee_unknown_count', (select count(*) from paid p where p.provider_fee_cents is null),
      'off_books', (select jsonb_object_agg(i.intent, jsonb_build_object(
          'count', (select count(*) from paid p where p.intent = i.intent),
          'collected_cents', (select coalesce(sum(p.amount_cents), 0)::bigint
                                from paid p where p.intent = i.intent),
          'refunded_cents', (select coalesce(sum(f.amount_cents), 0)::bigint
                               from public.paystack_refund f
                               join paid p on p.id = f.payment_id
                              where f.state = 'processed' and p.intent = i.intent)))
          from (values ('booking'), ('cinema')) as i (intent)),
      'receivable_ledger_cents', (select coalesce(sum(e.debit - e.credit), 0)::bigint
          from ledger.entry e
          join ledger.account a on a.code = e.account_code
         where a.base = 'cash.card_processor_receivable' and e.effective_at <= now())));
end;
$$;

revoke execute on function public.rpc_finance_nexg(date, date) from public, anon;
grant execute on function public.rpc_finance_nexg(date, date) to authenticated;

-- ═══════════════════════════════════════════════ 3. who is paid through Paystack

/*
 * Every merchant's and host's Paystack sub-account, the latest 100 rider
 * transfers, and how many riders are paid which way in each city. Reads only.
 *
 * Returns:
 *   { "merchants": [ SUBACCOUNT ],      -- by name, newest request first
 *     "hosts":     [ SUBACCOUNT ],
 *     "rider_transfers": [             -- newest first, 100 at most
 *       { "id": uuid, "reference": text, "kind": "rider_early"|"rider_payout",
 *         "rider_id": uuid, "rider_name": text|null, "amount_cents": int,
 *         "fee_cents": int, "fee_paid_by": "nexg"|"rider"|null, "test": boolean,
 *         "state": "opened"|"pending"|"otp"|"success"|"failed"|"reversed",
 *         "failure_reason": text|null, "created_at": timestamptz,
 *         "completed_at": timestamptz|null } ],
 *     "rider_cities": [                -- cities with active riders, in the city list's order
 *       { "city_id": uuid|null, "city": text|null,
 *         "rule_mode": "run"|"immediate"|"daily"|"weekly"|"monthly",  -- the city's rule
 *         "automatic_from": "YYYY-MM-DD"|null,
 *         "riders": int, "test_riders": int,
 *         "modes": { "run": int, "immediate": int, "daily": int,  -- how riders are
 *                    "weekly": int, "monthly": int } } ],         -- actually paid
 *     "rider_automatic_live": boolean,   -- the rule "automatic payouts send real money"
 *     "live_worker_seen_at": timestamptz|null }
 *
 *   SUBACCOUNT =
 *     { "id": uuid, "party_id": uuid, "name": text|null, "test": boolean,
 *       "code": text, "schedule": "auto"|"weekly"|"monthly"|"manual",
 *       "status": "pending"|"active"|"paused"|"replaced"|"rejected",
 *       "requested_by": text|null, "requested_at": timestamptz,
 *       "decided_by": text|null, "decided_at": timestamptz|null,
 *       "can_decide": boolean }
 *
 * party_id is the merchant's id under "merchants" and the host's under "hosts".
 * can_decide is the decide function's own rule: waiting, full Finance, and not
 * the person who asked.
 *
 * Errors: 42501 not Finance.
 */
create or replace function public.rpc_finance_paystack_payees()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_full boolean;
begin
  if not coalesce(authz.finance_reads(), false) then
    raise exception 'Only people who reach Finance can see this.' using errcode = '42501';
  end if;
  v_full := v_me is not null and coalesce(authz.has_full_finance(), false);

  return jsonb_build_object(
    'merchants', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'party_id', s.merchant_id, 'name', coalesce(m.trading_name, m.legal_name),
        'test', s.is_test, 'code', s.subaccount_code, 'schedule', s.schedule, 'status', s.status,
        'requested_by', r.display_name, 'requested_at', s.requested_at,
        'decided_by', d.display_name, 'decided_at', s.decided_at,
        'can_decide', coalesce(v_full and s.status = 'pending' and s.requested_by is not null
                               and s.requested_by <> v_me, false))
        order by coalesce(m.trading_name, m.legal_name), s.requested_at desc, s.id)
      from public.merchant_paystack_subaccount s
      join public.merchant m on m.id = s.merchant_id
      left join public.staff_user r on r.id = s.requested_by
      left join public.staff_user d on d.id = s.decided_by), '[]'::jsonb),
    'hosts', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'party_id', s.host_id, 'name', h.display_name,
        'test', s.is_test, 'code', s.subaccount_code, 'schedule', s.schedule, 'status', s.status,
        'requested_by', r.display_name, 'requested_at', s.requested_at,
        'decided_by', d.display_name, 'decided_at', s.decided_at,
        'can_decide', coalesce(v_full and s.status = 'pending' and s.requested_by is not null
                               and s.requested_by <> v_me, false))
        order by h.display_name, s.requested_at desc, s.id)
      from public.host_paystack_subaccount s
      join public.host h on h.id = s.host_id
      left join public.staff_user r on r.id = s.requested_by
      left join public.staff_user d on d.id = s.decided_by), '[]'::jsonb),
    'rider_transfers', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'reference', t.reference, 'kind', t.kind, 'rider_id', t.party_id,
        'rider_name', nullif(trim(coalesce(rd.first_name, '') || ' ' || coalesce(rd.last_name, '')), ''),
        'amount_cents', t.amount_cents, 'fee_cents', t.fee_cents, 'fee_paid_by', t.fee_paid_by,
        'test', t.is_test, 'state', t.state, 'failure_reason', t.failure_reason,
        'created_at', t.created_at, 'completed_at', t.completed_at)
        order by t.created_at desc, t.id desc)
      from (select * from public.paystack_transfer x
             where x.party_type::text = 'rider'
             order by x.created_at desc, x.id desc limit 100) t
      left join public.rider rd on rd.id = t.party_id), '[]'::jsonb),
    'rider_cities', coalesce((
      /* How an active rider is paid depends only on the city and on whether
         they are a test rider, so one rider of each such group is asked. */
      with grouped as (
        select rd.city_id, rd.accepts_test_payouts as test, count(*)::int as n,
               (array_agg(rd.id order by rd.id))[1] as sample
          from public.rider rd
         where rd.status = 'active' and rd.offboarded_at is null
         group by rd.city_id, rd.accepts_test_payouts
      ),
      moded as (
        select g.city_id, g.test, g.n, public.fn_rider_payout_mode(g.sample) as mode from grouped g
      ),
      per_city as (
        select x.city_id,
               sum(x.n)::int as riders,
               coalesce(sum(x.n) filter (where x.test), 0)::int as test_riders,
               coalesce(sum(x.n) filter (where x.mode = 'run'), 0)::int as on_run,
               coalesce(sum(x.n) filter (where x.mode = 'immediate'), 0)::int as immediate,
               coalesce(sum(x.n) filter (where x.mode = 'daily'), 0)::int as daily,
               coalesce(sum(x.n) filter (where x.mode = 'weekly'), 0)::int as weekly,
               coalesce(sum(x.n) filter (where x.mode = 'monthly'), 0)::int as monthly
          from moded x
         group by x.city_id
      )
      select jsonb_agg(jsonb_build_object(
               'city_id', p.city_id, 'city', c.name,
               'rule_mode', k.rules ->> 'mode', 'automatic_from', k.rules ->> 'automaticFrom',
               'riders', p.riders, 'test_riders', p.test_riders,
               'modes', jsonb_build_object('run', p.on_run, 'immediate', p.immediate,
                 'daily', p.daily, 'weekly', p.weekly, 'monthly', p.monthly))
               order by c.sort, c.name)
        from per_city p
        left join public.city c on c.id = p.city_id
        cross join lateral (select public.fn_rider_payout_rules(p.city_id) as rules) k), '[]'::jsonb),
    'rider_automatic_live', coalesce(settings.fn_bool('payouts.rider.automatic_live'), false),
    'live_worker_seen_at', (select w.live_seen_at from public.rider_payout_worker w limit 1));
end;
$$;

revoke execute on function public.rpc_finance_paystack_payees() from public, anon;
grant execute on function public.rpc_finance_paystack_payees() to authenticated;

-- ═══════════════════════════════════════════════ 4. waiting for a second person

/*
 * Every merchant and host sub-account and agreed commission waiting for a
 * decision, oldest first. The two rider queues are read from their own views
 * (rider_payout_request_queue_v, rider_payout_v). Reads only.
 *
 * Returns:
 *   { "merchant_subaccounts": [ SUB with "merchant_id" ],
 *     "host_subaccounts":     [ SUB with "host_id" ],
 *     "merchant_commissions": [
 *       { "id": uuid, "merchant_id": uuid, "name": text|null,
 *         "own_delivery_pct": numeric|null, "nexg_delivery_pct": numeric|null,  -- null: the preset
 *         "starts_on": date, "ends_on": date|null, "reason": text, "terms_ref": text|null,
 *         "requested_by": text|null, "requested_at": timestamptz, "can_decide": boolean } ],
 *     "host_commissions": [
 *       { "id": uuid, "host_id": uuid, "name": text|null, "pct": numeric,
 *         "starts_on": date, "ends_on": date|null, "reason": text, "terms_ref": text|null,
 *         "requested_by": text|null, "requested_at": timestamptz, "can_decide": boolean } ] }
 *
 *   SUB =
 *     { "id": uuid, "<merchant_id|host_id>": uuid, "name": text|null, "test": boolean,
 *       "code": text, "schedule": "auto"|"weekly"|"monthly"|"manual",
 *       "details": { "business_name": text|null, "settlement_bank": text|null,
 *                    "account_last4": text|null, "paystack_schedule": text|null,
 *                    "active": json|null },
 *       "note": text|null, "requested_by": text|null, "requested_at": timestamptz,
 *       "can_decide": boolean }
 *
 * can_decide uses each decide function's own rule:
 *   sub-accounts          full Finance, and not the requester (nobody, if the
 *                         requester is no longer on record);
 *   merchant commission   Finance, an Ops manager for the city or a super
 *                         admin, and not the requester;
 *   host commission       full Finance, and not the requester.
 *
 * A commission (its rate, reason and terms) is listed only to those its own
 * read gives it to as staff: rpc_merchant_commission_read (works the merchant,
 * or the finance or finance_lead role) and rpc_host_commission_read (works
 * hospitality in the host's city, or full Finance).
 *
 * Errors: 42501 not Finance.
 */
create or replace function public.rpc_finance_paystack_approvals()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_full boolean;
begin
  if not coalesce(authz.finance_reads(), false) then
    raise exception 'Only people who reach Finance can see this.' using errcode = '42501';
  end if;
  v_full := v_me is not null and coalesce(authz.has_full_finance(), false);

  return jsonb_build_object(
    'merchant_subaccounts', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'merchant_id', s.merchant_id, 'name', coalesce(m.trading_name, m.legal_name),
        'test', s.is_test, 'code', s.subaccount_code, 'schedule', s.schedule,
        'details', jsonb_build_object(
          'business_name', s.paystack_details ->> 'business_name',
          'settlement_bank', s.paystack_details ->> 'settlement_bank',
          'account_last4', s.paystack_details ->> 'account_last4',
          'paystack_schedule', s.paystack_details ->> 'paystack_schedule',
          'active', s.paystack_details -> 'active'),
        'note', s.note, 'requested_by', r.display_name, 'requested_at', s.requested_at,
        'can_decide', coalesce(v_full and s.requested_by is not null and s.requested_by <> v_me, false))
        order by s.requested_at, s.id)
      from public.merchant_paystack_subaccount s
      join public.merchant m on m.id = s.merchant_id
      left join public.staff_user r on r.id = s.requested_by
     where s.status = 'pending'), '[]'::jsonb),
    'host_subaccounts', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'host_id', s.host_id, 'name', h.display_name,
        'test', s.is_test, 'code', s.subaccount_code, 'schedule', s.schedule,
        'details', jsonb_build_object(
          'business_name', s.paystack_details ->> 'business_name',
          'settlement_bank', s.paystack_details ->> 'settlement_bank',
          'account_last4', s.paystack_details ->> 'account_last4',
          'paystack_schedule', s.paystack_details ->> 'paystack_schedule',
          'active', s.paystack_details -> 'active'),
        'note', s.note, 'requested_by', r.display_name, 'requested_at', s.requested_at,
        'can_decide', coalesce(v_full and s.requested_by is not null and s.requested_by <> v_me, false))
        order by s.requested_at, s.id)
      from public.host_paystack_subaccount s
      join public.host h on h.id = s.host_id
      left join public.staff_user r on r.id = s.requested_by
     where s.status = 'pending'), '[]'::jsonb),
    'merchant_commissions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'merchant_id', t.merchant_id, 'name', coalesce(m.trading_name, m.legal_name),
        'own_delivery_pct', t.own_delivery_pct, 'nexg_delivery_pct', t.nexg_delivery_pct,
        'starts_on', t.starts_on, 'ends_on', t.ends_on, 'reason', t.reason, 'terms_ref', t.terms_ref,
        'requested_by', r.display_name, 'requested_at', t.requested_at,
        'can_decide', coalesce(public.fn_merchant_commission_decider(m.city_id)
                               and t.requested_by is distinct from v_me, false))
        order by t.requested_at, t.id)
      from public.merchant_commission_term t
      join public.merchant m on m.id = t.merchant_id
      left join public.staff_user r on r.id = t.requested_by
     where t.status = 'pending'
       -- The staff rule of rpc_merchant_commission_read.
       and v_me is not null
       and (authz.works_merchant(m.id) or authz.has_role('finance')
            or authz.has_role('finance_lead'))), '[]'::jsonb),
    'host_commissions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'host_id', t.host_id, 'name', h.display_name, 'pct', t.pct,
        'starts_on', t.starts_on, 'ends_on', t.ends_on, 'reason', t.reason, 'terms_ref', t.terms_ref,
        'requested_by', r.display_name, 'requested_at', t.requested_at,
        'can_decide', coalesce(v_full and t.requested_by is distinct from v_me, false))
        order by t.requested_at, t.id)
      from public.host_commission_term t
      join public.host h on h.id = t.host_id
      left join public.staff_user r on r.id = t.requested_by
     where t.status = 'pending'
       -- The staff rule of rpc_host_commission_read.
       and v_me is not null
       and (authz.works_hospitality(h.city_id) or v_full)), '[]'::jsonb));
end;
$$;

revoke execute on function public.rpc_finance_paystack_approvals() from public, anon;
grant execute on function public.rpc_finance_paystack_approvals() to authenticated;

-- ═══════════════════════════════════════════════ 5. refunds

/* What a Paystack refund is for, in a few words. Internal. */
create or replace function public.fn_paystack_refund_label(
  p_kind text, p_refund_id uuid, p_stay_id uuid, p_payment_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select case p_kind
    when 'order' then coalesce((
      select 'Order ' || o.reference || coalesce(' · ' || m.trading_name, '')
        from public.refund f
        join public."order" o on o.id = f.order_id
        left join public.merchant m on m.id = o.merchant_id
       where f.id = p_refund_id), 'Order')
    when 'stay' then coalesce((
      select 'Stay · ' || coalesce(pr.name, 'NexG home') || ' · '
             || to_char(s.check_in at time zone 'Africa/Nairobi', 'FMDD Mon YYYY')
        from public.stay s
        left join public.property pr on pr.id = s.property_id
       where s.id = p_stay_id), 'Stay')
    when 'booking' then coalesce((
      select 'Booking' || coalesce(' · ' || m.trading_name, '') || coalesce(' · ' || nullif(b.title, ''), '')
        from public.payment p
        left join public.customer_engine_booking b on b.id = p.customer_engine_booking_id
        left join public.merchant m on m.id = coalesce(b.merchant_id, p.merchant_id)
       where p.id = p_payment_id), 'Booking')
    when 'cinema' then coalesce((
      select 'Cinema · ' || f.title || coalesce(' · ' || m.trading_name, '')
        from public.payment p
        join cinema.hold h on h.id = p.cinema_hold_id
        join cinema.showing w on w.id = h.showing_id
        join cinema.film f on f.id = w.film_id
        join cinema.screen c on c.id = w.screen_id
        left join public.merchant m on m.id = c.merchant_id
       where p.id = p_payment_id), 'Cinema')
  end
$$;

revoke execute on function public.fn_paystack_refund_label(text, uuid, uuid, uuid)
  from public, anon, authenticated;

/*
 * Refunds sent through Paystack, and Paystack money that is due back and has
 * not been sent. Reads only.
 *
 * Arguments: p_show chooses the "refunds" rows; "due" is always the whole list.
 *   'due' (default)  tries not processed. A failed try is left out once the
 *                    money went back another way or another try replaced it.
 *   'refunded'       processed tries.
 *   'all'            every try.
 *
 * Returns:
 *   { "show": text,
 *     "refunds": [                    -- newest first, 200 at most
 *       { "id": uuid, "reference": text,            -- NexG's NXR- reference
 *         "kind": "order"|"stay"|"booking"|"cinema",
 *         "target_id": uuid|null,      -- order: refund id; stay: stay id;
 *                                      -- booking: payment id; cinema: seat hold id
 *         "label": text, "paid_reference": text,    -- the NexG payment refunded
 *         "amount_cents": int, "is_test": boolean,
 *         "state": "opened"|"pending"|"processing"|"processed"|"failed"|"needs-attention",
 *         "failure_reason": text|null,
 *         "settled": boolean,          -- the money is recorded as back, by any route
 *         "by_hand": boolean,          -- a person finishes it in the Paystack dashboard
 *         "created_by": text|null,     -- null: the system (cinema worker)
 *         "created_at": timestamptz, "updated_at": timestamptz } ],
 *     "due": [                        -- longest waiting first
 *       { "kind": "order"|"stay"|"booking"|"cinema",
 *         "target_id": uuid,           -- what refundThroughPaystack(kind, target_id) takes
 *         "label": text, "paid_reference": text,
 *         "amount_cents": int, "is_test": boolean, "due_since": timestamptz,
 *         "can_send": boolean,         -- the caller passes rpc_paystack_refund_open's checks
 *         "by_hand": boolean,          -- cinema only: the worker will not send it
 *         "last_try": null | { "reference": text, "state": text,
 *                              "failure_reason": text|null, "updated_at": timestamptz } } ] }
 *
 * The cinema worker sends cinema refunds itself (cinema_due_work), so one is by
 * hand only when its try failed, or the payment is live and the rule
 * payouts.cinema.automatic_live_refunds is off. Any refund that needs attention
 * is by hand too. A try that is pending or processing with Paystack, or whose
 * money is recorded as back, never is.
 *
 * Due means: an approved order refund to the original payment; a stay refund
 * due and not recorded; a paid booking the booking engine refused; a cinema
 * hold with a refund due. In each, the payment came through Paystack, and no
 * try is with Paystack (one opened but never sent is still due).
 * can_send also needs the console to hold the key for the payment's mode,
 * which the database does not decide here.
 *
 * Errors: 42501 not Finance; 22023 unknown p_show.
 */
create or replace function public.rpc_finance_paystack_refunds(p_show text default 'due')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_payments boolean;
  v_hospitality boolean;
  v_cinema_live boolean := coalesce(settings.fn_bool('payouts.cinema.automatic_live_refunds'), false);
begin
  if not coalesce(authz.finance_reads(), false) then
    raise exception 'Only people who reach Finance can see this.' using errcode = '42501';
  end if;
  if p_show is null or p_show not in ('due', 'refunded', 'all') then
    raise exception 'Show due, refunded or all.' using errcode = '22023';
  end if;
  -- As fn_payments_require and the stay branch of rpc_paystack_refund_open.
  v_payments := coalesce(authz.reaches_module('finance') or authz.reaches_module('orders'), false);
  v_hospitality := coalesce(authz.works_hospitality(null), false);

  return jsonb_build_object(
    'show', p_show,
    'refunds', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', y.id, 'reference', y.reference, 'kind', y.kind, 'target_id', y.target_id,
               'label', public.fn_paystack_refund_label(y.kind, y.refund_id, y.stay_id, y.payment_id),
               'paid_reference', y.paid_reference, 'amount_cents', y.amount_cents,
               'is_test', y.is_test, 'state', y.state, 'failure_reason', y.failure_reason,
               'settled', y.settled,
               'by_hand', not y.settled and (y.state = 'needs-attention'
                 or (y.kind = 'cinema' and (
                      (y.state = 'failed' and not y.replaced)
                      or (y.state = 'opened' and not y.is_test and not v_cinema_live)))),
               'created_by', y.created_by_name, 'created_at', y.created_at,
               'updated_at', y.updated_at)
             order by y.created_at desc, y.id desc)
        from (
          select z.*
            from (
              select x.id, x.reference, x.kind, x.refund_id, x.stay_id, x.payment_id, x.amount_cents,
                     x.is_test, x.state, x.failure_reason, x.created_at, x.updated_at,
                     pm.reference as paid_reference, u.display_name as created_by_name,
                     case x.kind when 'order' then x.refund_id when 'stay' then x.stay_id
                                 when 'booking' then x.payment_id else pm.cinema_hold_id end as target_id,
                     coalesce(case x.kind
                       when 'order' then f.status = 'issued'
                       when 'stay' then s.refunded_at is not null
                       when 'cinema' then h.state = 'refunded'
                       else pm.state = 'reversed' end, false) as settled,
                     exists (select 1 from public.paystack_refund o
                              where o.id <> x.id and o.state <> 'failed' and o.kind = x.kind
                                and coalesce(o.refund_id, o.stay_id, o.payment_id)
                                    = coalesce(x.refund_id, x.stay_id, x.payment_id)) as replaced
                from public.paystack_refund x
                join public.payment pm on pm.id = x.payment_id
                left join public.refund f on f.id = x.refund_id
                left join public.stay s on s.id = x.stay_id
                left join cinema.hold h on h.id = pm.cinema_hold_id
                left join public.staff_user u on u.id = x.created_by
            ) z
           where p_show = 'all'
              or (p_show = 'refunded' and z.state = 'processed')
              or (p_show = 'due' and z.state <> 'processed'
                  and not (z.state = 'failed' and (z.settled or z.replaced)))
           order by z.created_at desc, z.id desc
           limit 200
        ) y), '[]'::jsonb),
    'due', coalesce((
      with owed as (
        select 'order'::text as kind, f.id as target_id, f.id as match_id,
               f.id as refund_id, null::uuid as stay_id, p.id as payment_id,
               f.amount_cents::bigint as amount_cents, p.is_test, p.reference as paid_reference,
               f.requested_at as due_since,
               v_me is not null
                 and (v_payments or coalesce(authz.works_live_ops(o.city_id), false))
                 and f.amount_cents <= p.amount_cents as can_send
          from public.refund f
          join public."order" o on o.id = f.order_id
          join lateral (select * from public.payment q
                         where q.order_id = f.order_id and q.state = 'paid'
                         order by q.paid_at desc limit 1) p on true
         where f.status = 'approved' and f.method = 'original'
           and p.provider = 'paystack' and p.provider_ref is not null
        union all
        select 'stay', s.id, s.id, null, s.id, p.id,
               ledger.from_kes(coalesce(s.refund_amount_kes, s.paid_kes)), p.is_test, p.reference,
               s.refund_due_at,
               v_me is not null and v_hospitality
                 and ledger.from_kes(coalesce(s.refund_amount_kes, s.paid_kes)) <= p.amount_cents
          from public.stay s
          join lateral (select * from public.payment q
                         where q.stay_id = s.id and q.state = 'paid'
                         order by q.paid_at desc limit 1) p on true
         where s.refund_due_at is not null and s.refunded_at is null
           and coalesce(s.refund_amount_kes, s.paid_kes, 0) > 0
           and p.provider = 'paystack' and p.provider_ref is not null
        union all
        select 'booking', p.id, p.id, null, null, p.id, p.amount_cents, p.is_test, p.reference,
               p.paid_at,
               v_me is not null and (v_payments or coalesce(authz.works_live_ops(p.city_id), false))
          from public.payment p
         where p.state = 'paid' and p.customer_engine_booking_id is not null
           and p.engine_settle_error is not null
           and p.provider = 'paystack' and p.provider_ref is not null
        union all
        select 'cinema', h.id, p.id, null, null, p.id, p.amount_cents, p.is_test, p.reference,
               h.updated_at, false
          from cinema.hold h
          join lateral (select * from public.payment q
                         where q.cinema_hold_id = h.id and q.state = 'paid'
                           and (h.payment_reference is null or q.reference = h.payment_reference)
                         order by q.paid_at desc limit 1) p on true
         where h.state = 'refund_due'
           and p.provider = 'paystack' and p.provider_ref is not null
      )
      select jsonb_agg(jsonb_build_object(
               'kind', d.kind, 'target_id', d.target_id,
               'label', public.fn_paystack_refund_label(d.kind, d.refund_id, d.stay_id, d.payment_id),
               'paid_reference', d.paid_reference, 'amount_cents', d.amount_cents,
               'is_test', d.is_test, 'due_since', d.due_since, 'can_send', d.can_send,
               'by_hand', d.kind = 'cinema' and (coalesce(t.state = 'failed', false)
                 or (not d.is_test and not v_cinema_live)),
               'last_try', case when t.id is null then null else jsonb_build_object(
                 'reference', t.reference, 'state', t.state, 'failure_reason', t.failure_reason,
                 'updated_at', t.updated_at) end)
             order by d.due_since, d.target_id)
        from owed d
        -- The try that has not failed, if any; else the latest failed one.
        left join lateral (
          select r.* from public.paystack_refund r
           where r.kind = d.kind and coalesce(r.refund_id, r.stay_id, r.payment_id) = d.match_id
           order by (r.state = 'failed'), r.created_at desc, r.id desc
           limit 1) t on true
       where t.id is null or t.state = 'failed'
          or (t.state = 'opened' and t.paystack_refund_id is null)), '[]'::jsonb));
end;
$$;

revoke execute on function public.rpc_finance_paystack_refunds(text) from public, anon;
grant execute on function public.rpc_finance_paystack_refunds(text) to authenticated;

-- ═══════════════════════════════════════════════ 6. problems that need a person

/* The audit actions the Problems tab lists. Internal. */
create or replace function public.fn_paystack_problem_actions()
returns text[]
language sql
immutable
security definer
set search_path = ''
as $$
  select array[
    'payment.split_not_made',
    'payment.paystack_refund_failed',
    'payment.paystack_refund_unmatched',
    'payment.paystack_refund_after_failed_try',
    'payment.paystack_unmatched',
    'payment.paystack_paid_after_close',
    'payment.paystack_after_close_failed',
    'payment.amount_mismatch',
    'stay.split_paid_late',
    'stay.refund_possible_double',
    'host.payout_changed_during_run',
    'cinema.settle_failed',
    'cinema.refunded_but_booked',
    'cinema.payment_close_failed',
    'payout.paystack_transfer_failed',
    'payout.paystack_transfer_late_success',
    'payout.rider_payout_error',
    'payout.rider_payout_held',
    'ledger.posting_failed']::text[]
$$;

revoke execute on function public.fn_paystack_problem_actions() from public, anon, authenticated;

/*
 * Whether this staff member had full Finance, or was a super admin, at that
 * moment: a grant made by then and not then revoked or expired, read as
 * authz.has_full_finance reads grants. A review keeps counting after its
 * reviewer's role ends. Internal.
 */
create or replace function authz.staff_had_full_finance(p_staff_id uuid, p_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.role_grant rg
    join public.role r on r.id = rg.role_id
    where rg.staff_user_id = p_staff_id
      and rg.created_at <= p_at
      and (rg.revoked_at is null or rg.revoked_at > p_at)
      and (rg.expires_at is null or rg.expires_at > p_at)
      and (r.key = 'super_admin' or exists (
        select 1 from public.role_module_access a
        where a.role_key = r.key and a.module_key = 'finance' and a.level = 'full')))
$$;

revoke execute on function authz.staff_had_full_finance(uuid, timestamptz)
  from public, anon, authenticated;

/*
 * Paystack and money problems waiting for a person: a fixed list of audit
 * actions (so everyone who reaches Finance sees the same list, whatever their
 * audit access), refunds on split orders nobody has said who carries,
 * invoiced recoveries not yet paid, and transfers waiting on Paystack's OTP.
 * Reads only. "Mark reviewed" is rpc_finance_paystack_problem_review.
 *
 * A problem is closed only when full Finance or a super admin reviewed it
 * (authz.staff_had_full_finance). Anyone else's review, from the Audit console,
 * leaves it open here, with review_state 'needs_review'.
 *
 * Arguments: p_limit how many events (default 100, 1 to 500). Open events come
 * first, then closed ones, each newest first: the screen hides those whose
 * review_state is 'reviewed'.
 *
 * Returns:
 *   { "events": [
 *       { "event_id": int, "at": timestamptz, "action": text, "action_label": text,
 *         "severity": "info"|"notice"|"high",
 *         "target_type": text|null, "target_id": uuid|null, "target_label": text|null,
 *         "reason": text|null, "details": json|null,     -- the event's "after"
 *         "review_state": "none"|"needs_review"|"reviewed"|"escalated",
 *         "reviewed_by": text|null, "reviewed_at": timestamptz|null, "review_note": text|null,
 *         "mine": boolean } ],               -- the caller's own action
 *     "open_events": int,                   -- all listed events not closed
 *     "refunds_to_decide": [                -- oldest first
 *       { "refund_id": uuid, "merchant_id": uuid, "name": text|null, "order_reference": text,
 *         "refund_cents": int, "share_cents": int,  -- what Paystack paid the merchant
 *         "requested_at": timestamptz, "test": boolean } ],
 *     "invoiced_recoveries": [              -- oldest first
 *       { "id": uuid, "merchant_id": uuid, "name": text|null, "order_reference": text|null,
 *         "amount_cents": int, "note": text|null, "decided_at": timestamptz,
 *         "test": boolean } ],
 *     "otp_transfers": [                    -- oldest first
 *       { "id": uuid, "reference": text, "rider_id": uuid, "rider_name": text|null,
 *         "amount_cents": int, "test": boolean,
 *         "created_at": timestamptz, "updated_at": timestamptz } ],
 *     "can_decide": boolean }               -- full Finance: may decide and settle recoveries
 *
 * Errors: 42501 not Finance.
 */
create or replace function public.rpc_finance_paystack_problems(p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
  c_actions constant text[] := public.fn_paystack_problem_actions();
begin
  if not coalesce(authz.finance_reads(), false) then
    raise exception 'Only people who reach Finance can see this.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
               'event_id', e.id, 'at', e.at, 'action', e.action,
               'action_label', coalesce(g.description, e.action), 'severity', e.severity,
               'target_type', e.target_type, 'target_id', e.target_id,
               'target_label', coalesce(e.target_label, case e.target_type
                 when 'merchant' then (select m.trading_name from public.merchant m where m.id = e.target_id)
                 when 'host' then (select h.display_name from public.host h where h.id = e.target_id)
                 when 'rider' then (select nullif(trim(coalesce(d.first_name, '') || ' '
                                      || coalesce(d.last_name, '')), '')
                                      from public.rider d where d.id = e.target_id)
                 when 'order' then (select o.reference from public."order" o where o.id = e.target_id)
                 when 'payment' then (select p.reference from public.payment p where p.id = e.target_id)
                 when 'stay' then (select pr.name from public.stay s
                                     join public.property pr on pr.id = s.property_id
                                    where s.id = e.target_id)
                 when 'cinema_hold' then (select f.title from cinema.hold h
                                            join cinema.showing w on w.id = h.showing_id
                                            join cinema.film f on f.id = w.film_id
                                           where h.id = e.target_id)
               end),
               'reason', e.reason, 'details', e.after,
               'review_state', e.review_state, 'reviewed_by', u.display_name,
               'reviewed_at', e.reviewed_at, 'review_note', e.review_note,
               'mine', coalesce(e.actor_id = v_me, false))
             order by e.closed, e.at desc, e.id desc)
        from (
          select a.id, a.at, a.action, a.severity, a.target_type, a.target_id, a.target_label,
                 a.reason, a.after, a.actor_id, w.closed,
                 case when k.review_state = 'reviewed' and not w.closed then 'needs_review'
                      else coalesce(k.review_state, 'none') end as review_state,
                 k.reviewed_by, k.reviewed_at, k.review_note
            from audit.audit_event a
            left join audit.event_meta k on k.event_id = a.id
           cross join lateral (select coalesce(k.review_state = 'reviewed'
                    and authz.staff_had_full_finance(k.reviewed_by, k.reviewed_at), false) as closed) w
           where a.action = any (c_actions)
           order by w.closed, a.at desc, a.id desc
           limit v_limit
        ) e
        left join audit.action_registry g on g.action = e.action
        left join public.staff_user u on u.id = e.reviewed_by), '[]'::jsonb),
    'open_events', (
      select count(*)
        from audit.audit_event a
        left join audit.event_meta k on k.event_id = a.id
       where a.action = any (c_actions)
         and not coalesce(k.review_state = 'reviewed'
               and authz.staff_had_full_finance(k.reviewed_by, k.reviewed_at), false)),
    -- As rpc_merchant_split_overview's refundsToDecide, for every merchant.
    'refunds_to_decide', coalesce((
      select jsonb_agg(jsonb_build_object(
               'refund_id', y.refund_id, 'merchant_id', y.merchant_id, 'name', y.name,
               'order_reference', y.order_reference, 'refund_cents', y.refund_cents,
               'share_cents', y.share_cents, 'requested_at', y.requested_at, 'test', y.is_test)
             order by y.requested_at, y.refund_id)
        from (
          select distinct on (f.id)
                 f.id as refund_id, a.split_merchant_id as merchant_id,
                 coalesce(m.trading_name, m.legal_name) as name, o.reference as order_reference,
                 f.amount_cents as refund_cents, a.split_share_cents as share_cents,
                 f.requested_at, a.is_test
            from public.refund f
            join public."order" o on o.id = f.order_id
            join public.payment pm on pm.order_id = o.id and pm.state in ('paid', 'reversed')
            join public.paystack_attempt a on a.payment_id = pm.id and a.outcome = 'paid'
                                          and a.split_subaccount is not null
            join public.merchant m on m.id = a.split_merchant_id
           where f.status = 'issued'
             and not exists (select 1 from public.merchant_recovery x where x.refund_id = f.id)
           order by f.id, a.created_at desc
        ) y), '[]'::jsonb),
    'invoiced_recoveries', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'merchant_id', x.merchant_id,
               'name', coalesce(m.trading_name, m.legal_name), 'order_reference', o.reference,
               'amount_cents', x.amount_cents, 'note', x.note, 'decided_at', x.decided_at,
               'test', x.is_test)
             order by x.decided_at, x.id)
        from public.merchant_recovery x
        join public.merchant m on m.id = x.merchant_id
        left join public."order" o on o.id = x.order_id
       where x.state = 'invoiced'), '[]'::jsonb),
    'otp_transfers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'reference', t.reference, 'rider_id', t.party_id,
               'rider_name', nullif(trim(coalesce(d.first_name, '') || ' ' || coalesce(d.last_name, '')), ''),
               'amount_cents', t.amount_cents, 'test', t.is_test,
               'created_at', t.created_at, 'updated_at', t.updated_at)
             order by t.created_at, t.id)
        from public.paystack_transfer t
        left join public.rider d on d.id = t.party_id
       where t.state = 'otp'), '[]'::jsonb),
    'can_decide', v_me is not null and coalesce(authz.has_full_finance(), false));
end;
$$;

revoke execute on function public.rpc_finance_paystack_problems(integer) from public, anon;
grant execute on function public.rpc_finance_paystack_problems(integer) to authenticated;

/*
 * "Mark reviewed" on the Problems tab. The writing is audit.rpc_review_event,
 * which refuses the caller's own action and audits audit.event_reviewed.
 *
 * Arguments: p_event_id one of the listed problems; p_note what was done
 * (optional, the first 500 characters are kept).
 *
 * Returns: { "ok": true }
 *
 * Errors: 42501 not full Finance or a super admin; 22023 not a listed problem;
 * P0001 the caller's own action.
 */
create or replace function public.rpc_finance_paystack_problem_review(
  p_event_id bigint, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if authz.staff_id() is null or not coalesce(authz.has_full_finance(), false) then
    raise exception 'Only full Finance or a super admin marks a Paystack problem reviewed.'
      using errcode = '42501';
  end if;
  if not exists (select 1 from audit.audit_event a
                  where a.id = p_event_id
                    and a.action = any (public.fn_paystack_problem_actions())) then
    raise exception 'That is not one of the Paystack problems.' using errcode = '22023';
  end if;
  return audit.rpc_review_event(p_event_id, 'reviewed',
    left(nullif(btrim(coalesce(p_note, '')), ''), 500));
end;
$$;

revoke execute on function public.rpc_finance_paystack_problem_review(bigint, text) from public, anon;
grant execute on function public.rpc_finance_paystack_problem_review(bigint, text) to authenticated;

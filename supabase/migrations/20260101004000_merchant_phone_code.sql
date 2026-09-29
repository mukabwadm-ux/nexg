-- Verifying the phone number the whole account hangs off.
--
-- The number is how a rider reaches the shop, how the merchant team calls
-- about a rejected permit, and how the merchant signs in later. Taking it on
-- trust means a typo silently produces an unreachable business, and a
-- deliberate wrong number produces a listing in someone else's name.
--
-- The code is real: six digits, hashed, five minutes, three attempts. What is
-- not real yet is the delivery — there is no SMS sender on this account. So
-- rpc_merchant_request_phone_code says whether it could send, and the caller
-- decides what to tell the merchant. It never pretends.

alter table public.merchant
  add column if not exists phone_code_hash text,
  add column if not exists phone_code_expires_at timestamptz,
  add column if not exists phone_code_attempts smallint not null default 0,
  add column if not exists phone_verified_at timestamptz;

comment on column public.merchant.phone_verified_at is
  'When the merchant proved they hold this number. Null means nobody has checked, which the merchant console shows on the application.';

/* Verification state is an assertion about the merchant, so it joins the
   list they may not write themselves. */
create or replace function public.tg_merchant_protected_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if authz.can_manage_merchants(coalesce(old.city_id, new.city_id)) then
    return new;
  end if;

  if new.status is distinct from old.status
     or new.status_reason is distinct from old.status_reason
     or new.featured is distinct from old.featured
     or new.went_live_by is distinct from old.went_live_by
     or new.went_live_at is distinct from old.went_live_at
     or new.settlement_account is distinct from old.settlement_account
     or new.submitted_at is distinct from old.submitted_at
     or new.waitlisted_at is distinct from old.waitlisted_at
     or new.credentials_sent_at is distinct from old.credentials_sent_at
     or new.password_set_at is distinct from old.password_set_at
     or new.payout_name_lookup is distinct from old.payout_name_lookup
     or new.requires_ops_mapping is distinct from old.requires_ops_mapping
     or new.resume_token_hash is distinct from old.resume_token_hash
     or new.resume_token_expires_at is distinct from old.resume_token_expires_at
     or new.phone_code_hash is distinct from old.phone_code_hash
     or new.phone_code_expires_at is distinct from old.phone_code_expires_at
     or new.phone_code_attempts is distinct from old.phone_code_attempts
     or new.phone_verified_at is distinct from old.phone_verified_at
  then
    raise exception 'That is not yours to set.' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- A log of everything we try to send.
--
-- public.notification already exists and is shaped for the support desk —
-- it carries a ticket id and an email address. Onboarding sends SMS and
-- WhatsApp to phone numbers about merchants and riders, so it needs a log of
-- its own rather than a widened version of that one.
--
-- Every send writes a row whether or not a provider exists, including the
-- ones that were skipped for want of a sender. "We never sent it" is the
-- answer to most questions about a merchant who says they heard nothing, and
-- it is only available if the attempt was recorded.

create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('sms', 'whatsapp', 'email', 'console')),
  recipient text not null,
  template text not null,
  payload jsonb not null default '{}',
  provider_id text,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'failed', 'skipped')),
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index notification_log_recipient_idx on public.notification_log (recipient, created_at desc);
create index notification_log_template_idx on public.notification_log (template, created_at desc);

alter table public.notification_log enable row level security;

/* Nobody reads this from the public site. Staff read it in the console, and
   the service role writes it. No policy grants anon or a merchant anything —
   the log names phone numbers belonging to other people. */
create policy notification_log_read_staff on public.notification_log
  for select to authenticated
  using (authz.staff_id() is not null);

comment on table public.notification_log is
  'Every message NexG tried to send, including the ones skipped because no provider was configured.';

create or replace function public.rpc_merchant_request_phone_code(p_merchant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  v_code text;
  v_bytes bytea;
  v_sender text;
begin
  m := public.fn_merchant_draft_for_write(p_merchant_id);

  if m.phone_verified_at is not null then
    return jsonb_build_object('verified', true);
  end if;

  /*
   * Six digits from a cryptographic source rather than random(), which is
   * seeded per session and predictable. Four bytes make a 32-bit number, so
   * the modulo bias across a million codes is about two in ten thousand —
   * far below what three attempts in five minutes could exploit.
   *
   * lpad takes text. An integer argument raises "function lpad(integer,
   * integer, unknown) does not exist", which PostgREST reports as a 404 on
   * the RPC and looks for all the world like a missing function.
   */
  v_bytes := extensions.gen_random_bytes(4);
  v_code := lpad(
    ((  (get_byte(v_bytes, 0)::bigint << 24)
      | (get_byte(v_bytes, 1)::bigint << 16)
      | (get_byte(v_bytes, 2)::bigint << 8)
      |  get_byte(v_bytes, 3)::bigint) % 1000000)::text,
    6, '0');

  update public.merchant
  set phone_code_hash = encode(extensions.digest(v_code, 'sha256'), 'hex'),
      phone_code_expires_at = now() + interval '5 minutes',
      phone_code_attempts = 0
  where id = m.id;

  select value #>> '{}' into v_sender
  from public.setting where key = 'sms_provider' and scope = 'global';

  insert into public.notification_log (channel, recipient, template, payload, status)
  values (
    'sms', m.contact_phone, 'merchant_otp',
    jsonb_build_object('merchant_id', m.id),
    case when v_sender is null then 'skipped' else 'queued' end
  );

  return jsonb_build_object(
    'verified', false,
    'delivered', v_sender is not null,
    /*
     * Returned only while there is no sender, so the flow can put the code on
     * screen and say why. The moment sms_provider is set this is null and the
     * code exists solely in the SMS.
     */
    'code', case when v_sender is null then v_code end
  );
end;
$$;

create or replace function public.rpc_merchant_verify_phone_code(
  p_merchant_id uuid,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.merchant;
begin
  m := public.fn_merchant_draft_for_write(p_merchant_id);

  if m.phone_verified_at is not null then
    return jsonb_build_object('verified', true);
  end if;

  if m.phone_code_hash is null or m.phone_code_expires_at < now() then
    raise exception 'That code has expired. Ask for a new one.'
      using errcode = 'no_data_found';
  end if;

  if m.phone_code_attempts >= 3 then
    raise exception 'Too many tries. Ask for a new code.' using errcode = 'check_violation';
  end if;

  if encode(extensions.digest(trim(p_code), 'sha256'), 'hex') <> m.phone_code_hash then
    update public.merchant
    set phone_code_attempts = phone_code_attempts + 1
    where id = m.id;
    raise exception 'That code is not right.' using errcode = 'check_violation';
  end if;

  update public.merchant
  set phone_verified_at = now(),
      phone_code_hash = null,
      phone_code_expires_at = null
  where id = m.id;

  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type,
    p_module => 'merchant',
    p_action => 'merchant.phone_verified',
    p_target_type => 'merchant',
    p_target_id => m.id
  );

  return jsonb_build_object('verified', true);
end;
$$;

grant execute on function public.rpc_merchant_request_phone_code(uuid) to authenticated;
grant execute on function public.rpc_merchant_verify_phone_code(uuid, text) to authenticated;

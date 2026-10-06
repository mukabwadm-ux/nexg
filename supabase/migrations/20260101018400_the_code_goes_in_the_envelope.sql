-- The code goes in the envelope.
--
-- Both OTP functions wrote a row to `notification_log` saying a
-- code had been sent, and the code was nowhere in it. That was
-- fine only because of the fallback underneath: with no provider
-- configured the function returns the code to the caller and the
-- screen shows it. Onboarding worked.
--
-- What did not work was turning the provider on. The moment
-- `sms_provider` is set, the fallback stops returning the code
-- and the queued row still has nothing in it to send — so the
-- act of enabling SMS is what breaks SMS. Nobody would look
-- there, because the change was supposed to fix it.
--
-- These now render the message and hand it to the outbox, where
-- the sender can read it and no staff member can. The on-screen
-- fallback stays exactly as it was: still useful, no longer the
-- only thing holding the flow up.

create or replace function rpc_merchant_request_phone_code(p_merchant_id uuid)
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
  v_expires timestamptz;
begin
  m := public.fn_merchant_draft_for_write(p_merchant_id);

  if m.phone_verified_at is not null then
    return jsonb_build_object('verified', true);
  end if;

  /*
   * Rejection sampling is not used: the modulo bias across 2^32
   * into 10^6 is about one part in four thousand, far below
   * what three attempts in five minutes could exploit.
   *
   * lpad takes text. An integer argument raises "function
   * lpad(integer, integer, unknown) does not exist", which
   * PostgREST reports as a 404 on the RPC and looks for all the
   * world like a missing function.
   */
  v_bytes := extensions.gen_random_bytes(4);
  v_code := lpad(
    ((  (get_byte(v_bytes, 0)::bigint << 24)
      | (get_byte(v_bytes, 1)::bigint << 16)
      | (get_byte(v_bytes, 2)::bigint << 8)
      |  get_byte(v_bytes, 3)::bigint) % 1000000)::text,
    6, '0');

  v_expires := now() + interval '5 minutes';

  update public.merchant
  set phone_code_hash = encode(extensions.digest(v_code, 'sha256'), 'hex'),
      phone_code_expires_at = v_expires,
      phone_code_attempts = 0
  where id = m.id;

  select value #>> '{}' into v_sender
  from public.setting where key = 'sms_provider' and scope = 'global';

  /*
   * Enqueued with the rendered body and `sensitive`, so the
   * sender can read it, nothing else can, and it is destroyed
   * on delivery. `expires_at` matches the code's own expiry: a
   * code that arrives after it has stopped working is worse
   * than one that never arrives, because the person tries it.
   */
  perform public.fn_notify_enqueue(
    'sms', m.contact_phone, 'merchant_otp',
    v_code || ' is your NexG verification code. It expires in 5 minutes.',
    null,
    jsonb_build_object('merchant_id', m.id),
    true,
    v_expires);

  return jsonb_build_object(
    'verified', false,
    'delivered', v_sender is not null,
    /*
     * Returned only while there is no sender, so the flow can
     * put the code on screen and say why. The moment
     * sms_provider is set this is null and the code exists
     * solely in the SMS — which, now, actually carries it.
     */
    'code', case when v_sender is null then v_code end
  );
end;
$$;

create or replace function rpc_rider_request_phone_code(p_rider_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rider;
  v_code text;
  v_bytes bytea;
  v_sender text;
  v_expires timestamptz;
begin
  r := public.fn_rider_draft_for_write(p_rider_id);

  if r.phone_verified_at is not null then
    return jsonb_build_object('verified', true);
  end if;

  v_bytes := extensions.gen_random_bytes(4);
  v_code := lpad(
    ((  (get_byte(v_bytes, 0)::bigint << 24)
      | (get_byte(v_bytes, 1)::bigint << 16)
      | (get_byte(v_bytes, 2)::bigint << 8)
      |  get_byte(v_bytes, 3)::bigint) % 1000000)::text,
    6, '0');

  v_expires := now() + interval '5 minutes';

  update public.rider
  set phone_code_hash = encode(extensions.digest(v_code, 'sha256'), 'hex'),
      phone_code_expires_at = v_expires,
      phone_code_attempts = 0
  where id = r.id;

  select value #>> '{}' into v_sender
  from public.setting where key = 'sms_provider' and scope = 'global';

  perform public.fn_notify_enqueue(
    'sms', r.phone, 'rider_otp',
    v_code || ' is your NexG verification code. It expires in 5 minutes.',
    null,
    jsonb_build_object('rider_id', r.id),
    true,
    v_expires);

  return jsonb_build_object(
    'verified', false,
    'delivered', v_sender is not null,
    /* Only while no sender exists, so the flow can show it and say why. */
    'code', case when v_sender is null then v_code end
  );
end;
$$;

-- ════════════════════ the nine that were already skipped

/*
 * The messages that went nowhere while there was no sender are
 * not resurrected. Their bodies were never rendered, so there
 * is nothing to send — and a verification code from three weeks
 * ago is not worth sending even if there were.
 *
 * They are marked so that the Settings screen can say "nine
 * were lost before a provider existed" rather than leaving them
 * indistinguishable from messages still waiting to go.
 */
update notification_log
   set error = 'No provider was configured when this was raised. Never rendered, never sent.'
 where status = 'skipped' and error is null;

comment on column notification_log.status is
  'queued means an outbox row exists and the sender will take it. skipped means no provider existed when it was raised — nothing was rendered and nothing can be recovered. sent and failed are the sender''s own verdicts.';

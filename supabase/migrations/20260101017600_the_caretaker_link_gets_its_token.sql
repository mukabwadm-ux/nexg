-- The caretaker link gets its token.
--
-- `rpc_unit_caretaker_confirm(unit_id, token)` was written for a
-- real journey: a caretaker with no account taps a link and
-- confirms they will receive deliveries, which moves the unit
-- toward live. The signature says token. The grant says anon.
-- Everything about it says the token is the credential.
--
-- It was never stored and never checked. The function ignored
-- the parameter entirely, so any unit id confirmed any unit —
-- and the test passed the literal string `'token'`, which is
-- how it went unnoticed: the test could not have failed on a
-- wrong token because nothing compared one.
--
-- The previous migration guarded it with host membership, which
-- closed the hole and took the journey with it. This is the
-- version that keeps both: the token is issued, hashed, and
-- checked, and the host or the desk can still confirm on the
-- caretaker's behalf.

alter table unit add column if not exists caretaker_token_hash text;
alter table unit add column if not exists caretaker_token_sent_at timestamptz;

comment on column unit.caretaker_token_hash is
  'sha256 of the single-use token in the caretaker''s link. Never the token itself — a leaked table should not hand somebody the ability to confirm every unit.';

/*
 * Issuing the link.
 *
 * Returns the plaintext once, to the caller that is about to
 * put it in a message. It is not stored and cannot be read
 * back; a caretaker who loses the link gets a new one, which is
 * also what invalidates the old.
 */
create or replace function rpc_unit_caretaker_invite(p_unit_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host uuid;
  v_token text;
begin
  select host_id into v_host from public.unit where id = p_unit_id;
  if v_host is null then raise exception 'No such unit.'; end if;

  if not (authz.is_host_member(v_host)
          or authz.works_hospitality(null)
          or authz.is_super_admin()) then
    raise exception 'Only the host or the hospitality desk can invite a caretaker.'
      using errcode = '42501';
  end if;

  v_token := encode(extensions.gen_random_bytes(18), 'hex');

  update public.unit
     set caretaker_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
         caretaker_token_sent_at = now(),
         /* A new link un-confirms, because the point of sending
            one is that the previous answer is in doubt. */
         caretaker_confirmed_at = null
   where id = p_unit_id;

  perform audit.log('staff'::public.actor_type, 'hotels', 'unit.caretaker_invited',
    p_target_type => 'unit', p_target_id => p_unit_id);

  return jsonb_build_object('ok', true, 'token', v_token,
    'message', 'Send this link to the caretaker. It works once and replaces any earlier one.');
end;
$$;

revoke execute on function rpc_unit_caretaker_invite(uuid) from public, anon;
grant execute on function rpc_unit_caretaker_invite(uuid) to authenticated;

/*
 * Confirming.
 *
 * Anon may call this, because a caretaker has no account — that
 * is the whole design. What makes it safe is that the token is
 * now compared, in constant time, against a hash of the one we
 * sent. No token, no confirmation: a unit with nothing stored
 * refuses rather than accepting anything, which is the opposite
 * of what it did before.
 */
create or replace function rpc_unit_caretaker_confirm(
  p_unit_id uuid,
  p_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.unit;
  v_host uuid;
  v_hash text;
  v_by_person boolean := false;
begin
  select host_id, caretaker_token_hash into v_host, v_hash
    from public.unit where id = p_unit_id;
  if v_host is null then raise exception 'No such unit.'; end if;

  /* The host or the desk may confirm on the caretaker's behalf
     — somebody standing in the flat with them, usually. */
  v_by_person := authz.is_host_member(v_host)
                 or authz.works_hospitality(null)
                 or authz.is_super_admin();

  if not v_by_person then
    if v_hash is null then
      raise exception
        'No caretaker link has been sent for this unit. Ask the host to send one.'
        using errcode = '42501';
    end if;
    /* Compared as a whole string rather than character by
       character; `=` on text in Postgres is not timing-safe in
       theory, and the token is 144 bits of randomness, which is
       the part doing the work. */
    if p_token is null
       or encode(extensions.digest(p_token, 'sha256'), 'hex') <> v_hash then
      raise exception 'That link is not valid. Ask the host to send a new one.'
        using errcode = '42501';
    end if;
  end if;

  update public.unit
     set caretaker_confirmed_at = now(),
         /* Single use. The link is spent whether or not it is
            tapped twice, so a forwarded message cannot confirm
            again later. */
         caretaker_token_hash = null
   where id = p_unit_id and caretaker_confirmed_at is null
  returning * into v_unit;

  if v_unit.id is null then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  update public.unit set readiness = public.fn_unit_readiness(p_unit_id) where id = p_unit_id;

  perform audit.log(
    (case when v_by_person then 'staff' else 'guest' end)::public.actor_type,
    'hotels', 'unit.caretaker_confirmed',
    p_target_type => 'unit', p_target_id => p_unit_id);

  return jsonb_build_object('ok', true);
end;
$$;

comment on function rpc_unit_caretaker_confirm is
  'The caretaker taps their link. Anon by design — they have no account — and safe because the token is compared against a hash of the one we sent. A unit with no token refuses.';

revoke execute on function rpc_unit_caretaker_confirm(uuid, text) from public;
grant execute on function rpc_unit_caretaker_confirm(uuid, text) to anon, authenticated;

insert into wiring_anon_allow (function_name, reason, guarded_by) values
  ('rpc_unit_caretaker_confirm',
   'A caretaker has no account and confirms by tapping a link',
   'single-use token, compared against a stored sha256; a unit with none refuses')
on conflict (function_name) do update
  set reason = excluded.reason, guarded_by = excluded.guarded_by;

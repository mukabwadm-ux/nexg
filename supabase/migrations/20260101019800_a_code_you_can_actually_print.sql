-- A code you can actually print.
--
-- `rpc_qr_generate` minted codes from hex:
--
--   upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 6))
--
-- Hex contains 0 and 1. The card alphabet deliberately does
-- not — somebody reads these off a card taped to a kitchen
-- counter and types them into a phone, and 0/O and 1/I/l are
-- the pairs they get wrong. `CODE_PATTERN` in the web app
-- enforces that, and `/api/qr/{code}` refuses anything outside
-- it, so a hex code produced a card that could be created,
-- stored and listed but never drawn or printed.
--
-- Each character had a 2-in-16 chance of being 0 or 1, so about
-- 55% of every card ever generated was unprintable. Three of
-- the seven in the local seed were. Production has four cards
-- and happens to have escaped, which is luck rather than
-- design — and it would have stopped being luck the moment a
-- host started using the Generate button.
--
-- `fn_qr_new_code()` already existed and does this correctly:
-- the right alphabet, a banned-substring filter so no card
-- reads as an obscenity, and a collision check. `rpc_qr_generate`
-- simply never called it.
--
-- Nothing here rewrites an existing code. A code is printed on
-- something; changing one in the database would point a card
-- already on a counter at nothing. The bad ones are listed by
-- `qr_unprintable_v` so they can be replaced deliberately,
-- which voids the old card properly.

create or replace function public.rpc_qr_generate(
  p_owner_type public.qr_owner_type,
  p_owner_id uuid,
  p_placement public.qr_placement default 'counter'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host_id uuid;
  v_hotel_id uuid;
  v_city_id uuid;
  v_label text;
  v_exists boolean := false;
  v_code text;
  v_secret text;
  v_qr public.property_qr;
begin
  /* Resolve the owner and, separately, prove it exists — the
     two were one step, which is how a missing label came to be
     reported as a missing unit. */
  if p_owner_type = 'unit' then
    select true, u.host_id, u.city_id, u.label_public
      into v_exists, v_host_id, v_city_id, v_label
      from public.unit u where u.id = p_owner_id and u.archived_at is null;
  elsif p_owner_type = 'hotel_room' then
    select true, r.hotel_id, h.city_id, 'Room ' || r.room_no
      into v_exists, v_hotel_id, v_city_id, v_label
      from public.hotel_room r join public.hotel h on h.id = r.hotel_id
     where r.id = p_owner_id;
  else
    select true, a.hotel_id, h.city_id, a.name
      into v_exists, v_hotel_id, v_city_id, v_label
      from public.hotel_area a join public.hotel h on h.id = a.hotel_id
     where a.id = p_owner_id;
  end if;

  if not coalesce(v_exists, false) then
    raise exception 'No such property.' using errcode = '22023';
  end if;

  if v_label is null then
    raise exception 'This unit has no public name yet. Set the name guests should see on the card before generating one.'
      using errcode = '22023';
  end if;

  /* The property's own people, or hospitality staff. */
  if not (
    (v_host_id is not null and authz.is_host_member(v_host_id))
    or (v_hotel_id is not null and authz.is_hotel_member(v_hotel_id, 'admin'))
    or authz.works_hospitality(v_city_id)
  ) then
    raise exception 'Not yours to generate.' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.property_qr q
     where q.owner_type = p_owner_type and q.owner_id = p_owner_id
       and q.placement = p_placement and q.voided_at is null
  ) then
    raise exception 'That spot already has a card. Replace it rather than adding a second.'
      using errcode = '23505';
  end if;

  /*
   * The one line that changed, and the whole point of this
   * migration. Hex is not the card alphabet.
   */
  v_code := public.fn_qr_new_code();
  v_secret := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.property_qr (
    code, state, generated_at, owner_type, owner_id, placement,
    host_id, hotel_id, city_id, label, secret_hash)
  values (
    v_code, 'generated', now(), p_owner_type, p_owner_id, p_placement,
    v_host_id, v_hotel_id, v_city_id, v_label,
    encode(extensions.digest(v_secret, 'sha256'), 'hex'))
  returning * into v_qr;

  /*
   * `p_target_label` is what makes this a v2 audit row.
   *
   * The first draft of this migration left it off, and six
   * seeded cards started writing rows in the old hash shape —
   * caught by `16_audit_console`, which asserts exactly one v1
   * row exists. Rewriting a whole function to change one line
   * is how a parameter goes missing; the label is back.
   */
  perform audit.log('host_user'::public.actor_type, 'hotels', 'qr.generated',
    p_target_type => 'property_qr', p_target_id => v_qr.id,
    p_target_label => v_code || ' · ' || v_label,
    p_city_id => v_city_id,
    p_after => jsonb_build_object('code', v_code, 'placement', p_placement));

  return jsonb_build_object(
    'ok', true, 'id', v_qr.id, 'code', v_code, 'label', v_label,
    'placement', p_placement);
end;
$$;

revoke execute on function
  public.rpc_qr_generate(public.qr_owner_type, uuid, public.qr_placement)
from public, anon;
grant execute on function
  public.rpc_qr_generate(public.qr_owner_type, uuid, public.qr_placement)
to authenticated;

/**
 * Cards already minted that cannot be drawn.
 *
 * Not fixed automatically. A code is printed on something, so
 * rewriting one in the database would point a card already on
 * somebody's counter at nothing. These are listed so they can
 * be replaced through `rpc_qr_replace`, which voids the old one
 * and tells a guest scanning it that the card is retired.
 */
create or replace view qr_unprintable_v
with (security_invoker = true) as
select
  q.id,
  q.code,
  q.host_id,
  q.hotel_id,
  q.owner_type::text as owner_type,
  q.owner_id,
  q.label,
  q.state::text as state,
  q.generated_at,
  q.voided_at is not null as already_voided
from public.property_qr q
where q.code !~ '^NXG-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$';

grant select on qr_unprintable_v to authenticated;
revoke all on qr_unprintable_v from anon;
revoke insert, update, delete, truncate on qr_unprintable_v from authenticated;

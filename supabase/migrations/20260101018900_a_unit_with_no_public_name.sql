-- A unit with no public name is not a missing unit.
--
-- `rpc_qr_generate` reads `unit.label_public` to put on the
-- card, and raised "No such property." when it came back null.
-- The unit is right there. What it lacks is the name a guest
-- would see printed on the card in their room.
--
-- Those are different problems with different fixes, and the
-- message sent you after the wrong one: somebody checks the
-- unit id, finds the unit, and concludes the RPC is broken.
-- Found when a seeded unit without a label became the first
-- live unit in alphabetical order and took a whole test suite
-- down with it.

create or replace function rpc_qr_generate(
  p_owner_type qr_owner_type,
  p_owner_id uuid,
  p_placement qr_placement default 'counter'
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
    /*
     * Says what to do, because this one is fixable in ten
     * seconds by the person reading it. The label is what a
     * guest sees printed on the card; without it we would be
     * posting a card that names nothing.
     */
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

  /* One live card per spot. A second card for the same place
     means two codes in one room and attribution split between
     them. */
  if exists (
    select 1 from public.property_qr q
     where q.owner_type = p_owner_type and q.owner_id = p_owner_id
       and q.placement = p_placement and q.voided_at is null
  ) then
    raise exception 'That spot already has a card. Replace it rather than adding a second.'
      using errcode = '23505';
  end if;

  v_code := 'NXG-' || upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 6));
  v_secret := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.property_qr (
    code, state, generated_at, owner_type, owner_id, placement,
    host_id, hotel_id, city_id, label, secret_hash, generated_by)
  values (
    v_code, 'generated', now(), p_owner_type, p_owner_id, p_placement,
    v_host_id, v_hotel_id, v_city_id, v_label,
    encode(extensions.digest(v_secret, 'sha256'), 'hex'),
    authz.staff_id())
  returning * into v_qr;

  perform audit.log('staff'::public.actor_type, 'hotels', 'qr.generated',
    p_target_type => 'property_qr', p_target_id => v_qr.id,
    p_after => jsonb_build_object('code', v_code, 'placement', p_placement),
    p_severity => 'notice');

  return jsonb_build_object(
    'ok', true, 'id', v_qr.id, 'code', v_code, 'label', v_label,
    'secret', v_secret);
end;
$$;

comment on function rpc_qr_generate is
  'Makes a card for a unit, room or area. Distinguishes a property that does not exist from one that exists without a public name — they were one message, and it sent people looking for a missing unit that was never missing.';

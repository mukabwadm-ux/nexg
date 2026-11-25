-- A guest's own stays, their unit's guide and its 3D house in the Stays app (25 Nov 2026).
--
-- The Stays app has designed screens for a booked stay (My Stay, the Arrival guide, Property access) and the guest
-- guide viewer (text guide, floor plan, 3D model, 3D house). They had no real data: a signed-in guest could not list
-- their stays with names and times, and a unit's published guide was only reachable through its placed QR card.
-- Three read RPCs for the signed-in guest, called from the app with the guest's own token:
--
--   * rpc_stay_guest_stays(p_limit): the caller's stays booked through NexG (stay.guest_user_id = auth.uid()), newest
--     check-in first, in booked, in_stay or departed status, or cancelled after it was confirmed. Holds, blocks and a
--     hold that lapsed unpaid are left out, as for the stay chat (20270314000700). Each row has the property's name,
--     area and first public photo, the unit's public label (never unit.name, the host's own shorthand), the times in
--     the host's time zone, the host's house rules and cancellation text, the handoff mode, the Wi-Fi network name,
--     whether a guide is available now, and the stay's chat (thread id, and whether it can take messages).
--     Not returned: unit.handoff_note, parking_note and lift_note (written for riders, waiting for the owner), and the
--     gate code (never shown to guests).
--   * rpc_stay_guest_guide(p_stay_id): the unit's published guide, in the same shape as
--     rpc_host_workspace_published_guide ({unitName, document, publishedAt}). Refused (42501) unless the stay is the
--     caller's. Null unless the stay has a unit, is booked or in_stay, and check-out has not passed; the host and
--     unit are live, the unit is not archived, and the guide is published. It closes when the stay ends, as
--     rpc_my_stay_code (20270116000400) does: guide articles often hold the door or lockbox steps and the Wi-Fi
--     password, written for whoever is in the unit, so a departed guest must not keep reading them for the next
--     guest. A cancelled stay never qualifies. It does not need a placed QR card: the booking is the guest's access.
--   * rpc_stay_guest_guide_asset_sign(p_stay_id, p_id): the guide's floor plan or 3D model, as
--     rpc_host_workspace_guide_asset_sign (20270316000200) does for a QR code. The asset must be the published
--     document's planId or modelId, of the stay's own unit. A file in Storage gets a 60-second read grant on its path,
--     so the app can sign a download link with the guest's token (the host_guide_assets_guest_read policy already
--     covers authenticated callers); an older file kept in the database is answered as base64. A new grant is logged
--     once as stay.guide_file_opened_by_guest, by the guest, on the stay; a refresh within the minute is not logged.
--
-- All three are security definer with an empty search_path, executable by authenticated only: anon gets nothing, so
-- there is no wiring_anon_allow row. The first two are stable reads (the QR guide read is not audited either); the
-- sign RPC calls audit.log, so there is no wiring_audit_exempt row. The action is registered.
--
-- Rollback: drop the three functions and authz.stay_guest_guide_unit, and delete the action_registry row.

-- ═══════════════════════════════════════════════ which unit's guide a stay may read

/*
 * The unit whose published guide the stay’s guest may read now, or null.
 * The caller check is the caller’s job: this only explains the stay.
 * Booked or in a stay, until check-out. Closed once the host checks the
 * guest out (departed) or check-out passes, as rpc_my_stay_code is: the
 * guide holds the unit's access steps for whoever stays next. Never
 * cancelled or held. The host and unit are live, the unit is not archived, and the
 * guide has a published version.
 */
create or replace function authz.stay_guest_guide_unit(p_stay_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
    from public.stay s
    join public.unit u on u.id = s.unit_id and u.host_id = s.host_id
    join public.host h on h.id = u.host_id
    join public.host_unit_guide guide on guide.unit_id = u.id
   where s.id = p_stay_id
     and s.guest_user_id is not null
     and s.status in ('booked', 'in_stay')
     and now() < s.check_out
     and h.status = 'live'
     and u.status = 'live'
     and u.archived_at is null
     and guide.published_id is not null
$$;

revoke all on function authz.stay_guest_guide_unit(uuid) from public, anon, authenticated;

-- ═══════════════════════════════════════════════ the guest's stays

/* The caller’s own stays booked through NexG, with what the designed stay screens show. */
create or replace function public.rpc_stay_guest_stays(p_limit integer default 50)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('stays', coalesce(jsonb_agg(x.stay order by x.check_in desc, x.id), '[]'::jsonb))
    from (
      select s.id, s.check_in, jsonb_build_object(
        'id', s.id,
        'status', s.status,
        'check_in', s.check_in,
        'check_out', s.check_out,
        'checked_in_at', s.checked_in_at,
        'checked_out_at', s.checked_out_at,
        'party_adults', s.party_adults,
        'party_children', s.party_children,
        'guest_first_name', s.guest_first_name,
        'paid_kes', s.paid_kes,
        'quote_total_kes', s.quote_total_kes,
        'payment_reference', s.payment_reference,
        'host_name', coalesce(nullif(trim(h.display_name), ''), 'Host'),
        'time_zone', coalesce(nullif(h.time_zone, ''), 'Africa/Nairobi'),
        'property_id', s.property_id,
        'property_name', p.name,
        'area', coalesce(nullif(trim(p.area), ''), nullif(trim(u.area), '')),
        'photo', (
          select ph.item
            from jsonb_array_elements(coalesce(p.photos, '[]'::jsonb)) with ordinality as ph(item, n)
           where authz.host_photo_is_public(ph.item ->> 'path')
           order by ph.n
           limit 1),
        'unit_id', s.unit_id,
        'unit_name', nullif(trim(u.label_public), ''),
        'check_in_time', to_char(coalesce(u.checkin_time, p.check_in_from), 'HH24:MI'),
        'check_out_time', to_char(coalesce(u.checkout_time, p.check_out_by), 'HH24:MI'),
        'house_rules', p.house_rules,
        'cancellation_policy', p.cancellation_policy,
        'handoff', u.handoff,
        'wifi_name', nullif(trim(u.wifi_name), ''),
        'guide_available', authz.stay_guest_guide_unit(s.id) is not null,
        'chat_thread_id', (select c.id from public.msg_conversation c where c.stay_id = s.id),
        'can_chat', authz.stay_chat_open(s.id)
      ) as stay
        from public.stay s
        join public.host h on h.id = s.host_id
        left join public.property p on p.id = s.property_id
        left join public.unit u on u.id = s.unit_id
       where (select auth.uid()) is not null
         and s.guest_user_id = (select auth.uid())
         and (s.status in ('booked', 'in_stay', 'departed')
              or (s.status = 'cancelled' and s.confirmed_at is not null))
       order by s.check_in desc, s.id
       limit greatest(1, least(coalesce(p_limit, 50), 200))
    ) x
$$;

-- ═══════════════════════════════════════════════ the stay's published guide

/* The published guide of the caller’s stay, as the QR guide returns it. Null when the stay has no guide to read now. */
create or replace function public.rpc_stay_guest_guide(p_stay_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_unit uuid;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.stay s where s.id = p_stay_id and s.guest_user_id = (select auth.uid())) then
    raise exception 'This stay is not yours.' using errcode = '42501';
  end if;
  v_unit := authz.stay_guest_guide_unit(p_stay_id);
  if v_unit is null then
    return null;
  end if;
  return (
    select jsonb_build_object('unitName', coalesce(nullif(trim(u.label_public), ''), 'Your unit'),
      'document', v.document, 'publishedAt', v.published_at)
      from public.unit u
      join public.host_unit_guide guide on guide.unit_id = u.id
      join public.host_unit_guide_version v on v.id = guide.published_id and v.unit_id = guide.unit_id
     where u.id = v_unit);
end;
$$;

-- ═══════════════════════════════════════════════ the guide's floor plan or 3D model

/*
 * One file of the caller’s stay’s published guide: {mime, path} for a file
 * in Storage, with a 60-second read grant on that path so the app can sign a
 * download link, or {mime, base64} for a file kept in the database. A grant
 * that is new (none, or the last one had expired) is logged once.
 */
create or replace function public.rpc_stay_guest_guide_asset_sign(p_stay_id uuid, p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_doc jsonb;
  v_asset public.host_unit_guide_asset;
  v_new_grant boolean;
begin
  if p_stay_id is null or p_id is null then
    return null;
  end if;
  /* Raises when the stay is not the caller’s; null when it has no guide to read now. */
  v_doc := public.rpc_stay_guest_guide(p_stay_id) -> 'document';
  if v_doc is null
    or not coalesce(p_id::text = any (array[v_doc ->> 'planId', v_doc ->> 'modelId']), false) then
    return null;
  end if;

  select a.* into v_asset
    from public.host_unit_guide_asset a
    join public.unit u on u.id = a.unit_id and u.archived_at is null
    join public.stay s on s.id = p_stay_id and s.unit_id = a.unit_id
   where a.id = p_id;
  if v_asset.id is null then
    return null;
  end if;

  if v_asset.storage_path is null then
    return jsonb_build_object('mime', v_asset.mime, 'base64', encode(v_asset.body, 'base64'));
  end if;

  delete from public.host_guide_asset_grant where expires_at <= now();
  -- An expired grant was just deleted, so the upsert inserts (xmax = 0) exactly when the grant is new, and only
  -- updates when an unexpired grant is refreshed.
  insert into public.host_guide_asset_grant (path, expires_at)
    values (v_asset.storage_path, now() + interval '60 seconds')
    on conflict (path) do update set expires_at = excluded.expires_at
    returning (xmax = 0) into v_new_grant;
  if v_new_grant then
    perform audit.log('guest'::public.actor_type, 'hotels', 'stay.guide_file_opened_by_guest',
      p_actor_id => (select auth.uid()), p_target_type => 'stay', p_target_id => p_stay_id,
      p_after => jsonb_build_object('asset_id', p_id, 'kind', v_asset.kind, 'unit_id', v_asset.unit_id));
  end if;
  return jsonb_build_object('mime', v_asset.mime, 'path', v_asset.storage_path);
end;
$$;

revoke execute on function
  public.rpc_stay_guest_stays(integer),
  public.rpc_stay_guest_guide(uuid),
  public.rpc_stay_guest_guide_asset_sign(uuid, uuid)
from public, anon;

grant execute on function
  public.rpc_stay_guest_stays(integer),
  public.rpc_stay_guest_guide(uuid),
  public.rpc_stay_guest_guide_asset_sign(uuid, uuid)
to authenticated;

-- ═══════════════════════════════════════════════ audit

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('stay.guide_file_opened_by_guest', 'hotels', 'info', false,
   'A guest opened their stay''s floor plan or 3D model in the Stays app')
on conflict (action) do nothing;

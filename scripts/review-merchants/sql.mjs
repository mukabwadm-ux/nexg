// Builds the SQL for the review merchants from shops.mjs. Pure: no I/O.
//
// Everything is keyed on fixed ids under the `ae7e` prefix, so a second run
// updates the same rows instead of adding new ones, and `removeSql()` can
// find every row it made. The password is never in this SQL: psql supplies
// it as the variable :pw.

import { shops } from './shops.mjs';

const hex = (n, width) => n.toString(16).padStart(width, '0');
/** ae7e<kind>-00<shop>-4000-8000-<n> : kind is one hex digit per table. */
export const rid = (kind, shop, n = 0) => `ae7e000${kind}-00${hex(shop, 2)}-4000-8000-${hex(n, 12)}`;
export const KIND = { user: 1, merchant: 2, branch: 3, section: 4, item: 5, group: 6, option: 7, attribute: 8, value: 9, variant: 'a', promotion: 'b', document: 'c', connection: 'd' };
export const merchantId = (s) => rid(KIND.merchant, s.n);
export const userId = (s) => rid(KIND.user, s.n);
export const loginEmail = (s) => `${s.slug}@partners.nexgapp.com`;
export const contactPhone = (s) => `+2547000002${String(s.n).padStart(2, '0')}`;

const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replaceAll("'", "''")}'`);
const num = (v) => (v === null || v === undefined ? 'null' : String(Number(v)));
const bool = (v) => (v ? 'true' : 'false');
const arr = (xs) => `array[${xs.map(q).join(', ')}]::text[]`;

/** Every item of a shop with its stable number (1-based, in file order). */
export function itemsOf(shop) {
  let n = 0;
  return shop.sections.flatMap((section, si) => section.items.map((item) => ({ ...item, n: ++n, sectionIndex: si })));
}
export const itemId = (shop, item) => rid(KIND.item, shop.n, item.n);
// Where the portal itself puts an item photo: catalogue-images/<merchant>/<opaque id>.<ext>
// (apps/web/lib/catalogue-images.ts). The item's own id serves as the opaque name.
export const photoPath = (shop, item) => `${merchantId(shop)}/${itemId(shop, item)}.jpg`;
// The shop banner, as the Business page saves it: merchant-brand/<merchant>/<opaque id>.jpg.
export const bannerPath = (shop) => `${merchantId(shop)}/${rid(KIND.merchant, shop.n, 0xb)}.jpg`;

function loginSql(s) {
  const id = userId(s);
  return `
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token,
  email_change, email_change_token_new, email_change_token_current, phone_change, phone_change_token,
  reauthentication_token)
values ('00000000-0000-0000-0000-000000000000', ${q(id)}, 'authenticated', 'authenticated', ${q(loginEmail(s))},
  extensions.crypt(:'pw', extensions.gen_salt('bf')), now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, ${q(JSON.stringify({ full_name: s.owner }))}::jsonb,
  '', '', '', '', '', '', '', '')
on conflict (id) do update set encrypted_password = excluded.encrypted_password, email = excluded.email,
  email_confirmed_at = coalesce(auth.users.email_confirmed_at, now()), updated_at = now();
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (${q(id)}, ${q(id)}, jsonb_build_object('sub', ${q(id)}, 'email', ${q(loginEmail(s))}, 'email_verified', true),
  'email', now(), now(), now())
on conflict (provider, provider_id) do update set identity_data = excluded.identity_data, updated_at = now();`;
}

function merchantSql(s) {
  const id = merchantId(s);
  const answers = JSON.stringify(s.answers ?? {});
  // Inserted live first, so the document rows added later cannot move it back
  // to documents_pending (fn_partner_recompute_status keeps a live merchant).
  return `
insert into public.merchant (id, trading_name, legal_name, contact_name, contact_phone, contact_email,
  category, category_key, subcategory, city_id, status, submitted_at, went_live_at, accepting_orders,
  explore_visible, accepts_test_payments, commission_pct, prep_minutes, min_order_kes, answers,
  payout_rail, payout_account, payout_hold, payout_hold_reason, kra_pin, password_set_at, phone_verified_at,
  acquisition_source)
select ${q(id)}, ${q(s.name)}, ${q(s.legal)}, ${q(s.owner)}, ${q(contactPhone(s))}, ${q(loginEmail(s))},
  ${q(s.category)}::public.merchant_category, ${q(s.category)}, ${q(s.subcategory)}, c.id, 'live', now(), now(), true,
  true, true, 18.00, ${num(Math.max(5, s.prepMinutes || 15))}, ${num(s.minOrder ?? null)},
  pg_temp.review_answers(${q(s.category)}, ${q(s.subcategory)},
    coalesce((select answers from public.merchant where id = ${q(id)}), '{}'::jsonb) || ${q(answers)}::jsonb),
  'mpesa_till', '{"till":"5${String(s.n).padStart(6, '0')}"}'::jsonb, true, 'Review shop: test payments only.',
  ${q(`P05${String(s.n).padStart(7, '0')}R`)}, now(), now(), 'review_seed'
from public.city c where c.slug = 'nairobi'
on conflict (id) do update set trading_name = excluded.trading_name, legal_name = excluded.legal_name,
  contact_name = excluded.contact_name, category = excluded.category, category_key = excluded.category_key,
  subcategory = excluded.subcategory, status = 'live', went_live_at = coalesce(public.merchant.went_live_at, now()),
  accepting_orders = true, explore_visible = true, accepts_test_payments = true,
  prep_minutes = excluded.prep_minutes, min_order_kes = excluded.min_order_kes, answers = excluded.answers,
  payout_hold = true, deleted_at = null, updated_at = now();
insert into public.merchant_user (merchant_id, user_id, role) values (${q(id)}, ${q(userId(s))}, 'owner')
on conflict (merchant_id, user_id) do update set role = 'owner';
insert into public.merchant_branch (id, merchant_id, name, address_text, latitude, longitude, zone_id, is_primary, source)
values (${q(rid(KIND.branch, s.n))}, ${q(id)}, ${q(s.branch.name)}, ${q(s.branch.address)},
  ${num(s.branch.lat)}, ${num(s.branch.lng)}, (select z.id from public.zone_for_point(${num(s.branch.lng)}, ${num(s.branch.lat)}) z limit 1), true, 'manual')
on conflict (id) do update set name = excluded.name, address_text = excluded.address_text,
  latitude = excluded.latitude, longitude = excluded.longitude, zone_id = excluded.zone_id, deleted_at = null;
delete from public.merchant_hours where merchant_id = ${q(id)} and branch_id is null;
insert into public.merchant_hours (merchant_id, day_of_week, opens, closes, closed, weekday_convention)
select ${q(id)}, d, '00:00', '23:59', false, 'monday_zero' from generate_series(0, 6) d;`;
}

function catalogueSql(s) {
  const mid = merchantId(s);
  const out = [];
  s.sections.forEach((section, si) => {
    out.push(`insert into public.catalogue_section (id, merchant_id, name, sort)
values (${q(rid(KIND.section, s.n, si + 1))}, ${q(mid)}, ${q(section.name)}, ${si + 1})
on conflict (id) do update set name = excluded.name, sort = excluded.sort;`);
  });
  const groupIds = new Map();
  (s.groups ?? []).forEach((g, gi) => {
    const gid = rid(KIND.group, s.n, gi + 1);
    groupIds.set(g.name, gid);
    out.push(`insert into public.modifier_group (id, merchant_id, name, min_choices, max_choices, required, sort)
values (${q(gid)}, ${q(mid)}, ${q(g.name)}, ${g.min}, ${g.max}, ${bool(g.min > 0)}, ${gi + 1})
on conflict (id) do update set name = excluded.name, min_choices = excluded.min_choices,
  max_choices = excluded.max_choices, required = excluded.required, archived_at = null;`);
    g.options.forEach(([name, kes], oi) => {
      out.push(`insert into public.modifier_option (id, group_id, name, extra_cents, sort)
values (${q(rid(KIND.option, s.n, (gi + 1) * 100 + oi + 1))}, ${q(gid)}, ${q(name)}, ${kes * 100}, ${oi + 1})
on conflict (id) do update set name = excluded.name, extra_cents = excluded.extra_cents, available = true;`);
    });
  });
  for (const it of itemsOf(s)) {
    const id = itemId(s, it);
    const w = it.weight;
    const kind = it.kind ?? 'buy';
    out.push(`insert into public.catalogue_item (id, merchant_id, section_id, name, description, price_kes, available,
  sold_out, highlighted, sort, kind, sold_by, unit_label, unit_step, unit_min, unit_max, price_is_estimate,
  digital, requires_buyer_id, age_restricted, message_label, message_max_length, price_per, duration_minutes,
  party_min, party_max, photo_path)
values (${q(id)}, ${q(mid)}, ${q(rid(KIND.section, s.n, it.sectionIndex + 1))}, ${q(it.name)}, ${q(it.desc)},
  ${num(it.price || null)}, true, ${bool(it.soldOut)}, ${bool(it.popular)}, ${it.n}, ${q(kind)}::public.catalogue_item_kind,
  ${q(w ? 'weight' : it.sold === 'pack' ? 'pack' : 'each')}, ${q(w ? w.label : null)}, ${num(w ? w.step : 1)},
  ${num(w ? w.min : null)}, ${num(w ? w.max : null)}, ${bool(!!w)}, ${bool(it.digital)}, ${bool(it.buyerId)},
  ${bool(it.age)}, ${q(it.message ? it.message.label : null)}, ${num(it.message ? it.message.max : 140)},
  ${q(it.pricePer ?? null)}, ${num(it.duration ?? null)}, ${num(it.party ? it.party[0] : null)},
  ${num(it.party ? it.party[1] : null)}, ${q(photoPath(s, it))})
on conflict (id) do update set section_id = excluded.section_id, name = excluded.name,
  description = excluded.description, price_kes = excluded.price_kes, available = true, sold_out = excluded.sold_out,
  highlighted = excluded.highlighted, sort = excluded.sort, sold_by = excluded.sold_by, unit_label = excluded.unit_label,
  unit_step = excluded.unit_step, unit_min = excluded.unit_min, unit_max = excluded.unit_max,
  price_is_estimate = excluded.price_is_estimate, digital = excluded.digital,
  requires_buyer_id = excluded.requires_buyer_id, age_restricted = excluded.age_restricted,
  message_label = excluded.message_label, message_max_length = excluded.message_max_length,
  price_per = excluded.price_per, duration_minutes = excluded.duration_minutes, party_min = excluded.party_min,
  party_max = excluded.party_max, photo_path = excluded.photo_path,
  -- A booking item keeps its link to the booking engine; seed.mjs sets it after creating the offering.
  kind = case when excluded.kind = 'buy' then 'buy'::public.catalogue_item_kind else public.catalogue_item.kind end;`);
    (it.groups ?? []).forEach((gname, gi) => {
      out.push(`insert into public.catalogue_item_modifier (item_id, group_id, sort)
values (${q(id)}, ${q(groupIds.get(gname))}, ${gi + 1}) on conflict do nothing;`);
    });
    if (it.variants) out.push(variantSql(s, it));
  }
  if (s.promotion) {
    const target = itemsOf(s).find((i) => i.name === s.promotion.item);
    out.push(`insert into public.merchant_promotion (id, merchant_id, name, kind, value, catalogue_item_id, starts_at, ends_at, status)
values (${q(rid(KIND.promotion, s.n, 1))}, ${q(mid)}, ${q(s.promotion.name)}, ${q(s.promotion.kind)}, ${s.promotion.value},
  ${q(itemId(s, target))}, now() - interval '1 day', now() + interval '120 days', 'active')
on conflict (id) do update set name = excluded.name, value = excluded.value, ends_at = excluded.ends_at, status = 'active';`);
  }
  return out.join('\n');
}

function variantSql(s, it) {
  const out = [];
  const iid = itemId(s, it);
  const valueIds = [];
  it.variants.attributes.forEach(([attr, values], ai) => {
    const aid = rid(KIND.attribute, s.n, it.n * 10 + ai + 1);
    out.push(`insert into public.catalogue_attribute (id, item_id, name, sort) values (${q(aid)}, ${q(iid)}, ${q(attr)}, ${ai + 1})
on conflict (id) do update set name = excluded.name;`);
    valueIds.push(
      values.map((v, vi) => {
        const vid = rid(KIND.value, s.n, (it.n * 10 + ai + 1) * 100 + vi + 1);
        out.push(`insert into public.catalogue_attribute_value (id, attribute_id, name, sort) values (${q(vid)}, ${q(aid)}, ${q(v)}, ${vi + 1})
on conflict (id) do update set name = excluded.name;`);
        return [v, vid];
      }),
    );
  });
  // Every combination of the attribute values.
  const combos = valueIds.reduce((acc, vals) => acc.flatMap((c) => vals.map((v) => [...c, v])), [[]]);
  combos.forEach((combo, ci) => {
    const names = combo.map(([v]) => v);
    const soldOut = (it.variants.soldOut ?? []).some((so) => so.every((v, i) => names[i] === v));
    const price = names.map((n) => it.variants.price?.[n]).find((p) => p !== undefined) ?? it.price;
    out.push(`insert into public.catalogue_variant (id, item_id, value_ids, price_kes, available, sku)
values (${q(rid(KIND.variant, s.n, it.n * 1000 + ci + 1))}, ${q(iid)}, ${arr(combo.map(([, id]) => id))}::uuid[], ${price},
  ${bool(!soldOut)}, ${q(`${s.slug.slice(0, 4).toUpperCase()}-${it.n}-${names.join('-')}`)})
on conflict (id) do update set price_kes = excluded.price_kes, available = excluded.available, archived_at = null;`);
  });
  return out.join('\n');
}

function complianceSql(s) {
  const mid = merchantId(s);
  return `
-- The category agreement, accepted by the owner's login.
insert into public.merchant_agreement_acceptance (merchant_id, category, agreement_id, version, accepted_by)
select ${q(mid)}, mac.category, a.id, a.version, ${q(userId(s))}
from public.merchant_agreement_category mac
join lateral (select id, version from public.merchant_agreement where id = mac.agreement_id
              order by published_on desc, version desc limit 1) a on true
where mac.category = ${q(s.category)}
on conflict (merchant_id, agreement_id, version) do nothing;`;
}

/** Document rows for every requirement this merchant has; the files are uploaded by seed.mjs first. */
export function documentSql(s, kinds) {
  const mid = merchantId(s);
  return kinds
    .map(
      ({ requirementId, kind, path, size }, i) => `
insert into public.document (id, owner_type, owner_id, requirement_id, storage_path, mime, size_bytes, status,
  issued_at, expires_at, reviewed_at, received_via)
values (${q(rid(KIND.document, s.n, i + 1))}, 'merchant', ${q(mid)}, ${q(requirementId)}, ${q(path)}, 'application/pdf',
  ${size}, 'verified', now() - interval '30 days', '2027-12-31', now(), 'upload')
on conflict (id) do update set storage_path = excluded.storage_path, size_bytes = excluded.size_bytes,
  status = 'verified', expires_at = excluded.expires_at, reviewed_at = now(), superseded_at = null;
-- ${kind}`,
    )
    .join('\n');
}

function cinemaSql(s) {
  if (!s.cinema) return '';
  return `
insert into public.connector_connection (id, adapter_id, merchant_id, environment, state)
values (${q(rid(KIND.connection, s.n, 1))}, 'sandbox-cinema', ${q(merchantId(s))}, 'sandbox', 'operational')
on conflict (id) do update set state = 'operational';`;
}

/**
 * Onboarding answers a real merchant would have given, so the portal's
 * "business basics" check is complete. Answers already on the merchant (the
 * owner's later edits, or the shop's own in shops.mjs) are kept; only missing
 * ones are filled: the subcategory as its business type, every option of a
 * multiple choice, the first option of a single choice, and a plain sentence
 * for free text. Conditions are re-checked over three passes, because a later
 * question can depend on an earlier answer.
 */
const answersFunctions = `
create or replace function pg_temp.review_answer(a jsonb, q jsonb) returns jsonb language plpgsql as $f$
declare k text := q ->> 'key'; v jsonb;
begin
  if k is null or (a ? k and a -> k not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)) then return a; end if;
  if q ? 'when' and not public.fn_category_condition_matches(q -> 'when', a) then return a; end if;
  v := case q ->> 'type'
    when 'multi' then (select jsonb_agg(o -> 'value') from jsonb_array_elements(q -> 'options') o)
    when 'single' then q -> 'options' -> 0 -> 'value'
    else to_jsonb('Ask us in the app chat and we will help.'::text) end;
  return case when v is null then a else a || jsonb_build_object(k, v) end;
end $f$;
create or replace function pg_temp.review_answers(p_cat text, p_sub text, p_given jsonb) returns jsonb language plpgsql as $f$
declare a jsonb := jsonb_build_object('business_types', jsonb_build_array(p_sub)) || p_given; q jsonb; f text; pass int;
begin
  for pass in 1..3 loop
    for q in select value from public.category_config cc, jsonb_array_elements(cc.questions) where cc.category = p_cat loop
      a := pg_temp.review_answer(a, q);
    end loop;
    for q in select qv from public.category_config cc, jsonb_array_elements(cc.subcategories) x,
                 jsonb_array_elements(coalesce(x -> 'questions', '[]'::jsonb)) qv
             where cc.category = p_cat and x ->> 'id' = p_sub loop
      a := pg_temp.review_answer(a, q);
    end loop;
    for f in select fv from public.category_config cc, jsonb_array_elements(cc.subcategories) x,
                 jsonb_array_elements_text(coalesce(x -> 'fields', '[]'::jsonb)) fv
             where cc.category = p_cat and x ->> 'id' = p_sub loop
      a := pg_temp.review_answer(a, jsonb_build_object('key', f, 'type', 'text'));
    end loop;
  end loop;
  return a;
end $f$;`;

/** The banner as a public URL, which is how rpc_merchant_set_brand_image stores it. */
export function bannerSql(base, rows) {
  const updates = rows.map(({ id, path }) =>
    `update public.merchant set cover_photo_path = ${q(`${base}/storage/v1/object/public/merchant-brand/${path}`)} where id = ${q(id)};`);
  return ['\\set ON_ERROR_STOP on', 'begin;', ...updates, 'commit;'].join('\n');
}

export function seedSql(only) {
  const list = only ? shops.filter((s) => only.includes(s.slug)) : shops;
  return `\\set ON_ERROR_STOP on
begin;
${answersFunctions}
delete from public.catalogue_photo where id::text like 'ae7e0005-%';
${list.map((s) => `-- ════════ ${s.n}. ${s.name}\n${loginSql(s)}\n${merchantSql(s)}\n${catalogueSql(s)}\n${complianceSql(s)}\n${cinemaSql(s)}`).join('\n')}
commit;`;
}

/** Links bookable items to the booking-engine offerings seed.mjs created. */
export function linkSql(links) {
  return `\\set ON_ERROR_STOP on
begin;
${links.map(({ id, kind, offeringId }) => `update public.catalogue_item set kind = ${q(kind)}::public.catalogue_item_kind, booking_offering_id = ${q(offeringId)} where id = ${q(id)};`).join('\n')}
commit;`;
}

/** Lists each merchant's required documents, one JSON row per shop. */
export function requiredDocsSql() {
  return `select json_build_object('merchant', m.id, 'docs', coalesce((select json_agg(json_build_object('id', r.id, 'kind', r.kind, 'label', r.label))
  from public.fn_merchant_required_docs(m.id) r), '[]'::json)) from public.merchant m where m.id::text like 'ae7e0002-%' order by m.id;`;
}

export function removeSql() {
  return `\\set ON_ERROR_STOP on
begin;
delete from public.merchant_promotion where id::text like 'ae7e000b-%';
delete from public.document where owner_type = 'merchant' and owner_id::text like 'ae7e0002-%';
delete from public.merchant_agreement_acceptance where merchant_id::text like 'ae7e0002-%';
delete from public.connector_connection where id::text like 'ae7e000d-%';
delete from public.catalogue_variant where id::text like 'ae7e000a-%';
delete from public.catalogue_attribute where id::text like 'ae7e0008-%';
delete from public.catalogue_item_modifier where item_id::text like 'ae7e0005-%';
delete from public.catalogue_photo where item_id::text like 'ae7e0005-%';
delete from public.catalogue_item where id::text like 'ae7e0005-%';
delete from public.modifier_option where id::text like 'ae7e0007-%';
delete from public.modifier_group where id::text like 'ae7e0006-%';
delete from public.catalogue_section where id::text like 'ae7e0004-%';
delete from public.merchant_hours where merchant_id::text like 'ae7e0002-%';
delete from public.merchant_branch where id::text like 'ae7e0003-%';
delete from public.merchant_user where user_id::text like 'ae7e0001-%';
delete from public.merchant where id::text like 'ae7e0002-%';
delete from auth.identities where user_id::text like 'ae7e0001-%';
delete from auth.users where id::text like 'ae7e0001-%';
commit;`;
}

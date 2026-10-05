-- The pitch itself.
--
-- The payload was structured and there was nothing that turned it
-- into words, which meant the email existed only as an intention.
-- This writes the template into `message_template` — where every
-- other message already lives — and renders it server-side, so the
-- reviewer can read the exact thing the merchant will read before
-- they send it.
--
-- Rendering in the database rather than in the console is
-- deliberate: the eventual notifications worker will render the
-- same template from the same payload, and a second copy in
-- TypeScript is a second thing to keep in step.

insert into public.message_template (key, label, channel, body, variables, approved)
values (
  'merchant_featured_pitch',
  'Featured placement · the pitch',
  'email',
  -- Plain text. It is read on a phone, by somebody running a shop.
$tpl$Hello {{name}},

Guests in {{city}} who open NexG see a handful of places first. Those
spots are bookable, and {{category}} is one of the categories where it
makes the most difference — people arrive hungry and take the first
good option.

Here is what is open, and what it costs:

{{slots}}

A week runs Monday to Sunday. You can take one week or several, and
it ends by itself — there is no subscription and nothing to cancel.

What you get: your name, photo and opening hours in the spot, marked
Sponsored, so guests know it is paid for. We do not hide that, and
being honest about it is why people still tap them.

What we will not promise: a number of orders. Anyone who quotes you
one is guessing. What we can tell you afterwards is exactly how many
people saw it and how many ordered, because we measure both.

{{note}}

Reply to this email and we will put you in for the week you want.

{{from}}
NexG
$tpl$,
  array['name', 'city', 'category', 'slots', 'note', 'from'],
  false
)
on conflict (key) do update set
  body = excluded.body,
  variables = excluded.variables,
  label = excluded.label;

/*
 * Render it. The same function the worker will call, so what a
 * reviewer previews is what a merchant receives rather than two
 * renderings that drift.
 */
create or replace function public.fn_render_featured_pitch(p_payload jsonb)
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
      || '  · ' || (s ->> 'what_it_is')
      || E'\n    KES ' || to_char((s ->> 'price_per_week')::bigint, 'FM999,999,999')
      || ' a week · ' || (s ->> 'weeks_open') || ' weeks available'
      || ' · from ' || to_char((s ->> 'earliest_week')::date, 'FMDay DD Mon')
      || E'\n';
  end loop;

  v_body := t.body;
  v_body := replace(v_body, '{{name}}', coalesce(p_payload ->> 'name', 'there'));
  v_body := replace(v_body, '{{city}}', coalesce(p_payload ->> 'city', 'your city'));
  v_body := replace(v_body, '{{category}}',
    coalesce(replace(p_payload ->> 'category', '_', ' '), 'yours'));
  v_body := replace(v_body, '{{slots}}', nullif(v_slots, ''));
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

/*
 * Preview without sending. Builds the same payload the send would,
 * so nobody has to send one to find out what it says.
 */
create or replace function public.rpc_featured_pitch_preview(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  v_slots jsonb;
  v_count integer;
begin
  select * into m from public.merchant where id = p_merchant_id;
  if not found then raise exception 'No such merchant.'; end if;

  if not (authz.is_super_admin()
          or authz.reaches_module('featured')
          or authz.can_manage_merchants(m.city_id)) then
    raise exception 'You cannot see that.' using errcode = '42501';
  end if;

  select jsonb_agg(jsonb_build_object(
           'what_it_is', t.what_it_is, 'kind', t.kind, 'category', t.category,
           'price_per_week', t.price_per_week, 'weeks_open', t.weeks_open,
           'earliest_week', t.earliest_week) order by t.price_per_week desc),
         count(*)
    into v_slots, v_count
  from public.featured_pitch_v t
  where t.city_id = m.city_id
    and (t.category is null or t.category::text = m.category::text);

  if coalesce(v_count, 0) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'nothing_priced',
      'message', 'Nothing in this city has a published rate-card price, so there is no pitch to send. Finance publishes one on Settings → Fees.');
  end if;

  return public.fn_render_featured_pitch(jsonb_build_object(
    'name', coalesce(m.trading_name, m.legal_name),
    'city', (select name from public.city where id = m.city_id),
    'category', m.category,
    'slots', v_slots,
    'from', (select email from public.staff_user where id = authz.staff_id())
  )) || jsonb_build_object('placements', v_count,
                           'to', nullif(trim(coalesce(m.contact_email, '')), ''));
end;
$$;

grant execute on function public.fn_render_featured_pitch(jsonb) to authenticated, service_role;
grant execute on function public.rpc_featured_pitch_preview(uuid) to authenticated;

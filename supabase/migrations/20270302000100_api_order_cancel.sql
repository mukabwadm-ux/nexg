-- Cancelling an API booking through the API.
--
-- POST /v1/orders/{id}/cancel lets the merchant that booked it cancel a
-- booking free of charge until a rider is assigned (the owner's decision,
-- 23 Nov). After that the API refuses, and NexG support handles it, because
-- a rider is already on the way.
--
-- Only the key's merchant's own API bookings (channel 'api') can be
-- cancelled: a merchant's key never reaches a customer's website order, and
-- another merchant's booking answers like one that does not exist.
--
-- A live key cancels the real order the way a customer's own cancellation
-- does (rpc_order_cancel_mine): unpaid payments abandoned, the order
-- cancelled with reason merchant_api, the dispatch job cancelled and its
-- open offers withdrawn, an order event, and an audit entry. The order
-- trigger then sends booking.status_changed to the merchant's endpoints.
--
-- A test key cancels a sandbox booking instead, with the same rule: not once
-- a test rider is assigned. Cancelling twice answers the same, so a retry is
-- safe.

create or replace function public.rpc_order_cancel_api(
  p_api_key text,
  p_order_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '2s'
as $$
declare
  v_key public.api_key;
  o public.order;
  t public.api_test_order;
  v_from text;
  v_note text := left(nullif(btrim(coalesce(p_reason, '')), ''), 500);
begin
  select k.* into v_key
  from public.api_key k
  join public.fn_api_key_lookup(p_api_key) usable on usable.key_id = k.id;

  if not found then
    raise exception 'That API key is not valid.' using errcode = '42501';
  end if;
  if not ('merchant_write'::public.api_credential_scope = any (v_key.scopes)) then
    raise exception 'This key cannot cancel bookings: it needs merchant_write.' using errcode = '42501';
  end if;
  if v_key.merchant_id is null then
    raise exception 'This key is not bound to a merchant.' using errcode = '42501';
  end if;

  /* A test key: the sandbox booking, never a real order. */
  if v_key.environment = 'test' then
    select * into t from public.api_test_order
     where id = p_order_id and merchant_id = v_key.merchant_id
       for update;
    if not found then
      raise exception 'That order does not exist.' using errcode = 'P0002';
    end if;

    v_from := public.fn_api_booking_status(t.stage);
    if v_from = 'cancelled' then
      return jsonb_build_object('ok', true, 'cancelled', false,
        'order', public.fn_api_test_order_object(t.id), 'previous_status', v_from);
    end if;
    if t.rider_assigned_at is not null or v_from in ('in_progress', 'completed') then
      raise exception 'A test rider has this booking, so it can no longer be cancelled through the API. In the sandbox, move it on instead.'
        using errcode = 'P0004';
    end if;

    return jsonb_build_object('ok', true, 'cancelled', true)
      || public.fn_api_test_order_move(t.id, v_key.merchant_id, 'cancelled');
  end if;

  /* A live key: the real order, booked through the API by this merchant. */
  select * into o from public.order
   where id = p_order_id and merchant_id = v_key.merchant_id and channel = 'api'
     for update;
  if not found then
    raise exception 'That order does not exist.' using errcode = 'P0002';
  end if;

  v_from := public.fn_api_booking_status(o.stage::text);
  if o.stage = 'cancelled' then
    return jsonb_build_object('ok', true, 'cancelled', false,
      'order', public.fn_api_order_object(o.id), 'previous_status', v_from);
  end if;
  if v_from in ('in_progress', 'completed') then
    raise exception 'This booking is already %, so it can no longer be cancelled.', replace(v_from, '_', ' ')
      using errcode = 'P0004';
  end if;
  if exists (select 1 from dispatch.job j
              where j.order_id = o.id and j.assigned_rider_id is not null
                and j.state not in ('cancelled')) then
    raise exception 'A rider has taken this booking, so it can no longer be cancelled through the API. Contact NexG support.'
      using errcode = 'P0004';
  end if;
  if o.payment_status in ('paid', 'collected', 'partially_refunded', 'refunded')
     or exists (select 1 from public.payment p where p.order_id = o.id and p.state = 'paid') then
    raise exception 'This booking has been paid, so NexG support cancels it and refunds you.'
      using errcode = 'P0004';
  end if;

  update public.payment
     set state = 'abandoned', updated_at = now(),
         failure_reason = coalesce(failure_reason, 'cancelled by the merchant through the API')
   where order_id = o.id and state in ('pending', 'authorised', 'failed');

  update public.order
     set stage = 'cancelled', cancelled_at = now(), cancel_reason_code = 'merchant_api',
         cancel_note = coalesce(v_note, 'Cancelled by the merchant through the API before a rider was assigned.')
   where id = o.id;

  update dispatch.job
     set state = 'cancelled', ended_at = now(), end_reason = 'merchant_cancelled'
   where order_id = o.id and state not in ('completed', 'cancelled');
  update dispatch.offer set outcome = 'withdrawn', responded_at = now()
   where outcome = 'pending'
     and job_id in (select id from dispatch.job where order_id = o.id);

  insert into public.order_event (order_id, kind, title, detail, actor_type, actor_label, payload)
  values (o.id, 'api_cancelled', 'Cancelled through the API',
          coalesce(v_note, 'The merchant cancelled before a rider was assigned. Nothing is charged.'),
          'system', 'API key ' || v_key.key_prefix,
          jsonb_build_object('channel', 'api', 'api_key_id', v_key.id));

  perform audit.log(
    p_actor_type => 'system', p_module => 'orders',
    p_action => 'order.api_cancelled',
    p_target_type => 'order', p_target_id => o.id, p_target_label => o.reference,
    p_city_id => o.city_id, p_reason => v_note,
    p_after => jsonb_build_object('merchant_id', o.merchant_id, 'api_key_id', v_key.id,
      'key_prefix', v_key.key_prefix, 'previous_status', v_from));

  return jsonb_build_object('ok', true, 'cancelled', true,
    'order', public.fn_api_order_object(o.id), 'previous_status', v_from);
end;
$$;

comment on function public.rpc_order_cancel_api(text, uuid, text) is
  'POST /v1/orders/{id}/cancel: the key''s merchant cancels its own API booking, free until a rider is assigned (P0004 after that). A test key cancels the sandbox booking. Cancelling twice answers the same.';

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, description)
values
  ('order.api_cancelled', 'orders', 'notice', false, false, false,
   'A merchant cancelled its own API booking through the API, before a rider was assigned')
on conflict (action) do nothing;

/* The stage guard (20270221000100) already allows these moves; the rule
   records who takes this path. A system step, because the caller is a
   merchant's own system through the API, not a person in a NexG app, so
   no app shows it as a button. */
insert into public.order_step_rule (actor, step, from_stages, to_stage, fulfilment, call, args, needs) values
  ('system', 'api_cancel', '{placed,confirmed,preparing,ready}', 'cancelled', null,
   'rpc_order_cancel_api', '{"p_reason": null}',
   'The merchant''s own API booking, before a rider is assigned (POST /v1/orders/{id}/cancel).')
on conflict (actor, step) do nothing;

revoke all on function public.rpc_order_cancel_api(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.rpc_order_cancel_api(text, uuid, text) to service_role;

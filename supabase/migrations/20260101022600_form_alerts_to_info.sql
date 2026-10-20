-- Form submissions reach info@nexgapp.com, and applicants get a receipt.
--
-- Done in triggers on the tables the forms write to, so a new form
-- or code path cannot forget it. Triggers never fail the submission.

create or replace function public.fn_form_alert(
  p_template text,
  p_subject text,
  p_lines text[],
  p_reply_to text default null,
  p_href text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fn_notify_enqueue(
    p_channel => 'email',
    p_recipient => 'info@nexgapp.com',
    p_template => p_template,
    p_subject => p_subject,
    p_body => array_to_string(p_lines, E'\n')
      || case when p_href is null then ''
              else E'\n\nOpen in admin: https://admin.nexgapp.com' || p_href end,
    p_payload => jsonb_strip_nulls(jsonb_build_object(
      'reply_to', nullif(trim(coalesce(p_reply_to, '')), ''))),
    p_sensitive => false);
end;
$$;

revoke execute on function public.fn_form_alert(text, text, text[], text, text)
  from public, anon, authenticated;

create or replace function public.tg_form_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_city text;
begin
  select c.name into v_city from public.city c where c.id = new.city_id;

  case tg_table_name
  when 'support_ticket' then
    perform public.fn_form_alert('form_ticket',
      'Support request ' || new.reference || ' (' || new.topic::text || ')',
      array['Reference: ' || new.reference,
            'Topic: ' || new.topic::text,
            'From: ' || coalesce(new.full_name, '—') || ' (' || new.from_role::text || ')',
            'Email: ' || coalesce(new.email, '—'),
            'Phone: ' || coalesce(new.phone, '—'),
            'Order: ' || coalesce(new.order_reference, '—'),
            '', coalesce(new.body, '')],
      new.email, '/support');

  when 'job_application' then
    perform public.fn_form_alert('form_job',
      'Job application: ' || new.role_title || ' — ' || new.full_name,
      array['Role: ' || new.role_title || coalesce(' (' || new.team || ')', ''),
            'Name: ' || new.full_name,
            'Email: ' || coalesce(new.email, '—'),
            'Phone: ' || coalesce(new.phone, '—'),
            'Link: ' || coalesce(new.link, '—'),
            'City: ' || coalesce(v_city, '—'),
            '', coalesce(new.note, '')],
      new.email, '/careers');
    perform public.fn_notify_enqueue('email', new.email, 'job_receipt',
      'Hi ' || split_part(new.full_name, ' ', 1) || E',\n\nThanks for applying for ' || new.role_title
        || E' at NexG. We have your application and a person will read it. If it is a fit we will be in touch.\n\n— The NexG team',
      'We got your application — ' || new.role_title,
      '{"reply_to":"info@nexgapp.com"}'::jsonb, false);

  when 'host' then
    if new.status::text <> 'applied' then return null; end if;
    perform public.fn_form_alert('form_host',
      'Host application: ' || coalesce(new.display_name, 'unnamed'),
      array['Property / host: ' || coalesce(new.display_name, '—') || ' (' || new.kind::text || ')',
            'Contact: ' || coalesce(new.contact_name, '—'),
            'Email: ' || coalesce(new.email, '—'),
            'Phone: ' || coalesce(new.phone, '—'),
            'City: ' || coalesce(v_city, '—'),
            'Listing: ' || coalesce(new.listing_link, '—'),
            'Units: ' || coalesce(new.units_declared_band, '—')],
      new.email, '/hotels/' || new.id::text);
    perform public.fn_notify_enqueue('email', new.email, 'host_receipt',
      'Hi ' || coalesce(split_part(new.contact_name, ' ', 1), 'there')
        || E',\n\nThanks for applying to host with NexG. We verify every listing before it goes live, and we will email you once yours is reviewed.\n\n— The NexG team',
      'We got your host application',
      '{"reply_to":"info@nexgapp.com"}'::jsonb, false);

  when 'rider' then
    if new.status::text <> 'applied' then return null; end if;
    perform public.fn_form_alert('form_rider', 'New rider application',
      array['Phone: ' || coalesce(new.phone, '—'), 'City: ' || coalesce(v_city, '—')],
      null, '/riders/' || new.id::text);

  when 'merchant' then
    if new.status::text <> 'applied' then return null; end if;
    perform public.fn_form_alert('form_merchant',
      'Merchant application: ' || coalesce(new.trading_name, new.legal_name, 'unnamed'),
      array['Trading name: ' || coalesce(new.trading_name, '—'),
            'Legal name: ' || coalesce(new.legal_name, '—'),
            'Email: ' || coalesce(new.contact_email, '—'),
            'City: ' || coalesce(v_city, '—')],
      new.contact_email, '/merchants/' || new.id::text);

  when 'waitlist_signup' then
    perform public.fn_form_alert('form_waitlist', 'Waitlist signup: ' || new.email,
      array['Email: ' || new.email, 'Source: ' || coalesce(new.source, '—'),
            'City: ' || coalesce(v_city, '—')],
      new.email, null);
  end case;

  return null;
exception when others then
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['support_ticket','job_application','host','rider','merchant','waitlist_signup']
  loop
    execute format('drop trigger if exists form_alert_insert on public.%I', t);
    execute format('create trigger form_alert_insert after insert on public.%I for each row execute function public.tg_form_alert()', t);
  end loop;
end $$;

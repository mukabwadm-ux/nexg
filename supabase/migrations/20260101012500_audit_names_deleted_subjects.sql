-- "not named" was the wrong words.
--
-- Thirty production events resolve to "[Rider] not named" or
-- "[Merchant] not named", and that reads as though somebody left a
-- field blank. They did not: the rider or merchant those events were
-- about has since been deleted, and the audit row outlived it. That
-- is the audit log doing its job, and it should say so — an auditor
-- reading "not named" goes looking for a data-entry problem, where
-- "record since deleted" tells them what actually happened.
--
-- Also handles the case the first version missed: a record that
-- exists with an empty name returned '' rather than null, so the
-- fallback never fired and the row read "[Rider] " with nothing
-- after it.

create or replace function audit.fn_actor_name(e audit.audit_event)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(trim(e.actor_label), ''),
    (select su.email from public.staff_user su where su.id = e.actor_id),
    case e.actor_type
      when 'merchant_user' then
        '[Merchant] ' || coalesce(
          /* nullif, so a row that exists with a blank name falls
             through rather than rendering "[Merchant] ". */
          nullif(trim(coalesce(
            (select coalesce(m.trading_name, m.legal_name)
               from public.merchant m where m.id = e.target_id),
            (select coalesce(m.trading_name, m.legal_name)
               from public.merchant m
               join public.document d on d.owner_id = m.id
              where d.id = e.target_id and d.owner_type = 'merchant'),
            '')), ''),
          'record since deleted')
      when 'rider' then
        '[Rider] ' || coalesce(
          nullif(trim(coalesce(
            (select trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, ''))
               from public.rider r where r.id = e.target_id),
            (select trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, ''))
               from public.rider r
               join public.document d on d.owner_id = r.id
              where d.id = e.target_id and d.owner_type = 'rider'),
            '')), ''),
          'record since deleted')
      when 'host_user' then '[Host]'
      when 'guest' then
        coalesce(
          '[Guest] ' || nullif(
            (select trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, ''))
               from public.rider r where r.id = e.target_id), ''),
          '[Guest]')
      when 'system' then '[System]'
    end,
    '[Unknown]')
$$;

comment on function audit.fn_actor_name is
  'Who an event was by. The label written at the time wins; failing that the staff row is resolved by id; failing that a non-staff actor is named from the subject it acted on. A subject that has since been deleted says so, because "not named" sends an auditor looking for a data-entry problem that does not exist.';

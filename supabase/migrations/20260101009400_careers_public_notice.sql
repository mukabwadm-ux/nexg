-- The data notice an applicant consents to.
--
-- `hr.setting` is staff-only and stays that way. But the sentence on
-- the apply form — "we keep your application for N months, then
-- anonymise it" — has to be the same N the nightly job uses, or the
-- form is consenting somebody to something that does not happen.
--
-- So one function hands out the two numbers that are genuinely
-- public, and nothing else from that table.

create or replace function hr.rpc_apply_notice()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'retention_months',
      coalesce((select (value #>> '{}')::integer from hr.setting
                where key = 'retention_months'), 6),
    'talent_pool_months',
      coalesce((select (value #>> '{}')::integer from hr.setting
                where key = 'talent_pool_months'), 12),
    'reply_sla_days',
      coalesce((select (value #>> '{}')::integer from hr.setting
                where key = 'reply_sla_days'), 2),
    'notice_version',
      coalesce((select value #>> '{}' from hr.setting
                where key = 'kdpa_notice_version'), 'v1')
  )
$$;

grant execute on function hr.rpc_apply_notice() to anon, authenticated;

comment on function hr.rpc_apply_notice() is
  'The three numbers the public pages state and the system must then honour. Everything else in hr.setting stays with the recruiters.';

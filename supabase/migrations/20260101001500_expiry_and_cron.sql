-- Scheduled jobs — spec sections 3.3 and M2 checklist.

/*
 * Expire documents whose expiry date has passed, then let the status gate pull
 * the partner back. An expired insurance certificate takes a rider off the
 * road; that is the point of tracking the date at all.
 */
create or replace function public.fn_expire_documents()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select id, owner_type, owner_id
    from public.document
    where superseded_at is null
      and status in ('uploaded', 'verified')
      and expires_at is not null
      and expires_at < current_date
  loop
    update public.document
    set status = 'expired'
    where id = v_row.id;

    perform audit.log(
      p_actor_type => 'system',
      p_module => v_row.owner_type::text,
      p_action => 'document.expired',
      p_target_type => 'document',
      p_target_id => v_row.id,
      p_after => jsonb_build_object('status', 'expired'),
      p_severity => 'high'
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.fn_expire_documents is
  'Marks documents past their expiry date. The document trigger then recomputes the partner status, which suspends or pauses them.';

-- ------------------------------------------------------- nightly chain check

create or replace function audit.run_chain_check()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v audit.chain_check%rowtype;
  v_result record;
begin
  select * into v_result from audit.verify_chain();

  insert into audit.chain_check (ok, events_checked, first_bad_id, detail)
  values (v_result.ok, v_result.events_checked, v_result.first_bad_id, v_result.detail)
  returning * into v;

  /*
   * Alert stub. A failing chain means somebody edited or removed an audit row
   * in the database itself — there is no benign explanation, and it needs a
   * person the same day. M7 replaces this with a real page-out; until then it
   * is a loud WARNING in the Postgres log and a row in chain_check that the
   * console surfaces.
   */
  if not v_result.ok then
    raise warning 'AUDIT CHAIN BROKEN: %', v_result.detail;
  end if;
end;
$$;

comment on function audit.run_chain_check is
  'Nightly wrapper around verify_chain that records the result and warns on failure.';

-- 02:00 Africa/Nairobi is 23:00 UTC the day before. pg_cron schedules in UTC
-- unless the server timezone says otherwise, so the offset is written out
-- rather than assumed.
select cron.schedule(
  'audit-verify-chain-nightly',
  '0 23 * * *',
  $$select audit.run_chain_check()$$
);

select cron.schedule(
  'expire-documents-nightly',
  '30 22 * * *',
  $$select public.fn_expire_documents()$$
);

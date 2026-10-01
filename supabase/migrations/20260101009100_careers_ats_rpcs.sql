-- Careers ATS · the writes.
--
-- The one that matters most is `rpc_stage_move`. It refuses to reject
-- somebody without a reason code and a sentence a person wrote, which
-- is the public promise turned into code. The auto-score flags; it
-- never decides.

-- ═══════════════════════════════════════════════ applying

/*
 * Score an application against its job's questions.
 *
 * Must-haves are pass or fail and do not contribute points; points
 * questions add up. A failed must-have sets a flag, and nothing else
 * — the card goes red and a human reads it.
 */
create or replace function hr.fn_score_application(
  p_job_id uuid,
  p_answers jsonb
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  q record;
  v_score integer := 0;
  v_max integer := 0;
  v_failed text[] := '{}';
  v_flags jsonb := '{}'::jsonb;
  v_answer text;
  v_num numeric;
begin
  for q in select * from hr.job_question where job_id = p_job_id order by sort
  loop
    v_answer := p_answers ->> q.id::text;

    if q.kind = 'must_yes_no' then
      if v_answer is distinct from q.must_value then
        v_failed := v_failed || q.id::text;
      end if;
      if q.flag_key is not null then
        v_flags := v_flags || jsonb_build_object(
          q.flag_key, v_answer is not distinct from q.must_value);
      end if;

    elsif q.kind = 'points_yes_no' then
      v_max := v_max + coalesce(q.points, 0);
      if v_answer = 'yes' then
        v_score := v_score + coalesce(q.points, 0);
      end if;
      if q.flag_key is not null then
        v_flags := v_flags || jsonb_build_object(q.flag_key, v_answer = 'yes');
      end if;

    elsif q.kind = 'points_number' then
      v_max := v_max + coalesce((q.threshold ->> 'points')::integer, q.points, 0);
      begin
        v_num := v_answer::numeric;
      exception when others then
        v_num := null;
      end;
      if v_num is not null
         and v_num >= coalesce((q.threshold ->> 'gte')::numeric, 0) then
        v_score := v_score + coalesce((q.threshold ->> 'points')::integer, q.points, 0);
      end if;
      if q.flag_key is not null and v_num is not null then
        v_flags := v_flags || jsonb_build_object(q.flag_key, v_num);
      end if;

    elsif q.kind = 'points_select' then
      v_max := v_max + coalesce(q.points, 0);
      if v_answer is not null and v_answer <> '' then
        v_score := v_score + coalesce(q.points, 0);
        if q.flag_key is not null then
          v_flags := v_flags || jsonb_build_object(q.flag_key, v_answer);
        end if;
      end if;
    end if;
    /* free_text scores nothing. A person reads it. */
  end loop;

  return jsonb_build_object(
    'score', v_score, 'max', v_max, 'must_failed', to_jsonb(v_failed), 'flags', v_flags);
end;
$$;

/*
 * Apply. Anonymous, so it is deliberately narrow.
 *
 * Re-applying to the same job reopens the existing application with a
 * note rather than making a second row — one person, one row, and a
 * recruiter who sees the history rather than two half-stories.
 */
create or replace function hr.rpc_apply(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job hr.job;
  v_candidate hr.candidate;
  v_application hr.application;
  v_scored jsonb;
  v_token text;
  v_email text := lower(nullif(trim(p_payload ->> 'email'), ''));
  v_existing hr.application;
  v_notice text;
begin
  if v_email is null then
    raise exception 'We need an email address — it is how we come back to you.'
      using errcode = 'check_violation';
  end if;

  select * into v_job from hr.job
  where slug = p_payload ->> 'job_slug' and status in ('open', 'always_open');

  if v_job.id is null then
    return jsonb_build_object('ok', false, 'reason', 'closed',
      'message', 'That role is no longer open.');
  end if;

  select (value #>> '{}') into v_notice from hr.setting where key = 'kdpa_notice_version';

  insert into hr.candidate (full_name, email, phone, city, linkedin_url,
                            talent_pool_opt_in, consent_at, consent_version)
  values (
    nullif(trim(p_payload ->> 'full_name'), ''),
    v_email,
    nullif(trim(p_payload ->> 'phone'), ''),
    nullif(trim(p_payload ->> 'city'), ''),
    nullif(trim(p_payload ->> 'linkedin_url'), ''),
    coalesce((p_payload ->> 'talent_pool')::boolean, false),
    now(),
    v_notice
  )
  on conflict (lower(email)) do update set
    full_name = coalesce(excluded.full_name, hr.candidate.full_name),
    phone = coalesce(excluded.phone, hr.candidate.phone),
    city = coalesce(excluded.city, hr.candidate.city),
    linkedin_url = coalesce(excluded.linkedin_url, hr.candidate.linkedin_url),
    talent_pool_opt_in = excluded.talent_pool_opt_in,
    consent_at = now(),
    consent_version = excluded.consent_version
  returning * into v_candidate;

  v_scored := hr.fn_score_application(v_job.id, coalesce(p_payload -> 'answers', '{}'::jsonb));

  /* Readable, un-guessable, and only ever stored hashed. */
  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  select * into v_existing from hr.application
  where job_id = v_job.id and candidate_id = v_candidate.id;

  if v_existing.id is not null then
    update hr.application set
      stage = case when stage in ('rejected', 'withdrawn') then 'new' else stage end,
      answers = coalesce(p_payload -> 'answers', '{}'::jsonb),
      why_nexg = nullif(trim(p_payload ->> 'why_nexg'), ''),
      screening_score = (v_scored ->> 'score')::integer,
      screening_max = (v_scored ->> 'max')::integer,
      must_failed = array(select jsonb_array_elements_text(v_scored -> 'must_failed')),
      flags = v_scored -> 'flags',
      status_token_hash = extensions.crypt(v_token, extensions.gen_salt('bf')),
      status_token_expires_at = now() + interval '90 days',
      reopened_at = now(),
      rejected_at = null, rejected_reason_code = null, rejected_reason_text = null,
      withdrawn_at = null
    where id = v_existing.id
    returning * into v_application;

    insert into hr.note (application_id, body, kind)
    values (v_application.id,
            'Re-applied ' || to_char(now(), 'DD Mon YYYY') || '.', 'note');
  else
    insert into hr.application (
      job_id, candidate_id, source, source_detail, why_nexg, answers,
      screening_score, screening_max, must_failed, flags,
      status_token_hash, status_token_expires_at
    )
    values (
      v_job.id, v_candidate.id,
      coalesce(nullif(p_payload ->> 'src', '')::hr.source, 'careers_page'),
      nullif(p_payload ->> 'referral_code', ''),
      nullif(trim(p_payload ->> 'why_nexg'), ''),
      coalesce(p_payload -> 'answers', '{}'::jsonb),
      (v_scored ->> 'score')::integer,
      (v_scored ->> 'max')::integer,
      array(select jsonb_array_elements_text(v_scored -> 'must_failed')),
      v_scored -> 'flags',
      extensions.crypt(v_token, extensions.gen_salt('bf')),
      now() + interval '90 days'
    )
    returning * into v_application;
  end if;

  insert into hr.email (application_id, candidate_id, template_key, subject, "to", status)
  select v_application.id, v_candidate.id, 'application_received',
         replace(t.subject, '{{job_title}}', v_job.title), v_candidate.email, 'queued'
  from hr.email_template t where t.key = 'application_received';

  perform audit.log('guest'::public.actor_type, 'careers', 'application.created',
    p_target_type => 'application', p_target_id => v_application.id,
    p_after => jsonb_build_object('job', v_job.slug, 'source', v_application.source,
                                  'score', v_application.screening_score));

  /* The plaintext token leaves here once, in the response, and is
     emailed. It is never stored. */
  return jsonb_build_object(
    'ok', true,
    'application_id', v_application.id,
    'token', v_token,
    'reopened', v_existing.id is not null,
    'first_name', split_part(coalesce(v_candidate.full_name, ''), ' ', 1)
  );
end;
$$;

grant execute on function hr.rpc_apply(jsonb) to anon, authenticated;
grant execute on function hr.fn_score_application(uuid, jsonb) to authenticated, service_role;

-- ═══════════════════════════════════ the candidate's own page

/*
 * Five stages, never seven, and nothing internal. No note, no score,
 * no interviewer surname, no other candidate.
 */
create or replace function hr.rpc_candidate_status(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a hr.application;
  j hr.job;
  c hr.candidate;
  v_offer hr.offer;
  v_interview hr.interview;
  v_sample hr.work_sample;
begin
  select * into a from hr.application
  where status_token_hash is not null
    and status_token_expires_at > now()
    and status_token_hash = extensions.crypt(p_token, status_token_hash)
  limit 1;

  if a.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select * into j from hr.job where id = a.job_id;
  select * into c from hr.candidate where id = a.candidate_id;
  select * into v_offer from hr.offer where application_id = a.id;
  select * into v_sample from hr.work_sample where application_id = a.id;
  select * into v_interview from hr.interview
  where application_id = a.id and status in ('proposed', 'confirmed')
  order by created_at desc limit 1;

  return jsonb_build_object(
    'ok', true,
    'job_title', j.title,
    'job_slug', j.slug,
    'applied_at', a.created_at,
    'stage', a.stage,
    'public_stage', hr.fn_public_stage(a.stage),
    'step', hr.fn_public_step(a.stage),
    'stage_entered_at', a.stage_entered_at,
    'first_name', split_part(coalesce(c.full_name, ''), ' ', 1),
    'weeks_to_hire', hr.fn_weeks_to_hire(j.stage_targets),
    /* The reason, verbatim, because that is the promise. */
    'rejected_reason', a.rejected_reason_text,
    'talent_pool', c.talent_pool_opt_in,
    'interview', case when v_interview.id is not null then jsonb_build_object(
      'id', v_interview.id,
      'kind', v_interview.kind,
      'status', v_interview.status,
      'slots', v_interview.proposed_slots,
      'scheduled_at', v_interview.scheduled_at,
      'meet_link', case when v_interview.status = 'confirmed' then v_interview.meet_link end
    ) end,
    'work_sample', case when v_sample.id is not null then jsonb_build_object(
      'brief', j.work_sample_candidate_md,
      'paid', j.work_sample_paid,
      'pay_note', j.work_sample_pay_note,
      'due_at', v_sample.due_at,
      'submitted_at', v_sample.submitted_at
    ) end,
    'offer', case when v_offer.id is not null and v_offer.status in ('sent', 'accepted', 'declined')
      then jsonb_build_object(
        'status', v_offer.status,
        'salary', v_offer.salary,
        'currency', v_offer.currency,
        'start_date', v_offer.start_date,
        'contract', v_offer.contract,
        'conditions', v_offer.conditions,
        'expires_at', v_offer.expires_at
      ) end,
    'retention_months', (select value #>> '{}' from hr.setting where key = 'retention_months')
  );
end;
$$;

create or replace function hr.fn_application_for_token(p_token text)
returns hr.application
language sql
stable
security definer
set search_path = ''
as $$
  select * from hr.application
  where status_token_hash is not null
    and status_token_expires_at > now()
    and status_token_hash = extensions.crypt(p_token, status_token_hash)
  limit 1
$$;

create or replace function hr.rpc_candidate_confirm_slot(
  p_token text,
  p_interview_id uuid,
  p_slot timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a hr.application;
begin
  a := hr.fn_application_for_token(p_token);
  if a.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  update hr.interview set
    scheduled_at = p_slot,
    status = 'confirmed',
    candidate_confirmed_at = now()
  where id = p_interview_id and application_id = a.id and status = 'proposed';

  if not found then
    return jsonb_build_object('ok', false,
      'reason', 'That time is no longer on offer. Ask us for new times.');
  end if;

  perform audit.log('guest'::public.actor_type, 'careers', 'interview.confirmed',
    p_target_type => 'application', p_target_id => a.id,
    p_after => jsonb_build_object('at', p_slot));

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function hr.rpc_candidate_withdraw(p_token text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a hr.application;
begin
  a := hr.fn_application_for_token(p_token);
  if a.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  update hr.application set stage = 'withdrawn', withdrawn_at = now()
  where id = a.id;

  insert into hr.note (application_id, body, kind)
  values (a.id, coalesce(nullif(trim(coalesce(p_reason, '')), ''),
                         'Withdrawn by the candidate.'), 'note');

  insert into hr.email (application_id, candidate_id, template_key, subject, status)
  select a.id, a.candidate_id, 'withdrawn_ack', t.subject, 'queued'
  from hr.email_template t where t.key = 'withdrawn_ack';

  perform audit.log('guest'::public.actor_type, 'careers', 'application.withdrawn',
    p_target_type => 'application', p_target_id => a.id, p_reason => p_reason);

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function hr.rpc_candidate_talent_pool(p_token text, p_opt_in boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a hr.application;
  v_months integer;
begin
  a := hr.fn_application_for_token(p_token);
  if a.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select (value #>> '{}')::integer into v_months from hr.setting where key = 'talent_pool_months';

  update hr.candidate set
    talent_pool_opt_in = p_opt_in,
    talent_pool_until = case when p_opt_in
      then (current_date + make_interval(months => coalesce(v_months, 12)))::date end
  where id = a.candidate_id;

  if p_opt_in then
    update hr.application set
      on_file_until = (current_date + make_interval(months => coalesce(v_months, 12)))::date
    where id = a.id;

    insert into hr.email (application_id, candidate_id, template_key, subject, status)
    select a.id, a.candidate_id, 'on_file_confirmed', t.subject, 'queued'
    from hr.email_template t where t.key = 'on_file_confirmed';
  end if;

  return jsonb_build_object('ok', true, 'until',
    (current_date + make_interval(months => coalesce(v_months, 12)))::date);
end;
$$;

create or replace function hr.rpc_candidate_respond_offer(
  p_token text,
  p_accept boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a hr.application;
  v_offer hr.offer;
begin
  a := hr.fn_application_for_token(p_token);
  if a.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select * into v_offer from hr.offer where application_id = a.id and status = 'sent';
  if v_offer.id is null then
    return jsonb_build_object('ok', false, 'reason', 'There is no open offer to answer.');
  end if;

  update hr.offer set
    status = case when p_accept then 'accepted' else 'declined' end,
    responded_at = now(),
    decline_reason = case when p_accept then null else nullif(trim(coalesce(p_reason, '')), '') end
  where id = v_offer.id;

  perform audit.log('guest'::public.actor_type, 'careers',
    case when p_accept then 'offer.accepted' else 'offer.declined' end,
    p_target_type => 'application', p_target_id => a.id, p_reason => p_reason,
    p_severity => 'high'::public.audit_severity);

  return jsonb_build_object('ok', true);
end;
$$;

/* Forwards to the KDPA queue the hospitality module already runs. */
create or replace function hr.rpc_candidate_request_deletion(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a hr.application;
  c hr.candidate;
begin
  a := hr.fn_application_for_token(p_token);
  if a.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select * into c from hr.candidate where id = a.candidate_id;

  insert into public.data_request (requester_email, requester_phone, kind, channel, scope)
  values (c.email, c.phone, 'erasure', 'careers status page',
          array['profile', 'messages']);

  perform audit.log('guest'::public.actor_type, 'careers', 'data_request.received',
    p_target_type => 'candidate', p_target_id => c.id,
    p_severity => 'high'::public.audit_severity);

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function hr.rpc_candidate_status(text) to anon, authenticated;
grant execute on function hr.rpc_candidate_confirm_slot(text, uuid, timestamptz) to anon, authenticated;
grant execute on function hr.rpc_candidate_withdraw(text, text) to anon, authenticated;
grant execute on function hr.rpc_candidate_talent_pool(text, boolean) to anon, authenticated;
grant execute on function hr.rpc_candidate_respond_offer(text, boolean, text) to anon, authenticated;
grant execute on function hr.rpc_candidate_request_deletion(text) to anon, authenticated;

-- ═══════════════════════════════════════════ the stage machine

/*
 * Every forward move composes the stage's email; a rejection cannot
 * be saved without a reason code and a sentence somebody wrote.
 *
 * This is the public promise — "if it's a no, you'll hear it from a
 * person, with a reason" — as a refusal rather than a convention. The
 * table constraint says the same thing, so no other path can slip
 * past it either.
 */
create or replace function hr.rpc_stage_move(
  p_application_id uuid,
  p_to_stage hr.stage,
  p_note text default null,
  p_reason_code text default null,
  p_reason_text text default null,
  p_template_key text default null
)
returns hr.application
language plpgsql
security definer
set search_path = ''
as $$
declare
  a hr.application;
  j hr.job;
  v_offer hr.offer;
  v_email uuid;
  v_order_from integer;
  v_order_to integer;
begin
  select * into a from hr.application where id = p_application_id;
  if a.id is null then
    raise exception 'No such application.' using errcode = 'no_data_found';
  end if;

  /* Interviewers may read; they may not move anybody. */
  if not authz.is_recruiter() and not authz.manages_job(a.job_id) then
    raise exception 'Not yours to move.' using errcode = 'insufficient_privilege';
  end if;

  select * into j from hr.job where id = a.job_id;

  if p_to_stage = 'rejected' then
    if coalesce(trim(coalesce(p_reason_text, '')), '') = '' or p_reason_code is null then
      raise exception 'A rejection needs a reason the candidate can read. Pick a reason and write the sentence.'
        using errcode = 'check_violation';
    end if;
    if not exists (select 1 from hr.rejection_reason where code = p_reason_code and active) then
      raise exception 'That is not a reason on the list.' using errcode = 'check_violation';
    end if;
    if p_template_key is null then
      raise exception 'A rejection goes out on a template, so every no reads the same way.'
        using errcode = 'check_violation';
    end if;
  end if;

  if p_to_stage = 'hired' then
    select * into v_offer from hr.offer where application_id = a.id;
    if v_offer.status is distinct from 'accepted' then
      raise exception 'Nobody is hired until they have accepted an offer.'
        using errcode = 'check_violation';
    end if;
  end if;

  /* Going backwards is allowed, but somebody has to say why. */
  v_order_from := array_position(
    array['new','screening','intro_call','work_sample','team_conversation','offer','hired']::text[],
    a.stage::text);
  v_order_to := array_position(
    array['new','screening','intro_call','work_sample','team_conversation','offer','hired']::text[],
    p_to_stage::text);

  if v_order_from is not null and v_order_to is not null and v_order_to < v_order_from
     and coalesce(trim(coalesce(p_note, '')), '') = '' then
    raise exception 'Moving somebody back needs a note saying why.'
      using errcode = 'check_violation';
  end if;

  /* The email, stored before it is sent, so the Emails tab is the
     record rather than a reconstruction. */
  if p_template_key is not null then
    insert into hr.email (application_id, candidate_id, template_key, subject, status, sent_by)
    select a.id, a.candidate_id, p_template_key,
           replace(t.subject, '{{job_title}}', j.title), 'queued', authz.staff_id()
    from hr.email_template t where t.key = p_template_key
    returning id into v_email;
  end if;

  update hr.application set
    stage = p_to_stage,
    owner_id = coalesce(owner_id, authz.staff_id()),
    rejected_at = case when p_to_stage = 'rejected' then now() else rejected_at end,
    rejected_reason_code = case when p_to_stage = 'rejected' then p_reason_code
                                else rejected_reason_code end,
    rejected_reason_text = case when p_to_stage = 'rejected' then trim(p_reason_text)
                                else rejected_reason_text end,
    rejected_by = case when p_to_stage = 'rejected' then authz.staff_id() else rejected_by end,
    hired_at = case when p_to_stage = 'hired' then now() else hired_at end,
    start_date = case when p_to_stage = 'hired' then coalesce(start_date, v_offer.start_date)
                      else start_date end,
    /* The link stays alive as long as the process does. */
    status_token_expires_at = greatest(status_token_expires_at, now() + interval '90 days')
  where id = p_application_id
  returning * into a;

  if v_email is not null then
    update hr.stage_event set email_id = v_email
    where application_id = a.id and email_id is null
    and at = (select max(at) from hr.stage_event where application_id = a.id);
  end if;

  if nullif(trim(coalesce(p_note, '')), '') is not null then
    insert into hr.note (application_id, author_id, body, kind)
    values (a.id, authz.staff_id(), trim(p_note), 'note');
  end if;

  /* One fewer opening, and the job pauses itself at zero rather than
     collecting applications for a seat that is taken. */
  if p_to_stage = 'hired' then
    update hr.job set
      openings = greatest(openings - 1, 0),
      status = case when openings - 1 <= 0 and status = 'open' then 'paused' else status end
    where id = a.job_id;
  end if;

  perform audit.log('staff'::public.actor_type, 'careers',
    case when p_to_stage = 'rejected' then 'application.rejected'
         else 'application.stage_changed' end,
    p_target_type => 'application', p_target_id => a.id,
    p_reason => coalesce(p_reason_text, p_note),
    p_after => jsonb_build_object('to', p_to_stage, 'reason_code', p_reason_code),
    p_severity => case when p_to_stage in ('rejected', 'hired')
      then 'high' else 'notice' end::public.audit_severity);

  return a;
end;
$$;

grant execute on function hr.rpc_stage_move(uuid, hr.stage, text, text, text, text) to authenticated;

-- ═══════════════════════════════════ jobs, notes, interviews

create or replace function hr.rpc_job_upsert(p_job jsonb, p_job_id uuid default null)
returns hr.job
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job hr.job;
begin
  if not authz.is_recruiter() and not (p_job_id is not null and authz.manages_job(p_job_id)) then
    raise exception 'Not yours.' using errcode = 'insufficient_privilege';
  end if;

  if p_job_id is null then
    insert into hr.job (slug, title, team_id, city_id, location_label, work_mode, contract,
                        description_md, responsibilities_md, requirements_md, nice_to_have_md,
                        benefits_md, openings, hiring_manager_id, created_by)
    values (
      coalesce(nullif(p_job ->> 'slug', ''),
               lower(regexp_replace(trim(p_job ->> 'title'), '[^a-zA-Z0-9]+', '-', 'g'))),
      trim(p_job ->> 'title'),
      nullif(p_job ->> 'team_id', '')::uuid,
      nullif(p_job ->> 'city_id', '')::uuid,
      nullif(trim(p_job ->> 'location_label'), ''),
      nullif(p_job ->> 'work_mode', '')::hr.work_mode,
      nullif(p_job ->> 'contract', '')::hr.contract_type,
      nullif(p_job ->> 'description_md', ''),
      nullif(p_job ->> 'responsibilities_md', ''),
      nullif(p_job ->> 'requirements_md', ''),
      nullif(p_job ->> 'nice_to_have_md', ''),
      nullif(p_job ->> 'benefits_md', ''),
      coalesce((p_job ->> 'openings')::integer, 1),
      nullif(p_job ->> 'hiring_manager_id', '')::uuid,
      authz.staff_id())
    returning * into v_job;
  else
    update hr.job set
      title = coalesce(nullif(trim(p_job ->> 'title'), ''), title),
      team_id = coalesce(nullif(p_job ->> 'team_id', '')::uuid, team_id),
      city_id = coalesce(nullif(p_job ->> 'city_id', '')::uuid, city_id),
      location_label = coalesce(nullif(trim(p_job ->> 'location_label'), ''), location_label),
      work_mode = coalesce(nullif(p_job ->> 'work_mode', '')::hr.work_mode, work_mode),
      contract = coalesce(nullif(p_job ->> 'contract', '')::hr.contract_type, contract),
      description_md = coalesce(nullif(p_job ->> 'description_md', ''), description_md),
      responsibilities_md = coalesce(nullif(p_job ->> 'responsibilities_md', ''), responsibilities_md),
      requirements_md = coalesce(nullif(p_job ->> 'requirements_md', ''), requirements_md),
      nice_to_have_md = coalesce(nullif(p_job ->> 'nice_to_have_md', ''), nice_to_have_md),
      benefits_md = coalesce(nullif(p_job ->> 'benefits_md', ''), benefits_md),
      openings = coalesce((p_job ->> 'openings')::integer, openings),
      hiring_manager_id = coalesce(nullif(p_job ->> 'hiring_manager_id', '')::uuid, hiring_manager_id),
      salary_min = case when p_job ? 'salary_min'
        then nullif(p_job ->> 'salary_min', '')::bigint else salary_min end,
      salary_max = case when p_job ? 'salary_max'
        then nullif(p_job ->> 'salary_max', '')::bigint else salary_max end,
      salary_public = coalesce((p_job ->> 'salary_public')::boolean, salary_public),
      stage_targets = coalesce(p_job -> 'stage_targets', stage_targets)
    where id = p_job_id
    returning * into v_job;
  end if;

  perform audit.log('staff'::public.actor_type, 'careers', 'job.saved',
    p_target_type => 'job', p_target_id => v_job.id, p_city_id => v_job.city_id,
    p_after => jsonb_build_object('status', v_job.status, 'title', v_job.title));

  return v_job;
end;
$$;

create or replace function hr.rpc_job_status(
  p_job_id uuid,
  p_status hr.job_status,
  p_reason text default null
)
returns hr.job
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job hr.job;
  v_in_flight integer;
begin
  if not authz.is_recruiter() and not authz.manages_job(p_job_id) then
    raise exception 'Not yours.' using errcode = 'insufficient_privilege';
  end if;

  if p_status = 'closed' then
    if coalesce(trim(coalesce(p_reason, '')), '') = '' then
      raise exception 'Say why it is closing — it goes in the audit log and shapes the emails.'
        using errcode = 'check_violation';
    end if;

    select count(*) into v_in_flight from hr.application
    where job_id = p_job_id and stage not in ('rejected', 'withdrawn', 'hired', 'on_file');

    if v_in_flight > 0 then
      raise exception 'There are still % people in this pipeline. Reject them with a reason or move them on file first — closing cannot leave anybody unanswered.',
        v_in_flight using errcode = 'check_violation';
    end if;
  end if;

  update hr.job set
    status = p_status,
    posted_at = case when p_status in ('open', 'always_open') then coalesce(posted_at, now())
                     else posted_at end,
    closed_at = case when p_status = 'closed' then now() end,
    closed_reason = case when p_status = 'closed' then trim(p_reason) else closed_reason end
  where id = p_job_id
  returning * into v_job;

  perform audit.log('staff'::public.actor_type, 'careers', 'job.' || p_status::text,
    p_target_type => 'job', p_target_id => p_job_id, p_reason => p_reason,
    p_city_id => v_job.city_id, p_severity => 'notice'::public.audit_severity);

  return v_job;
end;
$$;

create or replace function hr.rpc_note_add(
  p_application_id uuid,
  p_body text,
  p_kind hr.note_kind default 'note',
  p_score integer default null,
  p_recommend hr.recommendation default null,
  p_interview_id uuid default null
)
returns hr.note
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note hr.note;
begin
  if not authz.sees_application(p_application_id) then
    raise exception 'Not your candidate.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Write something.' using errcode = 'check_violation';
  end if;

  insert into hr.note (application_id, author_id, body, kind, score, recommend,
                       interview_id, visible_to)
  values (p_application_id, authz.staff_id(), trim(p_body), p_kind, p_score, p_recommend,
          p_interview_id,
          case when p_kind = 'interview_feedback' then 'panel' else 'recruiters' end)
  returning * into v_note;

  return v_note;
end;
$$;

create or replace function hr.rpc_interview_propose(
  p_application_id uuid,
  p_kind hr.interview_kind,
  p_slots jsonb,
  p_interviewers uuid[] default '{}',
  p_duration_min integer default 30
)
returns hr.interview
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_interview hr.interview;
  a hr.application;
begin
  select * into a from hr.application where id = p_application_id;
  if not authz.is_recruiter() and not authz.manages_job(a.job_id) then
    raise exception 'Not yours.' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_array_length(coalesce(p_slots, '[]'::jsonb)) = 0 then
    raise exception 'Offer at least one time.' using errcode = 'check_violation';
  end if;

  insert into hr.interview (application_id, kind, proposed_slots, interviewers, duration_min)
  values (p_application_id, p_kind, p_slots, p_interviewers, p_duration_min)
  returning * into v_interview;

  perform audit.log('staff'::public.actor_type, 'careers', 'interview.proposed',
    p_target_type => 'application', p_target_id => p_application_id,
    p_after => jsonb_build_object('kind', p_kind, 'slots', jsonb_array_length(p_slots)));

  return v_interview;
end;
$$;

create or replace function hr.rpc_work_sample_send(
  p_application_id uuid,
  p_due_days integer default 3,
  p_paid boolean default true,
  p_amount bigint default null
)
returns hr.work_sample
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sample hr.work_sample;
  a hr.application;
begin
  select * into a from hr.application where id = p_application_id;
  if not authz.is_recruiter() and not authz.manages_job(a.job_id) then
    raise exception 'Not yours.' using errcode = 'insufficient_privilege';
  end if;

  insert into hr.work_sample (application_id, brief_sent_at, due_at, payment_amount,
                              payment_status)
  values (p_application_id, now(), now() + make_interval(days => p_due_days), p_amount,
          case when p_paid then 'due' else 'n/a' end)
  on conflict (application_id) do update set
    brief_sent_at = now(),
    due_at = now() + make_interval(days => p_due_days),
    payment_amount = excluded.payment_amount
  returning * into v_sample;

  return v_sample;
end;
$$;

create or replace function hr.rpc_work_sample_review(
  p_application_id uuid,
  p_score integer,
  p_notes text default null
)
returns hr.work_sample
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sample hr.work_sample;
begin
  if not authz.sees_application(p_application_id) then
    raise exception 'Not your candidate.' using errcode = 'insufficient_privilege';
  end if;

  update hr.work_sample set
    score = p_score, notes = p_notes,
    reviewed_by = authz.staff_id(), reviewed_at = now()
  where application_id = p_application_id
  returning * into v_sample;

  return v_sample;
end;
$$;

grant execute on function hr.rpc_job_upsert(jsonb, uuid) to authenticated;
grant execute on function hr.rpc_job_status(uuid, hr.job_status, text) to authenticated;
grant execute on function hr.rpc_note_add(uuid, text, hr.note_kind, integer, hr.recommendation, uuid) to authenticated;
grant execute on function hr.rpc_interview_propose(uuid, hr.interview_kind, jsonb, uuid[], integer) to authenticated;
grant execute on function hr.rpc_work_sample_send(uuid, integer, boolean, bigint) to authenticated;
grant execute on function hr.rpc_work_sample_review(uuid, integer, text) to authenticated;

-- ═══════════════════════════════════ offers, PII, retention

create or replace function hr.rpc_offer_draft(p_application_id uuid, p_offer jsonb)
returns hr.offer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer hr.offer;
  a hr.application;
begin
  select * into a from hr.application where id = p_application_id;
  if not authz.is_recruiter() and not authz.manages_job(a.job_id) then
    raise exception 'Not yours.' using errcode = 'insufficient_privilege';
  end if;

  insert into hr.offer (application_id, salary, currency, start_date, contract,
                        conditions, equity_note, expires_at)
  values (p_application_id,
          nullif(p_offer ->> 'salary', '')::bigint,
          coalesce(nullif(p_offer ->> 'currency', ''), 'KES'),
          nullif(p_offer ->> 'start_date', '')::date,
          nullif(p_offer ->> 'contract', '')::hr.contract_type,
          coalesce(array(select jsonb_array_elements_text(p_offer -> 'conditions')), '{}'),
          nullif(p_offer ->> 'equity_note', ''),
          now() + interval '7 days')
  on conflict (application_id) do update set
    salary = excluded.salary, start_date = excluded.start_date,
    contract = excluded.contract, conditions = excluded.conditions,
    equity_note = excluded.equity_note, status = 'drafted'
  returning * into v_offer;

  return v_offer;
end;
$$;

/*
 * Approving an offer. Above the threshold it needs a second person —
 * and the threshold being null means every offer does, because
 * nobody has said what counts as large.
 */
create or replace function hr.rpc_offer_approve(p_application_id uuid)
returns hr.offer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer hr.offer;
  v_me uuid := authz.staff_id();
  v_threshold bigint;
  v_needs_two boolean;
begin
  if not authz.is_recruiter() then
    raise exception 'Not yours to approve.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_offer from hr.offer where application_id = p_application_id;
  if v_offer.id is null then
    raise exception 'No offer drafted.' using errcode = 'no_data_found';
  end if;

  select nullif(value #>> '{}', '')::bigint into v_threshold
  from hr.setting where key = 'offer_second_approver_above';

  v_needs_two := v_threshold is null or coalesce(v_offer.salary, 0) >= v_threshold;

  if v_offer.approved_by is null then
    update hr.offer set
      approved_by = v_me,
      status = case when v_needs_two then 'awaiting_approval' else 'sent' end,
      sent_at = case when not v_needs_two then now() end
    where id = v_offer.id returning * into v_offer;

  elsif v_offer.approved_by = v_me then
    raise exception 'You approved this one. %',
      case when v_threshold is null
        then 'No salary threshold has been set, so every offer needs a second person.'
        else 'Offers at or above KES ' || v_threshold || ' need a second person.' end
      using errcode = 'insufficient_privilege';

  else
    update hr.offer set second_approver_id = v_me, status = 'sent', sent_at = now()
    where id = v_offer.id returning * into v_offer;

    insert into hr.email (application_id, candidate_id, template_key, subject, status, sent_by)
    select p_application_id, a.candidate_id, 'offer_sent', t.subject, 'queued', v_me
    from hr.application a, hr.email_template t
    where a.id = p_application_id and t.key = 'offer_sent';
  end if;

  perform audit.log('staff'::public.actor_type, 'careers', 'offer.' || v_offer.status::text,
    p_target_type => 'application', p_target_id => p_application_id, p_approved_by => v_me,
    p_after => jsonb_build_object('salary', v_offer.salary, 'status', v_offer.status),
    p_severity => 'high'::public.audit_severity);

  return v_offer;
end;
$$;

/*
 * A CV and a phone number are the two most identifying things here.
 * Both come out of a function that names who looked and why, and an
 * interviewer gets neither.
 */
create or replace function hr.rpc_candidate_reveal_phone(p_candidate_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c hr.candidate;
begin
  if not authz.is_recruiter() then
    raise exception 'Only recruiters see a candidate''s number.'
      using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why. The reason is kept with your name.'
      using errcode = 'check_violation';
  end if;

  select * into c from hr.candidate where id = p_candidate_id;

  perform audit.log('staff'::public.actor_type, 'careers', 'candidate.phone_revealed',
    p_target_type => 'candidate', p_target_id => p_candidate_id, p_reason => trim(p_reason),
    p_severity => 'high'::public.audit_severity);

  return jsonb_build_object('ok', true, 'phone', c.phone);
end;
$$;

create or replace function hr.rpc_cv_path(p_candidate_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c hr.candidate;
begin
  /* An interviewer reads answers and writes feedback. They do not
     download CVs — the panel judges the conversation. */
  if not authz.is_recruiter() then
    raise exception 'Only recruiters download a CV.' using errcode = 'insufficient_privilege';
  end if;

  select * into c from hr.candidate where id = p_candidate_id;

  perform audit.log('staff'::public.actor_type, 'careers', 'candidate.cv_viewed',
    p_target_type => 'candidate', p_target_id => p_candidate_id,
    p_severity => 'high'::public.audit_severity);

  return jsonb_build_object('ok', c.cv_path is not null, 'path', c.cv_path);
end;
$$;

/*
 * Anonymise, never delete. The stage events and the score stay so the
 * funnel still adds up; everything that names a person becomes a
 * token and the CV object goes.
 */
create or replace function hr.fn_anonymise_candidate(p_candidate_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update hr.candidate set
    full_name = 'Candidate ' || left(replace(p_candidate_id::text, '-', ''), 8),
    email = 'anonymised+' || left(replace(p_candidate_id::text, '-', ''), 8) || '@invalid',
    phone = null,
    city = null,
    linkedin_url = null,
    cv_path = null,
    cv_text = null,
    skills = '{}',
    anonymised_at = now()
  where id = p_candidate_id;

  update hr.application set
    why_nexg = null,
    answers = '{}'::jsonb,
    status_token_hash = null
  where candidate_id = p_candidate_id;

  update hr.note n set body = '[removed]'
  from hr.application a
  where a.id = n.application_id and a.candidate_id = p_candidate_id;

  perform audit.log('system'::public.actor_type, 'careers', 'candidate.anonymised',
    p_target_type => 'candidate', p_target_id => p_candidate_id,
    p_severity => 'high'::public.audit_severity);
end;
$$;

create or replace function hr.cron_hr_retention()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_months integer;
  v_n integer := 0;
  r record;
begin
  select (value #>> '{}')::integer into v_months from hr.setting where key = 'retention_months';

  for r in
    select distinct a.candidate_id
    from hr.application a
    join hr.candidate c on c.id = a.candidate_id
    where c.anonymised_at is null
      and not c.talent_pool_opt_in
      and a.stage in ('rejected', 'withdrawn', 'hired')
      and coalesce(a.rejected_at, a.withdrawn_at, a.hired_at)
            < now() - make_interval(months => coalesce(v_months, 6))
      /* Only if every one of their applications has ended. */
      and not exists (
        select 1 from hr.application other
        where other.candidate_id = a.candidate_id
          and other.stage not in ('rejected', 'withdrawn', 'hired')
      )
  loop
    perform hr.fn_anonymise_candidate(r.candidate_id);
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

grant execute on function hr.rpc_offer_draft(uuid, jsonb) to authenticated;
grant execute on function hr.rpc_offer_approve(uuid) to authenticated;
grant execute on function hr.rpc_candidate_reveal_phone(uuid, text) to authenticated;
grant execute on function hr.rpc_cv_path(uuid) to authenticated;
grant execute on function hr.fn_anonymise_candidate(uuid) to service_role;
grant execute on function hr.cron_hr_retention() to service_role;

-- Local development fixtures · careers.
--
-- Runs only on `supabase db reset`. Names are bracketed the way the
-- artboards bracket them; no real person, phone, CV or salary.

do $$
declare
  v_concierge uuid := (select id from hr.team where name = 'Concierge & Operations');
  v_tech uuid := (select id from hr.team where name = 'Technology');
  v_growth uuid := (select id from hr.team where name = 'Growth & Partnerships');
  v_launch uuid := (select id from hr.team where name = 'City Launch');
  v_nairobi uuid := (select id from public.city where slug = 'nairobi');
  v_mombasa uuid := (select id from public.city where slug = 'mombasa');
  v_hm uuid;
  v_job uuid;
  v_q_nights uuid;
  v_q_lang uuid;
  v_q_years uuid;
  v_q_pms uuid;
  v_app uuid;
  r record;
begin
  select id into v_hm from public.staff_user limit 1;

  -- ── roles ─────────────────────────────────────────────────────

  insert into hr.job (slug, title, team_id, city_id, location_label, work_mode, contract,
                      status, openings, hiring_manager_id, description_md,
                      responsibilities_md, requirements_md, posted_at, salary_public)
  values
    ('concierge-agent-night','Concierge Agent (Night Shift)', v_concierge, v_nairobi,
     'Nairobi · Shifts','on_site_shifts','full_time','open', 2, v_hm,
     'The desk at night. Guests ask for whatever they need and you make it happen.',
     'Answer the desk · place orders with merchants · brief riders · handle what goes wrong.',
     'Fluent English and Kiswahili · comfortable on the phone · can work 22:00–06:00.',
     now() - interval '14 days', false),
    ('dispatch-rider-ops-lead','Dispatch & Rider Operations Lead', v_concierge, v_nairobi,
     'Nairobi · On-site','on_site','full_time','open', 1, v_hm,
     'Keep the fleet moving and the riders looked after.', null, null,
     now() - interval '21 days', false),
    ('city-operations-manager','City Operations Manager', v_concierge, v_mombasa,
     'Mombasa · On-site','on_site','full_time','open', 1, v_hm,
     'Run Mombasa end to end.', null, null, now() - interval '30 days', false),
    ('senior-fullstack-engineer','Senior Full-stack Engineer', v_tech, v_nairobi,
     'Nairobi / Remote','hybrid','full_time','open', 1, v_hm,
     'Build the systems the whole thing runs on.', null, null,
     now() - interval '18 days', false),
    ('mobile-engineer-rider-app','Mobile Engineer — Rider App', v_tech, null,
     'Remote (EAT)','remote_eat','full_time','open', 1, v_hm,
     'The app a rider uses in the rain at midnight.', null, null,
     now() - interval '11 days', false),
    ('hotel-airbnb-partnerships','Hotel & Airbnb Partnerships Manager', v_growth, v_nairobi,
     'Nairobi · On-site','on_site','full_time','open', 1, v_hm,
     'Sign the hotels and hosts.', null, null, now() - interval '9 days', false),
    ('city-launcher','City Launcher', v_launch, null,
     'Kampala · On-site','on_site','contract_6mo','open', 1, v_hm,
     'Open a city from nothing.', null, null, now() - interval '40 days', false),
    ('product-designer','Product Designer', v_tech, v_nairobi,
     'Nairobi / Remote','hybrid','full_time','draft', 1, v_hm,
     '[Description]', null, null, null, false),
    ('merchant-success-associate','Merchant Success Associate', v_growth, v_nairobi,
     'Nairobi · On-site','on_site','full_time','draft', 1, v_hm,
     '[Description]', null, null, null, false)
  on conflict (slug) do nothing;

  select id into v_job from hr.job where slug = 'concierge-agent-night';

  insert into hr.job_question (job_id, sort, kind, prompt, must_value, flag_key)
  values (v_job, 1, 'must_yes_no', 'Can you work 22:00–06:00 shifts incl. weekends?', 'yes', 'nights')
  returning id into v_q_nights;

  insert into hr.job_question (job_id, sort, kind, prompt, must_value, flag_key)
  values (v_job, 2, 'must_yes_no', 'English and Kiswahili fluency', 'yes', 'EN/SW')
  returning id into v_q_lang;

  insert into hr.job_question (job_id, sort, kind, prompt, threshold, flag_key)
  values (v_job, 3, 'points_number', 'Customer-facing experience (years)',
          '{"gte": 1, "points": 2}'::jsonb, 'years')
  returning id into v_q_years;

  insert into hr.job_question (job_id, sort, kind, prompt, points, flag_key)
  values (v_job, 4, 'points_yes_no', 'Have you used a hotel PMS or ticketing tool?', 1, 'PMS')
  returning id into v_q_pms;

  insert into hr.job_question (job_id, sort, kind, prompt)
  values (v_job, 5, 'free_text', 'Why NexG? (3 lines)');

  -- ── applicants across the pipeline ───────────────────────────

  for r in
    select * from (values
      ('[Applicant name]','one@example.test','Nairobi','airline ground staff','yes','yes','4','yes','work_sample','linkedin'),
      ('[Applicant name]','two@example.test','Nairobi','hotel front desk','yes','yes','3','yes','new','linkedin'),
      ('[Applicant name]','three@example.test','Nairobi','hotel reservations','yes','yes','2','no','screening','careers_page'),
      ('[Applicant name]','four@example.test','Nakuru','relocating','yes','yes','1','no','screening','careers_page'),
      ('[Applicant name]','five@example.test','Nairobi','call-centre','yes','yes','5','yes','intro_call','careers_page'),
      ('[Applicant name]','six@example.test','Kiambu','retail supervisor','yes','yes','2','no','new','referral'),
      ('[Applicant name]','seven@example.test','Nairobi','security control room','yes','yes','6','yes','team_conversation','linkedin'),
      ('[Applicant name]','eight@example.test','Nairobi','cannot work nights','no','yes','3','no','new','brightermonday')
    ) as t(name, email, city, background, nights, lang, years, pms, stage, src)
  loop
    perform hr.rpc_apply(jsonb_build_object(
      'job_slug','concierge-agent-night',
      'full_name', r.name,
      'email', r.email,
      'phone','+254700000' || (900 + length(r.email))::text,
      'city', r.city,
      'src', r.src,
      'why_nexg','[Answer excerpt — 3 lines]',
      'answers', jsonb_build_object(
        v_q_nights::text, r.nights,
        v_q_lang::text, r.lang,
        v_q_years::text, r.years,
        v_q_pms::text, r.pms)
    ));

    select a.id into v_app from hr.application a
    join hr.candidate c on c.id = a.candidate_id where c.email = r.email;

    /* Backdate so days-in-stage and "needs action" have something to
       measure against. */
    update hr.application set
      stage = r.stage::hr.stage,
      created_at = now() - make_interval(days => (length(r.email) % 9) + 1),
      stage_entered_at = now() - make_interval(days => (length(r.email) % 5))
    where id = v_app;

    update hr.candidate set city = r.city where email = r.email;
  end loop;

  /* A work sample, submitted and scored. */
  insert into hr.work_sample (application_id, brief_sent_at, due_at, submitted_at,
                              hours_reported, payment_status, payment_amount, score, reviewed_by)
  select a.id, now() - interval '5 days', now() - interval '2 days', now() - interval '2 days',
         3, 'paid', null, 17, v_hm
  from hr.application a join hr.candidate c on c.id = a.candidate_id
  where c.email = 'one@example.test';

  /* A panel, and one write-up, so blind feedback has something to hide. */
  insert into hr.interview (application_id, kind, interviewers, status, scheduled_at, location)
  select a.id, 'team_conversation', array[v_hm], 'done', now() - interval '1 day', 'google_meet'
  from hr.application a join hr.candidate c on c.id = a.candidate_id
  where c.email = 'seven@example.test';

  insert into hr.note (application_id, author_id, body, kind, score, recommend, visible_to)
  select a.id, v_hm,
         'Calm under pressure. Handled the refusal-to-pay scenario exactly per policy. Recommend team conversation.',
         'interview_feedback', 4, 'yes', 'panel'
  from hr.application a join hr.candidate c on c.id = a.candidate_id
  where c.email = 'seven@example.test';

  /* One sitting in New past the three-day line, and one whose
     must-have failed — so the "needs action" chip and the red card
     both have something behind them. */
  update hr.application set
    stage_entered_at = now() - interval '5 days',
    created_at = now() - interval '5 days'
  where id = (select a.id from hr.application a join hr.candidate c on c.id = a.candidate_id
              where c.email = 'six@example.test');

  insert into hr.candidate (full_name, email, city, consent_at)
  values ('[Applicant name]','nine@example.test','Nairobi', now())
  on conflict (lower(email)) do nothing;

  perform hr.rpc_apply(jsonb_build_object(
    'job_slug','concierge-agent-night','full_name','[Applicant name]',
    'email','nine@example.test','city','Nairobi','src','brightermonday',
    'answers', jsonb_build_object(
      v_q_nights::text,'no', v_q_lang::text,'yes', v_q_years::text,'1', v_q_pms::text,'no')));

  /* One rejection, with its reason — so the console can show what
     "100% rejected with feedback" actually looks like. */
  update hr.application set
    stage = 'rejected',
    rejected_at = now() - interval '2 days',
    rejected_reason_code = 'nights',
    rejected_reason_text = 'This role is all night shifts and from your answers those would not work for you.',
    rejected_by = v_hm
  where id = (select a.id from hr.application a join hr.candidate c on c.id = a.candidate_id
              where c.email = 'eight@example.test');

  /* And a few applications against the other roles, so the Jobs table
     is not one busy row and eight empty ones. */
  for r in
    select * from (values
      ('dispatch-rider-ops-lead','d1@example.test','Nairobi'),
      ('dispatch-rider-ops-lead','d2@example.test','Nairobi'),
      ('senior-fullstack-engineer','e1@example.test','Nairobi'),
      ('senior-fullstack-engineer','e2@example.test','Remote'),
      ('mobile-engineer-rider-app','m1@example.test','Remote'),
      ('hotel-airbnb-partnerships','p1@example.test','Nairobi'),
      ('city-operations-manager','c1@example.test','Mombasa'),
      ('general-application','g1@example.test','Nairobi')
    ) as t(slug, email, city)
  loop
    perform hr.rpc_apply(jsonb_build_object(
      'job_slug', r.slug, 'full_name','[Applicant name]', 'email', r.email, 'city', r.city,
      'src','careers_page', 'answers','{}'::jsonb));
  end loop;
end;
$$;

-- Sample jobs for the /careers board, for local development only. Never run
-- this in production: these are not real vacancies.
--
-- They go to the first live merchants the other seeds made (demo workspaces
-- aside), in each merchant's own city, so the board, the search filters and
-- a business's Hiring page all have something to show.

do $seed$
declare
  v_merchants uuid[];
  v_count integer;
begin
  select array_agg(id order by rank) into v_merchants
  from (
    select m.id, row_number() over (order by m.went_live_at nulls last, m.id) as rank
    from public.merchant m
    join public.city c on c.id = m.city_id and c.status in ('live', 'soft_launch')
    where m.status = 'live' and m.deleted_at is null and m.trading_name not like '[Demo]%'
    limit 4
  ) s;

  if v_merchants is null then
    raise notice 'No live merchant to post the sample jobs for.';
    return;
  end if;
  v_count := array_length(v_merchants, 1);

  insert into public.vacancy (
    merchant_id, title, category, job_type, city_id, area, openings,
    salary_min, salary_max, salary_period, description, requirements,
    status, posted_at, closes_on
  )
  select
    v_merchants[1 + (j.n % v_count)], j.title, j.category, j.job_type, m.city_id, j.area, j.openings,
    j.salary_min, j.salary_max, j.salary_period, j.description, j.requirements,
    'open', now() - (j.n || ' days')::interval, current_date + 30
  from (values
    (0, 'Front Office Receptionist', 'hospitality', 'full_time', 'Westlands', 1, 45000, 60000, 'month',
     'Welcome guests, check them in and out, and answer calls and messages at the front desk. You keep the arrivals board right and hand over cleanly to the next shift.',
     'A year at a front desk or in customer service. Clear spoken English and Swahili. Comfortable with a booking system.'),
    (1, 'Chef de Partie', 'food_beverage', 'full_time', 'Kilimani', 1, 70000, 90000, 'month',
     'Run the grill section through lunch and dinner service, prepare your mise en place and keep your station to the kitchen''s standard.',
     'Three years in a busy kitchen, one of them running a section. A food handler''s certificate.'),
    (2, 'Housekeeping Attendant', 'cleaning', 'part_time', 'Lavington', 3, 1200, 1500, 'shift',
     'Clean and set up rooms between guests, restock amenities and report anything that needs fixing.',
     null),
    (3, 'Weekend Barista', 'food_beverage', 'part_time', 'Westlands', 2, 1000, 1300, 'shift',
     'Pull espresso, steam milk and keep the counter moving on Saturday and Sunday mornings.',
     'Some time behind a coffee machine. We train the rest.'),
    (4, 'Delivery Dispatcher', 'logistics', 'full_time', 'Industrial Area', 1, 35000, 45000, 'month',
     'Assign orders to riders, watch the live map and keep customers posted when something runs late.',
     'Good with a phone and a map. Calm when three things go wrong at once.'),
    (5, 'Maintenance Technician', 'maintenance', 'temporary', 'Karen', 1, 2500, 3500, 'day',
     'Fix plumbing, electrics and fittings across the property for a three-month refurbishment.',
     'A trade certificate in plumbing or electrical work.'),
    (6, 'Event Waiters', 'food_beverage', 'gig', 'CBD', 10, 1500, null, 'shift',
     'Serve guests at evening events. Pick the shifts that suit you.',
     'Black trousers and closed shoes. Experience serving at events helps.'),
    (7, 'Hospitality Management Intern', 'hospitality', 'internship', 'Upper Hill', 2, 15000, null, 'month',
     'Six months across the front desk, housekeeping and the restaurant, with a mentor in each.',
     'Studying hospitality or tourism, or finished within the last year.'),
    (8, 'Property Caretaker', 'property', 'full_time', 'Kileleshwa', 1, 25000, 30000, 'month',
     'Look after a block of serviced apartments: keys, deliveries, small repairs and the guests'' questions.',
     null),
    (9, 'Office Administrator', 'office_admin', 'full_time', 'Upper Hill', 1, null, null, null,
     'Keep the office running: suppliers, invoices, the diary and the filing.',
     'Two years in an office role. Good with spreadsheets.')
  ) as j (n, title, category, job_type, area, openings, salary_min, salary_max, salary_period,
          description, requirements)
  join public.merchant m on m.id = v_merchants[1 + (j.n % v_count)]
  where not exists (select 1 from public.vacancy v
                    where v.merchant_id = m.id and v.title = j.title);
end
$seed$;

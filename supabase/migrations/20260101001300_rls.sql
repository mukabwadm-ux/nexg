-- Row-level security — spec section 3.4.
--
-- Every table below denies by default; each policy adds back exactly one
-- audience. The tests in supabase/tests cover both the allowed and the denied
-- case for every policy here.

alter table public.city enable row level security;
alter table public.waitlist_signup enable row level security;
alter table public.rider enable row level security;
alter table public.merchant enable row level security;
alter table public.merchant_branch enable row level security;
alter table public.merchant_user enable row level security;
alter table public.document enable row level security;
alter table public.document_requirement enable row level security;
alter table public.staff_user enable row level security;
alter table public.role enable row level security;
alter table public.role_grant enable row level security;
alter table public.setting enable row level security;

-- --------------------------------------------------------------------- city
-- Cities are public: the homepage lists them before anyone signs in.

create policy city_read_all on public.city
  for select to anon, authenticated using (true);

create policy city_write_super_admin on public.city
  for all to authenticated
  using (authz.is_super_admin())
  with check (authz.is_super_admin());

-- --------------------------------------------------------- document_requirement
-- Applicants must see what they are being asked for.

create policy document_requirement_read_all on public.document_requirement
  for select to anon, authenticated using (true);

create policy document_requirement_write_super_admin on public.document_requirement
  for all to authenticated
  using (authz.is_super_admin())
  with check (authz.is_super_admin());

-- ---------------------------------------------------------- waitlist_signup
-- Anyone may join; only staff may read the list back.

create policy waitlist_signup_insert_anyone on public.waitlist_signup
  for insert to anon, authenticated with check (true);

create policy waitlist_signup_read_staff on public.waitlist_signup
  for select to authenticated
  using (authz.has_role('growth') or authz.is_super_admin());

-- -------------------------------------------------------------------- rider
-- The rider sees and edits their own row while the application is open;
-- rider_ops and super_admin see and edit every rider in their cities.

create policy rider_read_own on public.rider
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy rider_read_staff on public.rider
  for select to authenticated
  using (authz.can_manage_riders(city_id));

create policy rider_insert_own on public.rider
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Editable only while the application is still in flight (section 3.4).
create policy rider_update_own_while_applying on public.rider
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and status in ('applied', 'documents_pending', 'under_review')
  )
  with check (
    user_id = (select auth.uid())
    and status in ('applied', 'documents_pending', 'under_review')
  );

create policy rider_update_staff on public.rider
  for update to authenticated
  using (authz.can_manage_riders(city_id))
  with check (authz.can_manage_riders(city_id));

-- ----------------------------------------------------------------- merchant

create policy merchant_read_own on public.merchant
  for select to authenticated
  using (authz.is_merchant_member(id));

create policy merchant_read_staff on public.merchant
  for select to authenticated
  using (authz.can_manage_merchants(city_id));

create policy merchant_insert_authenticated on public.merchant
  for insert to authenticated with check (true);

create policy merchant_update_own_while_applying on public.merchant
  for update to authenticated
  using (
    authz.is_merchant_member(id)
    and status in ('applied', 'documents_pending', 'under_review')
  )
  with check (
    authz.is_merchant_member(id)
    and status in ('applied', 'documents_pending', 'under_review')
  );

create policy merchant_update_staff on public.merchant
  for update to authenticated
  using (authz.can_manage_merchants(city_id))
  with check (authz.can_manage_merchants(city_id));

-- ---------------------------------------------------------- merchant_branch

create policy merchant_branch_read_own on public.merchant_branch
  for select to authenticated
  using (authz.is_merchant_member(merchant_id));

create policy merchant_branch_read_staff on public.merchant_branch
  for select to authenticated
  using (
    exists (
      select 1 from public.merchant m
      where m.id = merchant_branch.merchant_id
        and authz.can_manage_merchants(m.city_id)
    )
  );

create policy merchant_branch_write_own on public.merchant_branch
  for all to authenticated
  using (authz.is_merchant_member(merchant_id))
  with check (authz.is_merchant_member(merchant_id));

create policy merchant_branch_write_staff on public.merchant_branch
  for all to authenticated
  using (
    exists (
      select 1 from public.merchant m
      where m.id = merchant_branch.merchant_id
        and authz.can_manage_merchants(m.city_id)
    )
  )
  with check (
    exists (
      select 1 from public.merchant m
      where m.id = merchant_branch.merchant_id
        and authz.can_manage_merchants(m.city_id)
    )
  );

-- ------------------------------------------------------------ merchant_user

create policy merchant_user_read_own on public.merchant_user
  for select to authenticated
  using (user_id = (select auth.uid()) or authz.is_merchant_member(merchant_id));

create policy merchant_user_read_staff on public.merchant_user
  for select to authenticated
  using (
    exists (
      select 1 from public.merchant m
      where m.id = merchant_user.merchant_id
        and authz.can_manage_merchants(m.city_id)
    )
  );

-- The first row is the owner creating their own membership during signup.
create policy merchant_user_insert_self on public.merchant_user
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ----------------------------------------------------------------- document
-- The owner uploads and reads their own; only staff may judge them.

create policy document_read_own on public.document
  for select to authenticated
  using (
    (owner_type = 'rider' and exists (
      select 1 from public.rider r where r.id = document.owner_id and r.user_id = (select auth.uid())
    ))
    or (owner_type = 'merchant' and authz.is_merchant_member(owner_id))
  );

create policy document_read_staff on public.document
  for select to authenticated
  using ((select allowed from authz.document_review_scope(document)));

create policy document_insert_own on public.document
  for insert to authenticated
  with check (
    (owner_type = 'rider' and exists (
      select 1 from public.rider r where r.id = document.owner_id and r.user_id = (select auth.uid())
    ))
    or (owner_type = 'merchant' and authz.is_merchant_member(owner_id))
  );

/*
 * Staff update documents through rpc_document_verify and rpc_document_reject,
 * which are SECURITY DEFINER and bypass this policy. The policy exists so that
 * a direct UPDATE from a staff session is still scoped to their cities, and so
 * that an owner can never set status, reviewed_by or rejection_reason.
 */
create policy document_update_staff on public.document
  for update to authenticated
  using ((select allowed from authz.document_review_scope(document)))
  with check ((select allowed from authz.document_review_scope(document)));

-- --------------------------------------------------------------- staff_user

create policy staff_user_read_self on public.staff_user
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy staff_user_read_staff on public.staff_user
  for select to authenticated
  using (authz.staff_id() is not null);

create policy staff_user_write_super_admin on public.staff_user
  for all to authenticated
  using (authz.is_super_admin())
  with check (authz.is_super_admin());

-- --------------------------------------------------------------------- role

create policy role_read_staff on public.role
  for select to authenticated
  using (authz.staff_id() is not null);

-- --------------------------------------------------------------- role_grant
-- Section 3.4: only super_admin may grant. The second-approver rule for
-- finance and super_admin grants is enforced by trigger in migration 000400.

create policy role_grant_read_own on public.role_grant
  for select to authenticated
  using (staff_user_id = authz.staff_id());

create policy role_grant_read_super_admin on public.role_grant
  for select to authenticated
  using (authz.is_super_admin());

create policy role_grant_insert_super_admin on public.role_grant
  for insert to authenticated
  with check (authz.is_super_admin());

create policy role_grant_update_super_admin on public.role_grant
  for update to authenticated
  using (authz.is_super_admin())
  with check (authz.is_super_admin());

-- ------------------------------------------------------------------ setting
-- Settings are readable by anyone: the homepage renders commission as [—]
-- until a value exists, and needs to read the row to know that.

create policy setting_read_all on public.setting
  for select to anon, authenticated using (true);

create policy setting_write_super_admin on public.setting
  for all to authenticated
  using (authz.is_super_admin())
  with check (authz.is_super_admin());

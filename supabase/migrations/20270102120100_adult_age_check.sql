-- Every Adult Section specialty asks how the merchant checks a customer's age.
--
-- The master category list (20261226000200) built each new specialty from a
-- base profile. Four Adult Section specialties reuse non-adult profiles
-- (recreation, travel packages, workshops), so they lost the age-check
-- question: Couples' Experiences, Romantic Getaways, Intimacy & Relationship
-- Education and Adult Lifestyle Experiences. The owner wants all six Adult
-- Section specialties to ask it (17 Nov 2026).
--
-- 1. category_config: age_gate_method leads the setup fields of every
--    adults_only specialty that lacks it. The onboarding form asks these
--    fields, and business basics are not complete until they are answered.
-- 2. merchant_application_registry nexg-booking-2026-11-16.1, the revision the
--    apps send: those specialties may answer it, since every submitted answer
--    is checked against this list. Adding an allowed question keeps every
--    earlier capture valid, so the revision itself is unchanged.
--
-- No merchant or application is in those four specialties yet (17 Nov 2026).
-- scripts/categories/build.mjs applies the same rule on its next run.
-- Idempotent: safe to run more than once.

-- 1. The setup fields.
update public.category_config cc
   set subcategories = (
         select jsonb_agg(
                  case
                    when coalesce(e.value -> 'fields', '[]'::jsonb) ? 'age_gate_method' then e.value
                    else jsonb_set(e.value, '{fields}',
                           '["age_gate_method"]'::jsonb || coalesce(e.value -> 'fields', '[]'::jsonb),
                           true)
                  end
                  order by e.ordinality)
           from jsonb_array_elements(cc.subcategories) with ordinality e(value, ordinality)),
       updated_at = now()
 where cc.category = 'adults_only'
   and jsonb_typeof(cc.subcategories) = 'array'
   and exists (
         select 1 from jsonb_array_elements(cc.subcategories) e(value)
          where not coalesce(e.value -> 'fields', '[]'::jsonb) ? 'age_gate_method');

-- 2. The application registry: the same specialties may answer it.
update public.merchant_application_registry r
   set profile_questions = r.profile_questions || (
         select jsonb_object_agg(
                  s.id,
                  (select jsonb_agg(x order by x)
                     from (select jsonb_array_elements_text(r.profile_questions -> s.id)
                           union
                           select 'age_gate_method') q(x)))
           from jsonb_array_elements_text(r.taxonomy -> 'adults_only') s(id)
          where jsonb_typeof(r.profile_questions -> s.id) = 'array'
            and not (r.profile_questions -> s.id) ? 'age_gate_method')
 where r.revision = 'nexg-booking-2026-11-16.1'
   and r.question_schemas ? 'age_gate_method'
   and exists (
         select 1 from jsonb_array_elements_text(r.taxonomy -> 'adults_only') s(id)
          where jsonb_typeof(r.profile_questions -> s.id) = 'array'
            and not (r.profile_questions -> s.id) ? 'age_gate_method');

do $$
begin
  if exists (
    select 1
      from public.category_config cc, jsonb_array_elements(cc.subcategories) e(value)
     where cc.category = 'adults_only'
       and not coalesce(e.value -> 'fields', '[]'::jsonb) ? 'age_gate_method'
  ) then
    raise exception 'An Adult Section specialty still has no age-check question.';
  end if;
  if exists (
    select 1
      from public.merchant_application_registry r,
           jsonb_array_elements_text(r.taxonomy -> 'adults_only') s(id)
     where r.revision = 'nexg-booking-2026-11-16.1'
       and jsonb_typeof(r.profile_questions -> s.id) = 'array'
       and not (r.profile_questions -> s.id) ? 'age_gate_method'
  ) then
    raise exception 'An Adult Section specialty still cannot answer the age-check question in an application.';
  end if;
end $$;

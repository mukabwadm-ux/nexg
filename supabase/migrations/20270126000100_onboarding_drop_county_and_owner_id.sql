-- The onboarding details no longer ask for the county of operation or the
-- owner's national ID / passport number (owner's request, 20 Nov 2026).
--
-- Both were common fields from the template (20270110410100), required for
-- every category. Deleting the field rows is enough: the form, the save and
-- read RPCs and fn_merchant_onboarding_missing (so going live, 20270124000100)
-- all work from merchant_onboarding_field. In production no merchant had
-- answered either field and no other field depends on them. The owner's ID
-- copy is still asked for as a document.
--
-- Rollback: re-insert the two rows from 20270110410100 (county with the 47
-- counties as options).

delete from public.merchant_onboarding_field where key in ('county', 'owner_id_number');

/* Any stray stored answer for them is dropped too, so it can never surface. */
update public.merchant_onboarding_answer
set answers = answers - 'county' - 'owner_id_number'
where answers ?| array['county', 'owner_id_number'];

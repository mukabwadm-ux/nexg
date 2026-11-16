-- Merchants no longer upload an owner ID or a KRA PIN certificate
-- (owner, 15 Nov 2026: there is no need to have them in the documents step).
--
-- Everything that asks a merchant for paperwork reads fn_merchant_required_docs,
-- and it returns only required rows. So this one change takes both documents
-- out of the documents step, the setup drawer, /merchant/documents, the
-- readiness count and the go-live checks together. Not essential either, so
-- staff lists that count essentials leave them out too.
--
-- The rows stay. Documents already on file point at them (document.requirement_id
-- is on delete restrict), and staff can still open what was sent. Experience
-- partners and hosts keep their own requirements; only merchants change.

update public.document_requirement
set required = false,
    essential = false
where owner_type = 'merchant'
  and kind in ('owner_id', 'kra_pin');

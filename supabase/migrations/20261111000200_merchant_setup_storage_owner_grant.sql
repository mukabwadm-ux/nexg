-- The document and offering media storage policies evaluate this owner check
-- as the signed-in caller. The helper checks the caller's own user ID.
grant execute on function authz.merchant_application_owner(uuid) to authenticated;

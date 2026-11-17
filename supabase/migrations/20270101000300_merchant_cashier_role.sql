-- A team member can be a cashier.
--
-- The team screen and rpc_merchant_invite_member (20260101020100) offer
-- three roles, owner, manager and cashier, and merchant_invite.role allows
-- all three. merchant_user.role is merchant_user_role, which only ever had
-- owner and manager, so a cashier could never be saved on the team.
--
-- On its own because a new enum value cannot be used in the transaction
-- that adds it.
--
-- Rollback: Postgres cannot drop an enum value. Move any cashier to
-- manager; the value then sits unused.

alter type public.merchant_user_role add value if not exists 'cashier';

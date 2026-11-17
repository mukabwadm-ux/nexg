-- NexG's signing details: the newest version is the one in use.
--
-- merchant_agreement_signer (20270103000100) dated each version with now(),
-- the start of its transaction, so two versions saved in one transaction
-- (a script, a test) tied and either could read as current. Each version now
-- takes the moment it is written. Rows already saved keep their time.

alter table public.merchant_agreement_signer
  alter column created_at set default clock_timestamp();

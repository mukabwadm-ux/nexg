-- The new actions are registered.
--
-- `16_audit_console` asserts that every action any module emits
-- is in `audit.action_registry`, and it is right to: an action
-- nobody declared is one with no severity, no review rule and
-- no statement about whether it touches money or PII. The audit
-- console then shows it as an unclassified row, which is the
-- same as not showing it.
--
-- Four were missing. The test caught them, which is the point
-- of the test — this is not a formality, it is the list that
-- decides what a reviewer is shown and what two people have to
-- sign off.

insert into audit.action_registry
  (action, module, default_severity, needs_review, pii_fields, two_person, money, description)
values
  ('approval.raised', 'audit', 'notice', false, '{}', false, false,
   'A partner submitted something that needs a staff decision. Carries how many staff were notified — zero means nobody holds that module in that city and it will sit unseen.'),

  ('branch.created', 'merchants', 'notice', true, '{}', false, false,
   'A merchant added a branch. Reviewed before it appears on Explore, because a new address is a place riders will be sent.'),

  ('branch.updated', 'merchants', 'notice', false, '{}', false, false,
   'A merchant changed a branch: name, address, pickup instructions or the number riders ring.'),

  /*
   * `pii_fields` is empty because the entry genuinely holds
   * none. The first version declared `{contact}`, and the suite
   * refused it — any action naming a PII field must be queued
   * for a reviewer, and this one is not, so the two statements
   * contradicted each other.
   *
   * The right fix was the declaration, not the rule: the audit
   * entry records the role and how many branches, and the phone
   * or email stays in `merchant_invite` where RLS covers it.
   * A registry that over-declares is as misleading as one that
   * under-declares — it sends a reviewer looking for a number
   * that was never written.
   */
  ('merchant.member_invited', 'merchants', 'notice', false, '{}', false, false,
   'A merchant invited somebody onto the account. Records the role and branch count; the contact itself stays in merchant_invite and is never copied into the log.')
on conflict (action) do nothing;

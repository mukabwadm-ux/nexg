-- What a partner has to produce before they go live.
--
-- Reference data, so a migration rather than a seed: production needs
-- these the day the first operator applies, and rpc_partner_go_live
-- counts the essential ones.
--
-- `applies_when` keys off the partner's `kind`, the same way the merchant
-- requirements key off category and the rider ones off vehicle. A venue
-- is not asked for a PSV licence and a driver is not asked for a tour
-- operator's — asking for documents somebody cannot have is how an
-- onboarding stalls with nobody quite knowing why.

insert into public.document_requirement
  (owner_type, kind, label, help_text, why_text, has_expiry, required, essential,
   applies_when, sort)
values
  ('experience_partner', 'business_permit',
   'Business permit',
   'The county permit for the business, current year.',
   'It is what lets us pay you as a business rather than a person',
   true, true, true, '{}'::jsonb, 10),

  ('experience_partner', 'owner_id',
   'Owner''s ID',
   'Both sides of the national ID of whoever owns the business.',
   'So we know who we are contracting with',
   false, true, true, '{}'::jsonb, 20),

  ('experience_partner', 'kra_pin',
   'KRA PIN certificate',
   'The PIN certificate in the business''s name.',
   'Required before we can settle money to you',
   false, true, true, '{}'::jsonb, 30),

  ('experience_partner', 'tour_operator_licence',
   'Tour operator licence',
   'Your current TRA licence.',
   'Guests are being driven into a national park on it',
   true, true, true, '{"kind": ["operator"]}'::jsonb, 40),

  ('experience_partner', 'psv_licence',
   'PSV licence',
   'The public service vehicle licence for the cars you will send.',
   'Carrying paying passengers without one is uninsured',
   true, true, true, '{"kind": ["driver"]}'::jsonb, 50),

  ('experience_partner', 'fleet_insurance',
   'Passenger insurance',
   'Cover for the vehicles and the people in them.',
   'A guest in one of your cars is covered by this and nothing else',
   true, true, true, '{"kind": ["driver"]}'::jsonb, 60),

  ('experience_partner', 'premises_photo',
   'A photo of the place',
   'One clear photo of the venue or premises.',
   'It goes nowhere public — it is how we know the address is real',
   false, false, false, '{"kind": ["venue", "host"]}'::jsonb, 70)
on conflict do nothing;

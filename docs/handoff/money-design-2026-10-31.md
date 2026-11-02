# Money plan and three concepts,31 October2026

Design only. No application/backend/Supabase/auth/onboarding/provider changes in this Money task. No money, notification or document issuance was performed. No commit or push.

The complete plan is docs/merchant-portal-plan/money-concept/README.md. It extends MO01–MO22 with adaptive customer balances, security, independent money states and MC01–MC24 acceptance. The source contract and local frontend delivery sequence are in frontend-and-source-contract.md.

Generated mappings cover128 subcategories,21 parents,193 eligible model bindings,15 models and18 editor variants. Seven existing Finance owner measures are referenced;20 proposed definitions are clearly marked unregistered/non-runtime. Candidates and financial authority are gated independently. Onboarding integration stays last; future categories can reuse registered descriptors without separate pages.

Critical reconciliations: current table reservations use WF_SPACE_RESERVATION_V1 rather than legacy appointment activation; merchant customer receivables are distinct from admin partner amounts owed to NEXG; security needs a new owner contract; refund outcome unknown never clears the obligation; a posted charge allocation rather than approval reduces security. Descriptor metric lists are eligible priorities, not permanent unavailable cards.

Three built-in image_gen pictures are saved in money-concept/images:

1.01-sales-settlement.png. Posted sales200k, refunds10k, fees8k and period payable182k. Separate opening20k plus current182k minus confirmed payout150k and reserve22k gives current eligibility30k.
2.02-rental-security.png. Same zero-opening six-deposit cohort:100k collected minus34k confirmed refunds minus2k owner-confirmed posted allocation leaves64k recorded obligation. An18k refund is uncertain and stays inside that balance.
3.03-workshop-balances.png. Same six invoices180k minus credits10k and applied payments120k gives50k customer debt;12k is overdue. Separate unapplied customer credit6k and unaccepted quote15k are excluded.

All three images were visually inspected for amounts, states, table rows, actions and single-screen composition. Exact prompts, original output paths, copied-file hashes and sizes are recorded. Thirty design checks pass for coverage, references, owner definitions, future-category rejection and independent fixture arithmetic. This is not UI interaction, live financial or accessibility acceptance.

Source hashes are in source-manifest.json. Regenerate derived design files with generate-plan.mjs and verify with verify-plan.mjs. Do not register these proposed metrics as runtime Finance facts without their owner contracts.

Reservation clarification: use reservation-money-policy.md/json. Components can coexist across applicable categories. Separate booking fees, credited advances, conditional cancellation/no-show charges and independent refundable guarantees are distinct. No applicable policy means no invented charges or irrelevant module. Missing terms differ from accepted non-refundable terms. Existing receipts remain visible, and unknown outcomes block duplicate refund/alternative credit for the same funds. Four independent arithmetic checks cover the amendment. No application or onboarding changes.

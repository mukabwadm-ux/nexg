# Finance

Written for: an engineer picking this module up, and a finance lead who needs to know what the screens can and cannot be trusted to say.

The standard this module sets for itself comes from its own prompt: *a bug here is money lost, a partner unpaid, or a tax filing wrong.* Everything below follows from treating that literally.

---

## The shape of it

```
ledger.*            every shilling that has moved, append-only
   ↓   (triggers, never a call somebody has to remember)
public.fin_*        projections — what the screens read
   ↓
/finance/*          Office finance · Transactions · Settlements & payouts ·
                    Reconciliations · Invoices · Reports
```

Since November 2026 the screens have their own addresses (the old `/finance?tab=` links redirect):

| Screen | Reads |
| --- | --- |
| `/finance/office` | `fin_office_expense`, `fin_office_budget` (office spending, two-person approval) |
| `/finance/transactions` | `rpc_finance_transactions` / `rpc_finance_transaction_summary`: payments, refunds, B2C payouts, settlement lines, office expenses in one shape |
| `/finance/settlements` | `fin_settlement_run` and its lines, `fin_party_owed`, `fin_calendar_entry`; "Build payout run" calls `rpc_settlement_build` |
| `/finance/reconciliation` | `fin_provider_recon_v`, `fin_clearing_aging_v`, `fin_webhook_gap_v`, `fin_invariant_v`, `fin_run_line_v.verifies` |
| `/finance/invoices` | `rpc_finance_invoices` (host invoices, hotel and merchant statements, in cents) and `tax_invoice` |
| `/finance/reports` | the above for the headline figures; Financial (the old Overview), Fees, Tax and Exports tabs |
| `/finance/fraud` | `rpc_fraud_overview`: the fraud flag queue (`fraud_signal`), the checks (`fraud_rule`) and the last run (`fraud_check_state`) |

The `rpc_finance_*` readers count operational records (a payment, a refund, a settlement line), not ledger balances; balances still come only from the ledger and its projections.

Three rules hold the whole thing together.

**The ledger is the only place a balance lives.** Not `order.total_cents`, not a running total on a merchant row. Those columns still exist and still describe the order; they are not money that has moved. When two of them disagree there is no answer to which is right, only two numbers — which is the situation the ledger exists to end.

**Screens read projections, never sums.** No route handler totals entries while somebody waits. Partly speed, mostly so there is one answer: an Overview that totals revenue one way and a settlement run that totals it another leaves both suspect.

**Every figure can be taken back to the ledger.** That is the Verify button, and the next section is about what it does and does not prove.

---

## What Verify actually establishes

It re-derives the Overview figures from the ledger at request time and shows both numbers side by side. The builder and the verifier share one implementation of the arithmetic, deliberately — two implementations drift, and then neither can be trusted.

So it proves:

- the stored row still matches the ledger
- nothing was written into a projection by hand
- the rebuild is not silently failing
- no entries have landed since it ran

It does **not** prove the arithmetic is right. Nothing re-run from the same definition could. The arithmetic is held right by the tests and by the ledger balancing to zero. The button says so rather than implying otherwise.

It distinguishes three answers, because they need different responses:

| It says | What to do |
|---|---|
| *the same, to the shilling* | Nothing. |
| *behind by N entries, not wrong* | Nothing — it catches up within two minutes. |
| *disagree and no new entries explain it* | Stop. Do not act on these figures. |

Capped at 92 days: the one request-time computation in Finance must not be turnable into a slow one.

---

## The nine invariants

Nine named questions in `public.fin_invariant`, run every five minutes by `cron_finance_invariants`. One table rather than nine functions, so the set is visible — nine functions scattered across a schema is nine things somebody can quietly stop calling.

They gate payouts. A run cannot generate files while a question is unanswered, **and a monitor that has not run counts as unanswered**. That last part is the whole point: a check that cannot run is not a check that passed.

Switching them on found four orders that had taken money and left no ledger trace. That is what `fn_ledger_backfill` is for, and it is idempotent, so running it again is safe.

---

## Fraud checks

Since 2027-01-05 (`20270105000100_fraud_checks.sql`), `fraud_signal` has been one queue for flags about riders, customers, staff, payments and office expenses. `fn_fraud_sweep` runs every five minutes (pg_cron `fraud-checks`), and also when someone presses **Run checks now**. Each finding is raised once (`dedupe_key`).

The checks:

- **Payments:** one M-Pesa code on two records; a typed M-Pesa code that is not one; a cash order confirmed delivered by staff.
- **Riders:** delivered within minutes of pickup; delivered but never paid; moved off jobs after accepting them; one phone on two accounts.
  - Two more run from triggers: a GPS jump, and delivered far from the pin. Both wait for the rider app to send positions.
  - The plate photo check is applied by hand.
- **Customers:** many refunds; cash orders turned away after pickup (also kept in `guest.refusal_count`).
- **Office expenses:** the same receipt twice; the same payee and amount within days; approved by whoever recorded it.

Rules for flags:

- A flag never blocks anything by itself. A person confirms it, or dismisses it with a reason.
- Full Finance reviews every flag. Rider ops review flags about riders they work, and a confirmed rider flag gives that rider a 90-day strike.
- Nobody reviews a flag about themselves, or about an expense they recorded, approved or paid.
- Flags hold distances, masked phone numbers and hashes, never coordinates or device tokens.

---

## The settlement run

One door. `fn_settlement_transition` is the only thing that moves a run's state; a trigger refuses a direct `update`, and a signed-in user has no `UPDATE` grant at all. The two locks fail differently on purpose.

- Six checks must pass before a signature can be given.
- Two approvals, from two different people, checked by id.
- Approvals sign a **hash** of the run. Change the run and the signature stops counting — the screen says so in as many words.
- A ledger entry cannot be settled twice. Not "should not": `fin_settled_entry` has a primary key on `entry_id`.

Cash netting: a rider holding NexG's cash is paid the difference, and if they hold more than they earned, nothing goes out and recovery starts.

The console **cannot move a run along**. The transitions exist and are guarded; the buttons are a later pass. A control that is not wired is worse than none, because someone will plan around it.

---

## Payments on the ledger

| Payment | When | Posting |
| --- | --- | --- |
| Order | paid, or cash collected | the sale: what the merchant is owed, NexG's fees and commission net of VAT, the VAT, the rider's tip (`ledger.fn_post_sale`) |
| Featured slot | paid | all of it to `revenue.featured` (`ledger.fn_post_featured_paid`) |
| Stay | paid and confirmed | 85% to `stay.host_share:<host>`, NexG's 15% to `revenue.stay_commission` less its VAT, the VAT to `tax.vat_output` (`ledger.fn_post_stay_paid`) |
| Stay | paid after its nights went to somebody else | owed back to the guest on `refunds_pending` |
| Stay | cancelled by staff after it was paid | the host share, commission and VAT taken back into `refunds_pending` (`ledger.fn_post_stay_refund_due`) |
| Stay | refund recorded | `refunds_pending` back out of the cash account it came in on (`ledger.fn_post_stay_refunded`) |
| Rider float | — | nothing: no flow creates these payments yet, and a payment row cannot say which rider paid |

Cash is `cash.bank` for a bank collection and `cash.mpesa_paybill` otherwise.

A stay's host share is kept on `stay.host_share`, not a `payable.*` account. The weekly run pays it together with the host's referral rewards (`payable.host_credit`), on one line, to payout details in `host_payout`: hospitality staff declare them on the host's record in Hotels & Airbnb (`rpc_host_payout_declare`), and someone with full Finance other than the declarer verifies them on Settlements → Host Payouts (`rpc_host_payout_verify`). Without verified details the host's line is held (`held_kyc`), and a paused or offboarded host is held whatever their details (`held_suspended`). Unpaid host invoices are not netted off. Until a run claims it, Finance sees the share on the owed list under the host's name, and the host sees it on their statement as a stay.

What the host hears (`20270124000100_host_payout_notices`): when their run line is marked paid they get a payout receipt (stay earnings, referral rewards, the amount sent and the M-Pesa or bank reference), emailed, and the payout shows on their statement as a minus line. Nothing marks a run line paid yet, because the run's send step is not built, so this starts when it is. New payout details, and Finance verifying them, are emailed to the host, masked. A booking NexG cancels after confirming it is emailed to the host too. All of these go to `host.email`; a host without one gets none. `public.host_message` is not read by the host workspace, so nothing is sent there.

A posting never undoes a payment. The triggers log `ledger.posting_failed` (high) instead of raising, and every posting function is idempotent, so a failed one can be posted again from the SQL Editor.

---

## Projections

Six, rebuilt every two minutes by `cron_fin_rebuild`:

| Name | What it holds |
|---|---|
| `fin_kpi_daily` | gross, revenue, costs, contribution — by day and city |
| `fin_money_flow` | in by source, out by destination, same entries both sides |
| `fin_revenue_line` | each revenue account, against the same span before |
| `fin_party_owed` | standing balance per partner, excluding anything a run has claimed |
| `fin_calendar_entry` | settlement weeks, VAT, withholding, month-end close |
| `fin_decision` | what needs a person |

Each records when it was last rebuilt and the highest ledger entry it saw, so a tile can state its age instead of implying it is live. `fin_projection` holds that registry; `fin_freshness_v` rolls it into the header.

**One projection failing records its error and the rest still run** — and a stale projection puts itself on the decisions list. A rebuild that throws into a cron log is a rebuild nobody notices has stopped.

### The unattributed bucket

`fin_kpi_daily.city_id` is nullable, and that is load-bearing. Null is not "all cities"; it is money whose city could not be resolved, kept visible because a growing unattributed column is a wiring fault worth seeing.

This was first written with `primary key (day, city_id)`, which makes the column `NOT NULL` and the bucket impossible. The result was not a missing bucket — the first transaction without a city killed the entire KPI rebuild while the Overview went on showing the last good day. It is a unique index with `nulls not distinct` now, and a test asserts the column stays nullable.

---

## What is not built

Five of the seven tabs. They are shown greyed in the console rather than hidden or linked.

- **Reconciliation** — provider line import, matching tiers, exceptions, feed health
- **Fees & commissions** — rate cards and their effective-dated history
- **Invoices** — receivables, credit notes
- **Tax** — `tax_period`, `tax_line`, withholding certificates, compliance calendar
- **Exports** — daily and monthly close

Also outstanding: statement generation (PDF/CSV, hashed, immutable once sent), payout batch execution, and the transition buttons on the settlement tab.

Bank transfers are not connected. The agreed API direction is platform-account collections and payouts limited to finance-approved merchant/rider settlement balances. Provider selection is deferred; no bank-transfer endpoints, sandbox adapter, or live execution path is available. The finance approval and invariant gates must remain authoritative when provider execution is added.

Deliberately out of scope, and declared as such: Temporal workers, provider simulators, the 85% mutation gate, chaos drills, and the ten cross-surface Playwright scenarios.

---

## Operating it

```bash
# what the monitors say
select key, breaches, healthy, stale from public.fin_invariant_v order by sort;

# may money leave?
select public.fn_outbound_blocked();

# bring pre-ledger history across (idempotent)
select public.fn_ledger_backfill();

# force a projection rebuild (service_role only)
select public.fn_fin_rebuild();
```

The crons, once applied: `finance-invariants` every five minutes, `finance-projections` every two.

**Who can read any of this:** `authz.reads_ledger()` — super admin, `finance`, `finance_lead`, `accountant`. An anonymous request is refused the tables outright rather than handed an empty set, because an empty set is indistinguishable from a quiet month and would let a mistake in the grants go unnoticed.

`ledger.post` is revoked from everyone, including `authenticated`. Money is posted by trigger or by a definer function, never by a client.

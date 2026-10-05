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
/finance            Overview · Weekly settlement
```

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

## The settlement run

One door. `fn_settlement_transition` is the only thing that moves a run's state; a trigger refuses a direct `update`, and a signed-in user has no `UPDATE` grant at all. The two locks fail differently on purpose.

- Six checks must pass before a signature can be given.
- Two approvals, from two different people, checked by id.
- Approvals sign a **hash** of the run. Change the run and the signature stops counting — the screen says so in as many words.
- A ledger entry cannot be settled twice. Not "should not": `fin_settled_entry` has a primary key on `entry_id`.

Cash netting: a rider holding NexG's cash is paid the difference, and if they hold more than they earned, nothing goes out and recovery starts.

The console **cannot move a run along**. The transitions exist and are guarded; the buttons are a later pass. A control that is not wired is worse than none, because someone will plan around it.

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

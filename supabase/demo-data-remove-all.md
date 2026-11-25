# Demo data on production: inventory and removal (25 Nov 2026)

The owner asked to remove all demo data from the production database (NexgApp).
This is the read-only inventory behind `demo-data-remove-all.sql`. It was taken on
25 Nov 2026 and checked against the seed and demo scripts in this repository.

Rows were matched by how they were created, never by guessing from a name:

- the fixed ids in the scripts;
- the reserved `nexg.invalid` email domain and the `+2547000002xx` phone block;
- the seed's `demo=true` sign-in flag;
- the `[Requester]` and `is_sample` markers.

Emails and phone numbers are left out of this file on purpose, because the
repository is public.

Owner's rules and choices, 25 Nov:

- Anything whose email or phone a real person verified stays. No row below was
  verified by a person: the seed scripts stamped every "verified" date on them.
- **Demo Stays is kept** with everything on it.
- One switch, `c_remove_setup_host`, decides "Demo Stays (setting up)": `false`
  keeps it, `true` removes it.

**Deletion is permanent.** The script runs only through the release-gate session,
after the owner types yes there.

## What goes

| Kind                                    | Count                                                                                                                                      | Which                                                                                                                                                                                                                                                | Created by                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Shops (merchants)                       | 11                                                                                                                                         | Sokoni Grill House, Hifadhi Sushi & Asian, Asubuhi Coffee & Bakery, Safi Laundry & Dry Cleaning, Afya Point Pharmacy, Zamani Wine & Spirits, Ua Flowers & Gifts, Mitindo Fashion Boutique, Nyumbani Grocers, Demo Kitchen, Demo Kitchen (setting up) | `supabase/demo-data.sql` (28 Sep), `scripts/demo-partners*.sql` (8 Oct)               |
| Their branches, opening hours and menus | 11 branches, 63 hour rows, 23 menu sections, 42 items, 2 commission terms, 2 status changes, 3 baskets (3 lines)                           | children of the shops above                                                                                                                                                                                                                          | the same, and `demo-catalogue.sql`                                                    |
| Hosts                                   | 2 (+1 with the switch)                                                                                                                     | Riverine Collection and Lantern Stays (the "sample listings"); with the switch, Demo Stays (setting up)                                                                                                                                              | `supabase/seeds/stays-demo-production.sql` (1 Oct); `scripts/demo-partners-setup.sql` |
| Properties                              | 6 (+1)                                                                                                                                     | The Arbour, Brook House, Olive Cottage, Lantern Lavington, The Perch, Harvest Court; with the switch, Demo Stays Kilimani (setting up)                                                                                                               | the same                                                                              |
| Units                                   | 9 (+1)                                                                                                                                     | every unit of those properties                                                                                                                                                                                                                       | the same                                                                              |
| Host extras                             | 3 QR codes (+1), 10 QR scans                                                                                                               |                                                                                                                                                                                                                                                      | made on the sample hosts                                                              |
| Stay requests                           | 3                                                                                                                                          | ST-W3Q8NR, ST-K4M2PQ, ST-B7X9JD (requester "[Requester]"), with their 1 match                                                                                                                                                                        | `stays-demo-production.sql`                                                           |
| Riders                                  | 11                                                                                                                                         | Joseph Mutua, Alice Wambui, Dennis Ochieng, Halima Yusuf, Victor Kimani, Mary Atieno, Stephen Barasa (all invented); Demo Rider, Demo Applicant, Demo Rider, Demo New Rider                                                                          | `demo-data.sql`, `demo-partners*.sql`, `demo-accounts.sql`                            |
| Rider extras                            | 1 device; 8 document records (7 rider, 1 shop; no real files behind the 7 rider records)                                                   |                                                                                                                                                                                                                                                      | the same                                                                              |
| Sign-ins                                | 8 (+1)                                                                                                                                     | the Demo Merchant, Demo Rider, Demo Merchant Setup, Demo Rider Setup and Demo Manager logins; the 2 rider logins and the demo customer from `demo-accounts.sql`; with the switch, the Demo Host Setup login                                          | the same                                                                              |
| Test orders at the demo shops           | 9                                                                                                                                          | NX-261105-0001 to 0004, NX-261110-0005/0006, NX-261111-0007, NX-261115-0008, NX-261121-0009. None was paid and nothing was charged.                                                                                                                  | 7 by the owner's own test sign-ins, 2 by two other customer accounts                  |
| Their payments                          | 9                                                                                                                                          | M-Pesa prompts that were never paid (5 "authorised", 4 "abandoned"), with 11 events and 8 prompts                                                                                                                                                    |                                                                                       |
| Order details                           | 16 events, 9 items, 1 handoff code                                                                                                         |                                                                                                                                                                                                                                                      |                                                                                       |
| Other                                   | 1 guest profile and 1 draft plan of demo logins; 68 in-app notifications about the demo rows; identities and sessions of the demo sign-ins |                                                                                                                                                                                                                                                      |                                                                                       |

No ledger account, settlement line, host invoice or paid payment exists for any of
them; the script stops if one appears.

### Stored file (deleted in the Storage dashboard, after the SQL)

Supabase refuses direct SQL deletes from `storage.objects`, because the file itself
would stay behind. After step 2, delete this in Dashboard → Storage:

- `partner-documents`: the folder `merchant/dddddddd-1111-4000-8000-000000000001`
  (1 permit image of Demo Kitchen).

Step 3 of the script counts it: 1 before, 0 after. Demo Stays' 3 photos stay.

## What is kept

- **Demo Stays** (owner, 25 Nov): host `dddddddd-6666-…` with:

  - its sign-in;
  - the properties Demo Stays Kilimani, Tygah and Part;
  - the units A1204, B0710, Readt and Fyyygy;
  - the test stay;
  - 4 QR codes and 79 scans;
  - its guide, task and package order;
  - its 3 photos;
  - its support chat.

  Step 2 records these rows before deleting anything and stops if any changed.

- **Demo Stays (setting up)**, while the switch is `false`.
- Every real shop, host, rider, customer and staff account.
- The owner's own test accounts: the shops New Dummy Solutions and DM Dobi, and
  the owner's OTP test sign-in.
- **Wash &spin** and **BND**: two businesses that someone registered while signed
  in as a demo login (Demo Merchant, Demo Rider). They also have other members, so
  they stay; only the demo logins' membership goes. Wash &spin's ID photo, uploaded
  from the demo login, stays with Wash &spin.
- The audit log. It is a tamper-proof chain; its history of the demo rows stays.
- The `backup_20261103_premigration` schema: a copy taken before the 3 Nov
  migration that also holds old copies of 11 demo shops.
- 3 sent-message log rows about the test orders.

## Checks done (25 Nov 2026)

- **Rehearsal on a copy of production** (earlier version, which removed Demo Stays
  too):
  - Production was copied with pg_dump, read-only, into a throwaway Postgres
    container of the same Supabase image.
  - The whole script ran and committed there, and every check passed.
  - Wash &spin, BND, New Dummy Solutions and DM Dobi were unchanged.
  - A second run stopped at the first check and deleted nothing.
  - The container was then removed.
- **Rolled-back dry runs on production of this version**, about 12:00 UTC.

  - Each ran step 2 inside a block that always raises, so nothing could commit.
  - Both switch values passed every check. Demo Stays was unchanged at the end
    of both.
  - Production was unchanged afterwards.

  Counts (stay requests and notifications include real rows that stay):

  |               | before | after, switch false | after, switch true |
  | ------------- | ------ | ------------------- | ------------------ |
  | shops         | 39     | 28                  | 28                 |
  | hosts         | 16     | 14                  | 13                 |
  | properties    | 23     | 17                  | 16                 |
  | units         | 27     | 18                  | 17                 |
  | riders        | 38     | 27                  | 27                 |
  | sign-ins      | 132    | 124                 | 123                |
  | orders        | 9      | 0                   | 0                  |
  | payments      | 9      | 0                   | 0                  |
  | stays         | 1      | 1                   | 1                  |
  | stay requests | 8      | 5                   | 5                  |
  | QR scans      | 89     | 79                  | 79                 |
  | notifications | 610    | 542                 | 542                |
  | menu items    | 52     | 10                  | 10                 |
  | documents     | 131    | 123                 | 123                |

After the apply, public pages that cache Supabase reads may show the demo shops
until the Next.js data cache for /categories, /merchants, /stays and /hosts is
purged.

## Still open (owner)

1. **Demo Stays (setting up)**: keep it (switch `false`) or remove it (`true`).
2. **Stays page.** The sample listings go, so only Demo Stays' live unit is left
   on the site.
3. **Two customers' test orders.** Two of the 9 unpaid orders at fake shops were
   placed by customer accounts other than the owner's. The orders go with the shops.
4. **Wash &spin and BND** are kept. Say if they are test businesses too.
5. **The backup schema** could be dropped as a separate step; it is kept here.

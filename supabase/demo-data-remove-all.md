# Demo data on production: inventory and removal (25 Nov 2026)

The owner asked to remove all demo data from the production database (NexgApp).
This is the read-only inventory behind `demo-data-remove-all.sql`. It was taken on
25 Nov 2026 and checked against the seed and demo scripts in this repository.

Rows were matched by how they were created: the fixed ids in the scripts, the
reserved `nexg.invalid` email domain and `+2547000002xx` phone block, the seed's
`demo=true` sign-in flag, and `[Requester]` / `is_sample` markers. Nothing was
matched by guessing from a name. Emails and phone numbers are left out of this
file on purpose, because the repository is public.

**Deletion is permanent.** The script runs only through the release-gate session,
after the owner types yes there.

## What goes

| Kind                                 | Count                                                                                                                                                                       | Which                                                                                                                                                                                                                                                | Created by                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Shops (merchants)                    | 11                                                                                                                                                                          | Sokoni Grill House, Hifadhi Sushi & Asian, Asubuhi Coffee & Bakery, Safi Laundry & Dry Cleaning, Afya Point Pharmacy, Zamani Wine & Spirits, Ua Flowers & Gifts, Mitindo Fashion Boutique, Nyumbani Grocers, Demo Kitchen, Demo Kitchen (setting up) | `supabase/demo-data.sql` (28 Sep), `scripts/demo-partners*.sql` (8 Oct)          |
| Their branches, opening hours, menus | 11 branches, 63 hour rows, 23 menu sections, 42 items, 2 commission terms, 2 status changes, 3 baskets (3 lines)                                                            | children of the shops above                                                                                                                                                                                                                          | the same, and `demo-catalogue.sql`                                               |
| Hosts                                | 4                                                                                                                                                                           | Riverine Collection, Lantern Stays (the "sample listings"), Demo Stays, Demo Stays (setting up)                                                                                                                                                      | `supabase/seeds/stays-demo-production.sql` (1 Oct), `scripts/demo-partners*.sql` |
| Properties                           | 10                                                                                                                                                                          | The Arbour, Brook House, Olive Cottage, Lantern Lavington, The Perch, Harvest Court, Demo Stays Kilimani ×2, Tygah, Part                                                                                                                             | the same, plus 2 added by people testing on the Demo Stays login (9 and 24 Nov)  |
| Units                                | 14                                                                                                                                                                          | every unit of those properties (2 of them, "Readt" and "Fyyygy", were added on the Demo Stays login on 25 Nov)                                                                                                                                       | the same                                                                         |
| Host extras                          | 8 QR codes, 89 QR scans, 1 package order, 1 task, 1 unit guide (+1 version)                                                                                                 |                                                                                                                                                                                                                                                      | made on the demo hosts                                                           |
| Stay requests                        | 3                                                                                                                                                                           | ST-W3Q8NR, ST-K4M2PQ, ST-B7X9JD (requester "[Requester]") and their 1 match                                                                                                                                                                          | `stays-demo-production.sql`                                                      |
| Stays                                | 1                                                                                                                                                                           | a test booking on Demo Stays (guest "xcxcxc", 9–12 Nov, unpaid)                                                                                                                                                                                      | testing                                                                          |
| Riders                               | 11                                                                                                                                                                          | Joseph Mutua, Alice Wambui, Dennis Ochieng, Halima Yusuf, Victor Kimani, Mary Atieno, Stephen Barasa (all invented), Demo Rider, Demo Applicant, Demo Rider, Demo New Rider                                                                          | `demo-data.sql`, `demo-partners*.sql`, `demo-accounts.sql`                       |
| Rider extras                         | 1 device, 8 document records (7 rider + 1 shop, no real files behind the 7)                                                                                                 |                                                                                                                                                                                                                                                      | the same                                                                         |
| Sign-ins                             | 10                                                                                                                                                                          | the 7 Demo Merchant / Rider / Host / Manager logins from `demo-partners*`, the 2 rider logins and the demo customer from `demo-accounts.sql`                                                                                                         | the same                                                                         |
| Test orders at the demo shops        | 9                                                                                                                                                                           | NX-261105-0001 to 0004, NX-261110-0005/0006, NX-261111-0007, NX-261115-0008, NX-261121-0009: none paid, nothing charged                                                                                                                              | 7 by the owner's own test sign-ins, 2 by two other customer accounts             |
| Their payments                       | 9                                                                                                                                                                           | M-Pesa prompts that were never paid (5 "authorised", 4 "abandoned"), with 11 events and 8 prompts                                                                                                                                                    |                                                                                  |
| Order details                        | 16 events, 9 items, 1 handoff code                                                                                                                                          |                                                                                                                                                                                                                                                      |                                                                                  |
| Other                                | 1 guest profile and 1 draft plan of demo logins; 68 in-app notifications about the demo rows; push installations, preferences, identities and sessions of the demo sign-ins |                                                                                                                                                                                                                                                      |                                                                                  |

No ledger account, settlement line, host invoice or paid payment exists for any of
them; the script stops if one appears.

### Stored files (deleted in the Storage dashboard, after the SQL)

Supabase refuses direct SQL deletes from `storage.objects`, because the file itself
would stay behind. After step 2, delete these in Dashboard → Storage:

- `host-photos`: the folder `dddddddd-6666-4000-8000-000000000001` (3 photos uploaded on Demo Stays)
- `partner-documents`: the folder `merchant/dddddddd-1111-4000-8000-000000000001` (1 permit image of Demo Kitchen)

Step 3 of the script counts them: 4 before, 0 after.

## What is kept

- Every real shop, host, rider, customer and staff account.
- The owner's own test accounts: the shops New Dummy Solutions and DM Dobi, and
  the owner's OTP test sign-in.
- **Wash &spin** and **BND**: two businesses that someone registered while signed
  in as a demo login (Demo Merchant, Demo Rider). They also have other members,
  so they stay; only the demo logins' membership goes. Wash &spin's ID photo,
  uploaded from the demo login, stays with Wash &spin.
- The audit log. It is a tamper-proof chain; its history of the demo rows stays.
- One support chat with Demo Stays (1 message). Chat messages are append-only by
  design, so the thread stays, without its demo login.
- The `backup_20261103_premigration` schema: a copy taken before the 3 Nov
  migration that also holds old copies of 11 demo shops.
- 3 sent-message log rows about the test orders.

## Checks done (25 Nov 2026)

- **Rehearsal on a copy of production.** Production was copied (pg_dump, read-only)
  into a throwaway Postgres container of the same Supabase image, separate from
  every other local stack. The whole script ran and committed there: every check
  passed, step 3 showed 0 left (and the 4 stored files, as expected). Wash &spin,
  BND, New Dummy Solutions and DM Dobi were still there with their members. A
  second run stopped at the first check and deleted nothing. The container and the
  copy were then removed.
- **Rolled-back dry run on production.** Step 2 ran inside a block that always
  raises, so nothing could commit. All checks passed. Counts before → after
  (rolled back; repeated at about 09:50 UTC after a 14th unit appeared):

  |                | before | after |
  | -------------- | ------ | ----- |
  | shops          | 39     | 28    |
  | hosts          | 16     | 12    |
  | properties     | 23     | 13    |
  | units          | 27     | 13    |
  | riders         | 38     | 27    |
  | sign-ins       | 132    | 122   |
  | orders         | 9      | 0     |
  | payments       | 9      | 0     |
  | stays          | 1      | 0     |
  | stay requests  | 8      | 5     |
  | guest profiles | 5      | 4     |
  | QR scans       | 89     | 0     |
  | notifications  | 604    | 536   |
  | shop members   | 36     | 33    |
  | menu items     | 52     | 10    |
  | documents      | 131    | 123   |

  The copy gave the same "after" numbers when the script committed there.
  Production was unchanged afterwards.

After the apply, public pages that cache Supabase reads may show the demo shops
until the Next.js data cache for /categories, /merchants, /stays and /hosts is
purged.

## Please confirm (owner)

1. **Demo Stays login is in use.** It signed in on 23 Nov; a property "Part" was added on 24 Nov and two units on 25 Nov (07:58 and 09:33 UTC). The script stops, deleting nothing, if it changes again before the apply. If someone still needs it, say so and it is taken out of the script.
2. **Stays page goes empty.** The 6 sample listings (Riverine Collection, Lantern
   Stays) are the only stays shown on the site today. No real host is live yet.
3. **Two customers' test orders.** Two of the 9 unpaid orders at fake shops were
   placed by customer accounts other than the owner's. They go with the shops.
4. **Wash &spin and BND** are kept (see above). Say if they are test businesses too.
5. **The backup schema** could be dropped as a separate step; it is kept here.

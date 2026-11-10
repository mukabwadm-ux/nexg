# NexG Stays Hosts Workspace

The host frontend in Derrick NexG uses Supabase for sign-in, properties, recorded reservations, operations, finances, guides and host support. Its main route is `/host`. Earlier host bookmarks open the equivalent screen in this workspace.

## Run locally

Install the web dependencies and apply the migrations from this branch to local Supabase. Then start the app from the repository root.

```powershell
npm --prefix hosts-workspace ci
node scripts/dev-host-workspace.mjs
```

Open [Hosts Workspace](http://127.0.0.1:3010/host) and sign in as a host. Run `npm --prefix hosts-workspace run build` after editing the frontend. The web app serves that build from `apps/web/public/nexg-hosts-workspace`.

## Production

The workspace is live at `/host` on the public site. `apps/web`'s `build` script runs `scripts/build-host-workspace.mjs` before `next build`, so every Vercel deploy compiles it. The output folder is gitignored. Access is checked per request: the user must be signed in with a host account. Set `NEXG_HOST_WORKSPACE=off` in the Vercel project to take `/host` and `/api/host-workspace` offline without a deploy. New migrations under `supabase/migrations` still need to be applied to production by hand.

## Connections

- Host Inbox shares conversation records with [Admin Messaging](http://127.0.0.1:3001/messaging). Hosts can send unit-related questions to NexG Concierge.
- **Direct guest messaging is pending.** The shared booking engine needs to link the reservation to a verified guest before the guest app can open the right conversation. Scheduled guest notifications also need a delivery service.
- Calendar shows recorded stays, holds and date blocks, and stores iCal connections. Holds and blocks are kept by the database (`rpc_stay_host_hold`, `rpc_stay_block`): nothing else can take those nights. A host hold ends by itself unless the host confirms it. Automatic imports still need an iCal worker.

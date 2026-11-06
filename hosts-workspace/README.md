# NexG Stays Hosts Workspace

The host frontend in Derrick NexG uses Supabase for sign-in, properties, recorded reservations, operations, finances, guides and host support. Its main route is `/host`. Earlier host bookmarks open the equivalent screen in this workspace.

## Run locally

Install the web dependencies and apply the migrations from this branch to local Supabase. Then start the app from the repository root.

```powershell
npm --prefix hosts-workspace ci
node scripts/dev-host-workspace.mjs
```

Open [Hosts Workspace](http://127.0.0.1:3010/host) and sign in as a host. Run `npm --prefix hosts-workspace run build` after editing the frontend. The web app serves that build from `apps/web/public/nexg-hosts-workspace`.

## Connections

- Host Inbox shares conversation records with [Admin Messaging](http://127.0.0.1:3001/messaging). Hosts can send unit-related questions to NexG Concierge.
- **Direct guest messaging is pending.** The shared booking engine needs to link the reservation to a verified guest before the guest app can open the right conversation. Scheduled guest notifications also need a delivery service.
- Calendar shows recorded stays and stores iCal connections. Live availability, holds and date blocks need the shared booking engine. Automatic imports need an iCal worker.

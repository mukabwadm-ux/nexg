# NexG Stays Hosts Workspace

The host frontend in Derrick NexG uses Supabase for sign-in, properties, recorded reservations, operations, finances, guides and host support. Its main route is `/host`. Earlier host bookmarks open the equivalent screen in this workspace.

## Run locally

With the web dependencies installed and local Supabase running, start the app from the Derrick NexG root.

```powershell
npm --prefix hosts-workspace ci
node scripts/dev-host-workspace.mjs
```

Open [Hosts Workspace](http://127.0.0.1:3010/host) and sign in as a host. Run `npm --prefix hosts-workspace run build` after editing the frontend. The web app serves that build from `apps/web/public/nexg-hosts-workspace`.

## Connections

- Host Inbox shares conversation records with [Admin Messaging](http://127.0.0.1:3001/messaging). Hosts can send unit-related questions to NexG Concierge.
- Guest chat in the standalone source used its invitation service. A guest conversation in this workspace needs a verified guest and reservation link from the shared booking flow, plus the guest app connection. Scheduled guest notifications need a delivery service.
- Calendar shows recorded stays and stores iCal connections. Live availability, holds and date blocks need the shared booking engine. Automatic imports need an iCal worker.

# NexG on the VPS

Written for: whoever runs the NexG VPS.

This folder runs NexG's back-end services on one Linux server with Docker:

| Service            | What it is                                                                          | Reachable at                               |
| ------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------ |
| `booking-engine`   | The Payload booking runtime (`apps/booking-engine`)                                 | `https://<BOOKING_DOMAIN>` through Caddy   |
| `booking-db`       | PostgreSQL 16, used only by the booking engine                                      | nowhere outside the server                 |
| `discovery-engine` | The read-only Discovery service (`discovery/discovery-engine`), optional, see below | `https://<DISCOVERY_DOMAIN>` through Caddy |
| `caddy`            | HTTPS in front, with certificates from Let's Encrypt                                | ports 80 and 443                           |

The website stays on Vercel and the main database stays on Supabase. The VPS runs alongside them; nothing moves.

**Nothing in this folder holds a secret.** The secrets live in `.env` on the server, which git ignores. The repository is public: never commit `.env`, and never paste its values into chat, issues or pull requests.

## 1. Check the server

On the VPS:

```sh
cat /etc/os-release; nproc; free -h; df -h /
```

- **OS:** these steps are for Ubuntu 22.04 or 24.04, or Debian 12. For another Linux, install Docker the way [Docker's documentation](https://docs.docker.com/engine/install/) says for it, then continue from step 4.
- **Memory:** 2 GB is enough for the booking engine, its database and Caddy. The image is built by CI, not on the server, so the server never needs memory for a build. With less than 2 GB, add swap:

  ```sh
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```

- **Disk:** keep 10 GB free for images, the database and backups.

## 2. Point the domain at the server

Create a DNS **A record** for the booking engine's name, for example `booking.nexgapp.com`, with the VPS's public IP as its value. Check that it has taken effect before the first start:

```sh
getent hosts booking.nexgapp.com
```

It should print the VPS's IP. Caddy cannot get a certificate until it does.

## 3. Install Docker and open the firewall

```sh
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"    # then log out and back in
docker compose version             # should print v2.x
```

Allow SSH and HTTPS, and nothing else:

```sh
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443
sudo ufw enable
```

## 4. Get this folder onto the server

```sh
sudo git clone --depth 1 https://github.com/mukabwadm-ux/nexg.git /opt/nexg
sudo chown -R "$USER" /opt/nexg
cd /opt/nexg/deploy/vps
```

## 5. Fill in `.env`

```sh
cp .env.example .env
chmod 600 .env
openssl rand -hex 32    # run three times: BOOKING_DB_PASSWORD, PAYLOAD_SECRET, BOOKING_BRIDGE_SECRET
nano .env
```

Set `BOOKING_DOMAIN` to the name from step 2, and `ACME_EMAIL` to an address that should hear about certificates.

## 6. Let the server pull the image

CI publishes the engine to GitHub Container Registry as `ghcr.io/mukabwadm-ux/nexg-booking-engine`. Choose one of these:

- **Make the package public, once.** On GitHub, open the package's settings and change its visibility to public. It contains no secrets: the image is built from this public repository, and every secret comes from `.env` at runtime.
- **Or sign the server in.** Create a GitHub personal access token with only `read:packages`, then:

  ```sh
  docker login ghcr.io -u <your GitHub username>
  ```

  Paste the token when Docker asks for a password. It is stored on the server only.

## 7. Start

```sh
docker compose up -d
docker compose ps
```

The engine applies any pending database migrations, then starts. Give it a minute, then check:

```sh
curl -s https://booking.nexgapp.com/health
```

It should return `{"ready":true,"engine":"Payload Reserve",...}`. Every other path refuses a request that is not signed with the bridge secret.

## 8. Connect the booking clients

In the production Vercel web project, set `BOOKING_ENGINE_URL` to `https://<BOOKING_DOMAIN>` and
`BOOKING_BRIDGE_SECRET` to the booking service's matching secret. Keep both in server-only
environment variables. The bridge uses each merchant's existing Supabase UUID as its business ID.

1. Check the engine's HTTPS health and verify a signed read.
2. Redeploy the website. The portal uses the existing Bookings board while a merchant has active
   Supabase resources or outstanding reservations. Past Supabase bookings remain in
   `/merchant/bookings`.
3. Have an eligible merchant owner import setup in `/merchant/calendar` and publish the offerings.
   Verify the calendar and the public catalog for that merchant. Customer engine intake requires a
   live merchant and no active Supabase booking resources.
4. Check `/explore/<merchant-id>` and the consumer app merchant page. They link to
   `/book/<merchant-id>` once the shared public catalog has a published offering.

## Day to day

**Logs**

```sh
docker compose logs -f booking-engine
```

**Update to the newest image**

```sh
git pull && docker compose pull && docker compose up -d
```

**Hold or roll back a version:** set `BOOKING_ENGINE_TAG` in `.env` to a commit SHA that CI published, then run `docker compose up -d`.

**Back up the database**

```sh
./backup.sh
```

This writes to `/var/backups/nexg-booking` and keeps 14 days of dumps. For a nightly backup, add this with `crontab -e`:

```
0 2 * * * /opt/nexg/deploy/vps/backup.sh >> /var/log/nexg-booking-backup.log 2>&1
```

Copy backups off the server from time to time: a backup that lives only on the server is lost with it.

**Restore a backup:** this replaces the current data.

```sh
docker compose stop booking-engine
gunzip -c /var/backups/nexg-booking/booking-<date>.sql.gz | docker compose exec -T booking-db psql -U booking -d booking
docker compose start booking-engine
```

## If something is wrong

| You see                                                                                | Likely cause                                                                              |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| The browser warns about the certificate, or Caddy's log says the ACME challenge failed | DNS does not point at this server yet (step 2), or port 80 is closed                      |
| `502` from the domain                                                                  | The engine is still starting or applying migrations: `docker compose logs booking-engine` |
| `docker compose up` stops at "Set … in .env"                                           | That line in `.env` is empty                                                              |
| `pull access denied` for the engine image                                              | Step 6 is not done                                                                        |

## The discovery engine

The discovery engine (`discovery/discovery-engine`) runs as a second service with its own domain. It keeps no data of its own: it reads the website's Supabase project with the public key. It is light, a few hundred MB of memory at most. Its image is published once the engine's pull request (#128) is on `main`.

1. **DNS:** an A record for its name, for example `discovery.nexgapp.com`, pointing at the VPS. Check it with `getent hosts discovery.nexgapp.com`.
2. **`.env`:** fill in the discovery block:
   - `DISCOVERY_DOMAIN`: the name from step 1.
   - `SUPABASE_URL` and `SUPABASE_ANON_KEY`: the same public pair the website uses (Vercel's `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Never the service-role or secret key; the engine refuses one.
3. **Image:** as in step 6, make `nexg-discovery-engine` public once, or keep the server signed in.
4. **Start it:**

   ```sh
   docker compose --profile discovery up -d
   docker compose restart caddy    # picks up DISCOVERY_DOMAIN
   curl -s https://discovery.nexgapp.com/api/discovery/health
   ```

   `"readiness":"R0"` means no data source is configured: check the two Supabase lines in `.env`.

From then on, add `--profile discovery` to `pull`, `up` and `logs`, for example `docker compose --profile discovery pull && docker compose --profile discovery up -d`.

**The website does not use it yet.** `/discover` reads Supabase directly today. Pointing it at the engine is a separate change on the website: a server-side proxy route on nexgapp.com, because the engine does not accept calls from other sites, and a build setting. Typesense search is optional and needs about 2 GB more memory.

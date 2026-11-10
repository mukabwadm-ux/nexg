#!/bin/sh
# Back up the booking engine's database, keeping 14 days of dumps.
# Run it from anywhere; it works from its own folder. Nightly via cron:
#   0 2 * * * /opt/nexg/deploy/vps/backup.sh >> /var/log/nexg-booking-backup.log 2>&1
set -eu

cd "$(dirname "$0")"
dir="${BACKUP_DIR:-/var/backups/nexg-booking}"
mkdir -p "$dir"
chmod 700 "$dir"

file="$dir/booking-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose exec -T booking-db pg_dump -U booking -d booking --no-owner | gzip > "$file"
chmod 600 "$file"

find "$dir" -name 'booking-*.sql.gz' -mtime +14 -delete
echo "$(date -Is) saved $file"

#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_ENCRYPTION_KEY_FILE:?BACKUP_ENCRYPTION_KEY_FILE is required}"

if [[ ! -r "$BACKUP_ENCRYPTION_KEY_FILE" || ! -s "$BACKUP_ENCRYPTION_KEY_FILE" ]]; then
  echo "Backup encryption key file must be readable and non-empty." >&2
  exit 64
fi

backup_dir="${BACKUP_DIR:-backups}"
umask 077
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
stamp=$(date -u +"%Y%m%d-%H%M%SZ")
out_file="$backup_dir/athlemetry-${stamp}.dump.enc"
temp_dump=$(mktemp "$backup_dir/.athlemetry-${stamp}.XXXXXX.dump")
backup_complete=false

cleanup() {
  rm -f "$temp_dump"
  if [[ "$backup_complete" != "true" ]]; then
    rm -f "$out_file" "$out_file.sha256"
  fi
}
trap cleanup EXIT

parts=()
while IFS= read -r -d '' value; do parts+=("$value"); done < <(
  CONNECTION_URL="$DATABASE_URL" node -e '
    const url = new URL(process.env.CONNECTION_URL);
    const values = [url.hostname, url.port || "5432", decodeURIComponent(url.pathname.slice(1)), decodeURIComponent(url.username), decodeURIComponent(url.password)];
    process.stdout.write(values.map((value) => `${value}\0`).join(""));
  '
)
if [[ "${#parts[@]}" -ne 5 ]]; then
  echo "DATABASE_URL could not be parsed." >&2
  exit 64
fi
export PGHOST="${parts[0]}" PGPORT="${parts[1]}" PGDATABASE="${parts[2]}" PGUSER="${parts[3]}" PGPASSWORD="${parts[4]}"
pg_dump --format=custom --compress=9 --no-owner --no-acl --file="$temp_dump"
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
  -pass "file:$BACKUP_ENCRYPTION_KEY_FILE" -in "$temp_dump" -out "$out_file"
chmod 600 "$out_file"
openssl dgst -sha256 -r "$out_file" > "$out_file.sha256"
chmod 600 "$out_file.sha256"
backup_complete=true

printf 'Encrypted backup created: %s\nChecksum: %s\n' "$out_file" "$out_file.sha256"

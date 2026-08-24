#!/usr/bin/env bash
set -euo pipefail

: "${ERASURE_LEDGER_DATABASE_URL:?ERASURE_LEDGER_DATABASE_URL is required}"
: "${BACKUP_ENCRYPTION_KEY_FILE:?BACKUP_ENCRYPTION_KEY_FILE is required}"

if [[ ! -r "$BACKUP_ENCRYPTION_KEY_FILE" || ! -s "$BACKUP_ENCRYPTION_KEY_FILE" ]]; then
  echo "Backup encryption key file must be readable and non-empty." >&2
  exit 64
fi

ledger_dir="${ERASURE_LEDGER_DIR:-backups}"
umask 077
mkdir -p "$ledger_dir"
chmod 700 "$ledger_dir"
stamp=$(date -u +"%Y%m%d-%H%M%SZ")
out_file="$ledger_dir/athlemetry-erasure-ledger-${stamp}.csv.enc"
temp_ledger=$(mktemp "$ledger_dir/.athlemetry-erasure-${stamp}.XXXXXX.csv")
export_complete=false

cleanup() {
  rm -f "$temp_ledger"
  if [[ "$export_complete" != "true" ]]; then
    rm -f "$out_file" "$out_file.sha256"
  fi
}
trap cleanup EXIT

parts=()
while IFS= read -r -d '' value; do parts+=("$value"); done < <(
  CONNECTION_URL="$ERASURE_LEDGER_DATABASE_URL" node -e '
    const url = new URL(process.env.CONNECTION_URL);
    const values = [url.hostname, url.port || "5432", decodeURIComponent(url.pathname.slice(1)), decodeURIComponent(url.username), decodeURIComponent(url.password)];
    process.stdout.write(values.map((value) => `${value}\0`).join(""));
  '
)
if [[ "${#parts[@]}" -ne 5 ]]; then
  echo "ERASURE_LEDGER_DATABASE_URL could not be parsed." >&2
  exit 64
fi
export PGHOST="${parts[0]}" PGPORT="${parts[1]}" PGDATABASE="${parts[2]}" PGUSER="${parts[3]}" PGPASSWORD="${parts[4]}"
psql -X -v ON_ERROR_STOP=1 -c 'COPY (SELECT "userId", "erasedAt" FROM "ErasureTombstone" ORDER BY "erasedAt", "userId") TO STDOUT WITH (FORMAT csv)' > "$temp_ledger"

openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
  -pass "file:$BACKUP_ENCRYPTION_KEY_FILE" -in "$temp_ledger" -out "$out_file"
chmod 600 "$out_file"
openssl dgst -sha256 -r "$out_file" > "$out_file.sha256"
chmod 600 "$out_file.sha256"
export_complete=true

printf 'Encrypted erasure ledger created: %s\nChecksum: %s\n' "$out_file" "$out_file.sha256"

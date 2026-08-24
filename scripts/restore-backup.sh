#!/usr/bin/env bash
set -euo pipefail

: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"
: "${BACKUP_FILE:?BACKUP_FILE is required}"
: "${BACKUP_ENCRYPTION_KEY_FILE:?BACKUP_ENCRYPTION_KEY_FILE is required}"
: "${ERASURE_LEDGER_FILE:?ERASURE_LEDGER_FILE is required; use the latest independently retained ledger}"

if [[ "${RESTORE_CONFIRM_ISOLATED:-}" != "true" ]]; then
  echo "Set RESTORE_CONFIRM_ISOLATED=true only for a disposable isolated restore database." >&2
  exit 64
fi
if [[ -n "${DATABASE_URL:-}" && "$RESTORE_DATABASE_URL" == "$DATABASE_URL" ]]; then
  echo "Restore target must not equal the source DATABASE_URL." >&2
  exit 64
fi
if [[ ! -r "$BACKUP_FILE" || ! -s "$BACKUP_FILE" ]]; then
  echo "Encrypted backup file must be readable and non-empty." >&2
  exit 66
fi
if [[ ! -r "$BACKUP_ENCRYPTION_KEY_FILE" || ! -s "$BACKUP_ENCRYPTION_KEY_FILE" ]]; then
  echo "Backup encryption key file must be readable and non-empty." >&2
  exit 64
fi
if [[ ! -r "$ERASURE_LEDGER_FILE" || ! -s "$ERASURE_LEDGER_FILE" ]]; then
  echo "Encrypted erasure ledger must be readable and non-empty." >&2
  exit 66
fi

checksum_file="${BACKUP_CHECKSUM_FILE:-$BACKUP_FILE.sha256}"
if [[ ! -r "$checksum_file" ]]; then
  echo "Backup checksum file is required." >&2
  exit 66
fi
expected_checksum=$(cut -d ' ' -f 1 "$checksum_file")
actual_checksum=$(openssl dgst -sha256 -r "$BACKUP_FILE" | cut -d ' ' -f 1)
if [[ -z "$expected_checksum" || "$actual_checksum" != "$expected_checksum" ]]; then
  echo "Backup checksum verification failed." >&2
  exit 65
fi
ledger_checksum_file="${ERASURE_LEDGER_CHECKSUM_FILE:-$ERASURE_LEDGER_FILE.sha256}"
if [[ ! -r "$ledger_checksum_file" ]]; then
  echo "Erasure ledger checksum file is required." >&2
  exit 66
fi
expected_ledger_checksum=$(cut -d ' ' -f 1 "$ledger_checksum_file")
actual_ledger_checksum=$(openssl dgst -sha256 -r "$ERASURE_LEDGER_FILE" | cut -d ' ' -f 1)
if [[ -z "$expected_ledger_checksum" || "$actual_ledger_checksum" != "$expected_ledger_checksum" ]]; then
  echo "Erasure ledger checksum verification failed." >&2
  exit 65
fi

temp_dump=$(mktemp "${TMPDIR:-/tmp}/athlemetry-restore.XXXXXX.dump")
temp_ledger=$(mktemp "${TMPDIR:-/tmp}/athlemetry-erasure-restore.XXXXXX.csv")
cleanup() {
  rm -f "$temp_dump" "$temp_ledger"
}
trap cleanup EXIT

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -pass "file:$BACKUP_ENCRYPTION_KEY_FILE" -in "$BACKUP_FILE" -out "$temp_dump"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -pass "file:$BACKUP_ENCRYPTION_KEY_FILE" -in "$ERASURE_LEDGER_FILE" -out "$temp_ledger"

parts=()
while IFS= read -r -d '' value; do parts+=("$value"); done < <(
  CONNECTION_URL="$RESTORE_DATABASE_URL" node -e '
    const url = new URL(process.env.CONNECTION_URL);
    const values = [url.hostname, url.port || "5432", decodeURIComponent(url.pathname.slice(1)), decodeURIComponent(url.username), decodeURIComponent(url.password)];
    process.stdout.write(values.map((value) => `${value}\0`).join(""));
  '
)
if [[ "${#parts[@]}" -ne 5 ]]; then
  echo "RESTORE_DATABASE_URL could not be parsed." >&2
  exit 64
fi
export PGHOST="${parts[0]}" PGPORT="${parts[1]}" PGDATABASE="${parts[2]}" PGUSER="${parts[3]}" PGPASSWORD="${parts[4]}"
existing_tables=$(psql -X -v ON_ERROR_STOP=1 -Atqc \
  "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public'" )
if [[ "$existing_tables" != "0" ]]; then
  echo "Restore target public schema is not empty; refusing to overwrite it." >&2
  exit 64
fi

pg_restore --exit-on-error --no-owner --no-acl --dbname="$PGDATABASE" "$temp_dump"
psql -X -v ON_ERROR_STOP=1 <<SQL
BEGIN;
CREATE TEMP TABLE restore_erasure_ledger (
  "userId" TEXT PRIMARY KEY,
  "erasedAt" TIMESTAMP(3) NOT NULL
) ON COMMIT DROP;
\copy restore_erasure_ledger ("userId", "erasedAt") FROM '$temp_ledger' WITH (FORMAT csv)
UPDATE "ConsentLog"
SET "actorUserId" = NULL,
    notes = 'Action retained after actor account erasure was replayed during restore.'
WHERE "actorUserId" IN (SELECT "userId" FROM restore_erasure_ledger);
UPDATE "UserReport"
SET "reviewedById" = NULL
WHERE "reviewedById" IN (SELECT "userId" FROM restore_erasure_ledger);
UPDATE "UserReport"
SET "submissionId" = NULL
WHERE "submissionId" IN (
  SELECT id FROM "DrillSubmission"
  WHERE "athleteId" IN (SELECT "userId" FROM restore_erasure_ledger)
);
DELETE FROM "User"
WHERE id IN (SELECT "userId" FROM restore_erasure_ledger);
COMMIT;
SQL
printf 'Restore completed into isolated target with current erasure ledger replayed.\n'

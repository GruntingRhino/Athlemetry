#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

mkdir -p backups
stamp=$(date +"%Y%m%d-%H%M%S")
out_file="backups/athlemetry-${stamp}.sql"

pg_dump "$DATABASE_URL" > "$out_file"
echo "Backup created: $out_file"

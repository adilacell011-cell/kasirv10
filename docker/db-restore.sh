#!/bin/sh
# Guarded restore for a PostgreSQL plain-SQL dump compressed with gzip.
# This tool is manual-only: without --execute and an exact target approval it
# performs read-only checks and exits without running the dump SQL.
set -eu
umask 077

BACKUP=""
TARGET_HOST=""
TARGET_PORT=""
TARGET_DB=""
TARGET_SCHEMA=""
EXECUTE=0
APPROVAL=""

usage() {
  cat <<'EOF'
Usage:
  db-restore.sh --backup FILE --target-host HOST --target-port PORT \
    --target-db DB --target-schema SCHEMA [--execute --approve-target IDENTITY]

Default behavior is a read-only preflight. Execution requires:
  RESTORE_ALLOWED_HOST, RESTORE_ALLOWED_PORT, RESTORE_ALLOWED_DB,
  RESTORE_ALLOWED_SCHEMA
and --execute with:
  --approve-target "restore:HOST:PORT/DB/SCHEMA"

Connection credentials are supplied through standard libpq variables/files
(for example PGUSER plus PGPASSWORD or PGPASSFILE); their values are never logged.
EOF
}

fail() {
  printf '[restore] %s status=FAILED reason=%s\n' \
    "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$1" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --backup) [ "$#" -ge 2 ] || fail "missing_backup_path"; BACKUP=$2; shift 2 ;;
    --target-host) [ "$#" -ge 2 ] || fail "missing_target_host"; TARGET_HOST=$2; shift 2 ;;
    --target-port) [ "$#" -ge 2 ] || fail "missing_target_port"; TARGET_PORT=$2; shift 2 ;;
    --target-db) [ "$#" -ge 2 ] || fail "missing_target_database"; TARGET_DB=$2; shift 2 ;;
    --target-schema) [ "$#" -ge 2 ] || fail "missing_target_schema"; TARGET_SCHEMA=$2; shift 2 ;;
    --execute) EXECUTE=1; shift ;;
    --approve-target) [ "$#" -ge 2 ] || fail "missing_target_approval"; APPROVAL=$2; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; fail "unknown_argument" ;;
  esac
done

[ -n "$BACKUP" ] || fail "backup_path_required"
[ -f "$BACKUP" ] && [ ! -L "$BACKUP" ] && [ -s "$BACKUP" ] || fail "backup_file_missing_empty_or_symlink"
[ -n "$TARGET_HOST" ] && [ -n "$TARGET_PORT" ] && [ -n "$TARGET_DB" ] && [ -n "$TARGET_SCHEMA" ] || fail "all_target_fields_required"
[ -n "${PGUSER:-}" ] || fail "PGUSER_required"

case "$TARGET_HOST" in
  -*|*[!A-Za-z0-9._:-]*|'') fail "invalid_target_host" ;;
esac
case "$TARGET_PORT" in
  *[!0-9]*|'') fail "invalid_target_port" ;;
esac
[ "$TARGET_PORT" -ge 1 ] && [ "$TARGET_PORT" -le 65535 ] || fail "invalid_target_port"
for identifier in "$TARGET_DB" "$TARGET_SCHEMA"; do
  case "$identifier" in
    [A-Za-z_]* ) ;;
    *) fail "invalid_database_or_schema_identifier" ;;
  esac
  case "$identifier" in
    *[!A-Za-z0-9_]* ) fail "invalid_database_or_schema_identifier" ;;
  esac
done

: "${RESTORE_ALLOWED_HOST:?Set RESTORE_ALLOWED_HOST to the approved target host}"
: "${RESTORE_ALLOWED_PORT:?Set RESTORE_ALLOWED_PORT to the approved target port}"
: "${RESTORE_ALLOWED_DB:?Set RESTORE_ALLOWED_DB to the approved target database}"
: "${RESTORE_ALLOWED_SCHEMA:?Set RESTORE_ALLOWED_SCHEMA to the approved target schema}"
[ "$TARGET_HOST" = "$RESTORE_ALLOWED_HOST" ] || fail "target_host_not_approved"
[ "$TARGET_PORT" = "$RESTORE_ALLOWED_PORT" ] || fail "target_port_not_approved"
[ "$TARGET_DB" = "$RESTORE_ALLOWED_DB" ] || fail "target_database_not_approved"
[ "$TARGET_SCHEMA" = "$RESTORE_ALLOWED_SCHEMA" ] || fail "target_schema_not_approved"

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/kasirv10-restore.XXXXXX")" || fail "cannot_create_private_temp_directory"
SQL_FILE="${WORK_DIR}/dump.sql"
cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

if ! gzip -t "$BACKUP"; then
  fail "gzip_integrity_check_failed"
fi
if ! gzip -cd "$BACKUP" > "$SQL_FILE"; then
  fail "gzip_decompression_failed"
fi
[ -s "$SQL_FILE" ] || fail "decompressed_sql_is_empty"
if ! awk '
  NR <= 10 && $0 == "-- PostgreSQL database dump" { header = 1 }
  $0 == "-- PostgreSQL database dump complete" { footer = 1 }
  END { exit (header && footer) ? 0 : 1 }
' "$SQL_FILE"; then
  fail "not_a_complete_plain_postgresql_dump"
fi
if grep -Eiq '^[[:space:]]*(CREATE|DROP)[[:space:]]+DATABASE([[:space:];]|$)|^[[:space:]]*\\connect([[:space:]]|$)' "$SQL_FILE"; then
  fail "dump_contains_database_switch_or_database_creation"
fi

check_target() {
  local facts actual_db actual_port server_addr schema_exists object_count
  if ! facts="$(psql -X -w -h "$TARGET_HOST" -p "$TARGET_PORT" -U "$PGUSER" -d "$TARGET_DB" \
    -v ON_ERROR_STOP=1 -v target_schema="$TARGET_SCHEMA" -At -F '|' <<'SQL'
SELECT current_database(),
       current_setting('port'),
       COALESCE(inet_server_addr()::text, ''),
       (to_regnamespace(:'target_schema') IS NOT NULL),
       (
         (SELECT count(*) FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
            AND c.relkind IN ('r','p','v','m','S','f'))
         +
         (SELECT count(*) FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema')
         +
         (SELECT count(*) FROM pg_type t
           JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema')
         +
         (SELECT count(*) FROM pg_largeobject_metadata)
         +
         (SELECT count(*) FROM pg_namespace n
          WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
            AND n.nspname <> :'target_schema')
       );
SQL
  )"; then
    fail "target_connection_or_identity_check_failed"
  fi

  IFS='|' read -r actual_db actual_port server_addr schema_exists object_count <<EOF
$facts
EOF
  [ "$actual_db" = "$TARGET_DB" ] || fail "connected_database_does_not_match_target"
  [ "$actual_port" = "$TARGET_PORT" ] || fail "connected_port_does_not_match_target"
  [ "$schema_exists" = "t" ] || fail "target_schema_missing"
  [ "$object_count" = "0" ] || fail "target_database_not_empty"
  printf '%s' "$server_addr"
}

SERVER_ADDR="$(check_target)"
TARGET_ID="restore:${TARGET_HOST}:${TARGET_PORT}/${TARGET_DB}/${TARGET_SCHEMA}"

printf '[restore] %s status=DRY_RUN_OK target_host=%s target_port=%s target_db=%s target_schema=%s server_addr=%s archive=%s\n' \
  "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$TARGET_HOST" "$TARGET_PORT" \
  "$TARGET_DB" "$TARGET_SCHEMA" "$SERVER_ADDR" "$BACKUP"

[ "$EXECUTE" -eq 1 ] || exit 0
[ "$APPROVAL" = "$TARGET_ID" ] || fail "explicit_target_approval_required"

# Recheck identity and emptiness immediately before executing any dump SQL.
SERVER_ADDR="$(check_target)"
printf '[restore] %s status=EXECUTING target=%s server_addr=%s\n' \
  "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$TARGET_ID" "$SERVER_ADDR"

if ! psql -X -w -h "$TARGET_HOST" -p "$TARGET_PORT" -U "$PGUSER" -d "$TARGET_DB" \
  -v ON_ERROR_STOP=1 --single-transaction --file="$SQL_FILE"; then
  fail "restore_sql_failed_transaction_rolled_back"
fi

printf '[restore] %s status=SUCCESS target=%s\n' \
  "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$TARGET_ID"

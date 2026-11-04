#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_SCRIPT="$ROOT/docker/db-backup.sh"
RESTORE_SCRIPT="$ROOT/docker/db-restore.sh"
REAL_PG_DUMP="$(command -v pg_dump)"
REAL_GZIP="$(command -v gzip)"

for tool in initdb pg_ctl createdb dropdb psql awk grep gzip pg_dump; do
  command -v "$tool" >/dev/null || {
    echo "Required QA tool not found: $tool" >&2
    exit 2
  }
done

if [ "$(id -u)" -eq 0 ]; then
  echo "Run as an unprivileged user; initdb refuses to run as root." >&2
  exit 2
fi

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/kasirv10-backup-restore-test.XXXXXX")"
PGDATA="$WORK_DIR/pgdata"
PGSOCKET="$WORK_DIR/socket"
MOCK_BIN="$WORK_DIR/mock-bin"
mkdir -p "$PGSOCKET" "$MOCK_BIN"
PGPORT_QA="$(python3 - <<'PY'
import socket
with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    print(sock.getsockname()[1])
PY
)"
PGHOST_QA=127.0.0.1
PGUSER_QA=kasirv10_qa
SOURCE_DB=kasirv10_backup_source
TARGET_DB=kasirv10_restore_target
SERVER_STARTED=0

cleanup() {
  if [ "$SERVER_STARTED" -eq 1 ]; then
    pg_ctl -D "$PGDATA" -m immediate -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  if [ -f "$WORK_DIR/postgres.log" ]; then
    tail -40 "$WORK_DIR/postgres.log" >&2 || true
  fi
  exit 1
}

pass() {
  printf 'PASS: %s\n' "$1"
}

initdb -D "$PGDATA" --auth-local=trust --auth-host=trust --username="$PGUSER_QA" \
  --no-instructions >"$WORK_DIR/initdb.log" 2>&1 || fail "initialize temporary QA PostgreSQL"
pg_ctl -D "$PGDATA" \
  -o "-h $PGHOST_QA -p $PGPORT_QA -k $PGSOCKET -c listen_addresses=$PGHOST_QA" \
  -l "$WORK_DIR/postgres.log" -w start >/dev/null || fail "start temporary QA PostgreSQL"
SERVER_STARTED=1

export PGHOST="$PGHOST_QA" PGPORT="$PGPORT_QA" PGUSER="$PGUSER_QA"
createdb "$SOURCE_DB" || fail "create temporary source database"
createdb "$TARGET_DB" || fail "create temporary empty restore database"
psql -X -w -d "$SOURCE_DB" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
CREATE TABLE public.qa_backup_probe (
  id integer PRIMARY KEY,
  marker text NOT NULL
);
INSERT INTO public.qa_backup_probe VALUES (1, 'qa-row-one'), (2, 'qa-row-two');
SQL

cat >"$MOCK_BIN/pg_dump" <<'SH'
#!/bin/sh
case "${FAKE_PG_DUMP_MODE:-real}" in
  real) exec "$REAL_PG_DUMP" "$@" ;;
  fail) printf '%s\n' '-- partial QA dump'; exit 17 ;;
  empty) exit 0 ;;
  *) exit 90 ;;
esac
SH
cat >"$MOCK_BIN/gzip" <<'SH'
#!/bin/sh
if [ "${1:-}" = "-c" ]; then
  case "${FAKE_GZIP_MODE:-real}" in
    fail) cat >/dev/null; exit 23 ;;
    corrupt) cat >/dev/null; printf '%s\n' 'not-a-gzip-stream'; exit 0 ;;
  esac
fi
exec "$REAL_GZIP" "$@"
SH
chmod +x "$MOCK_BIN/pg_dump" "$MOCK_BIN/gzip"

run_backup() {
  local name="$1" dump_mode="$2" gzip_mode="$3" expected="$4"
  local out="$WORK_DIR/backup-$name" log="$WORK_DIR/backup-$name.log" rc=0
  mkdir -p "$out"
  if env PATH="$MOCK_BIN:$PATH" REAL_PG_DUMP="$REAL_PG_DUMP" REAL_GZIP="$REAL_GZIP" \
    FAKE_PG_DUMP_MODE="$dump_mode" FAKE_GZIP_MODE="$gzip_mode" \
    PGHOST="$PGHOST" PGPORT="$PGPORT" PGUSER="$PGUSER" PGDATABASE="$SOURCE_DB" \
    PGPASSWORD='QA_ONLY_NOT_A_SECRET' BACKUP_DIR="$out" BACKUP_ONCE=1 \
    BACKUP_INTERVAL_SECONDS=30 BACKUP_KEEP_DAYS=14 \
    sh "$BACKUP_SCRIPT" >"$log" 2>&1; then
    rc=0
  else
    rc=$?
  fi

  local final_count
  final_count="$(find "$out" -maxdepth 1 -type f -name 'alfath-*.sql.gz' | wc -l | tr -d ' ')"
  if [ "$expected" = success ]; then
    [ "$rc" -eq 0 ] || fail "$name backup unexpectedly failed"
    [ "$final_count" -eq 1 ] || fail "$name backup did not publish exactly one file"
    gzip -t "$out"/alfath-*.sql.gz || fail "$name backup gzip validation"
    grep -Fq 'status=SUCCESS' "$log" || fail "$name success status log"
  else
    [ "$rc" -ne 0 ] || fail "$name backup should return failure"
    [ "$final_count" -eq 0 ] || fail "$name published a file after failure"
    grep -Fq 'status=FAILED' "$log" || fail "$name failure status log"
  fi
  if grep -Fq 'QA_ONLY_NOT_A_SECRET' "$log"; then
    fail "$name log contains a credential canary"
  fi
  if [ "$expected" = failure ]; then
    rm -rf "$out"
  fi
}

run_backup success real real success
BACKUP_FILE="$(find "$WORK_DIR/backup-success" -maxdepth 1 -type f -name 'alfath-*.sql.gz' -print -quit)"
[ -n "$BACKUP_FILE" ] || fail "successful archive missing"
pass "backup succeeds; pg_dump/gzip checks, SQL dump markers, and atomic publication"

run_backup pg-dump-fails fail real failure
pass "pg_dump failure is not hidden by successful gzip; no final backup published"

run_backup compression-fails real fail failure
pass "gzip failure is detected; no final backup published"

run_backup empty-dump empty real failure
pass "empty SQL payload is rejected"

run_backup corrupted-gzip real corrupt failure
pass "corrupted gzip output is rejected"

export RESTORE_ALLOWED_HOST="$PGHOST"
export RESTORE_ALLOWED_PORT="$PGPORT"
export RESTORE_ALLOWED_DB="$TARGET_DB"
export RESTORE_ALLOWED_SCHEMA=public
export PGPASSWORD='QA_ONLY_NOT_A_SECRET'

RESTORE_ARGS=(
  --backup "$BACKUP_FILE"
  --target-host "$PGHOST"
  --target-port "$PGPORT"
  --target-db "$TARGET_DB"
  --target-schema public
)

sh "$RESTORE_SCRIPT" "${RESTORE_ARGS[@]}" >"$WORK_DIR/restore-dry-run.log" 2>&1 \
  || fail "read-only restore preflight"
grep -Fq 'status=DRY_RUN_OK' "$WORK_DIR/restore-dry-run.log" \
  || fail "dry-run completion status"
TARGET_COUNT="$(psql -X -w -d "$TARGET_DB" -At -c 'SELECT count(*) FROM information_schema.tables WHERE table_schema = '\''public'\'';')"
[ "$TARGET_COUNT" = 0 ] || fail "dry-run changed the target database"
pass "restore dry-run verifies exact host/port/database/schema and leaves target empty"

if RESTORE_ALLOWED_DB=qa_different_target sh "$RESTORE_SCRIPT" "${RESTORE_ARGS[@]}" \
  >"$WORK_DIR/restore-wrong-target.log" 2>&1; then
  fail "restore accepted a target not in the approved allowlist"
fi
grep -Fq 'target_database_not_approved' "$WORK_DIR/restore-wrong-target.log" \
  || fail "wrong-target rejection reason"
pass "restore rejects an unapproved database before connecting or writing"

printf '%s\n' 'not a gzip archive' >"$WORK_DIR/corrupt.sql.gz"
if sh "$RESTORE_SCRIPT" \
  --backup "$WORK_DIR/corrupt.sql.gz" \
  --target-host "$PGHOST" \
  --target-port "$PGPORT" \
  --target-db "$TARGET_DB" \
  --target-schema public \
  >"$WORK_DIR/restore-corrupt.log" 2>&1; then
  fail "restore accepted a corrupt archive"
fi
grep -Fq 'gzip_integrity_check_failed' "$WORK_DIR/restore-corrupt.log" \
  || fail "corrupt archive rejection reason"
pass "restore rejects a corrupt archive"

if sh "$RESTORE_SCRIPT" "${RESTORE_ARGS[@]}" --execute \
  >"$WORK_DIR/restore-no-approval.log" 2>&1; then
  fail "restore executed without explicit target approval"
fi
grep -Fq 'explicit_target_approval_required' "$WORK_DIR/restore-no-approval.log" \
  || fail "missing-approval rejection reason"
pass "restore execution requires explicit approval string"

APPROVAL="restore:${PGHOST}:${PGPORT}/${TARGET_DB}/public"
sh "$RESTORE_SCRIPT" "${RESTORE_ARGS[@]}" --execute --approve-target "$APPROVAL" \
  >"$WORK_DIR/restore-execute.log" 2>&1 || fail "restore into the empty QA database"
RESTORED_ROWS="$(psql -X -w -d "$TARGET_DB" -At -F ':' \
  -c 'SELECT count(*), string_agg(marker, '\'','\'' ORDER BY id) FROM public.qa_backup_probe;')"
[ "$RESTORED_ROWS" = "2:qa-row-one,qa-row-two" ] || fail "restored data mismatch: $RESTORED_ROWS"
pass "restore succeeds into the empty isolated QA database and data matches"

if sh "$RESTORE_SCRIPT" "${RESTORE_ARGS[@]}" --execute --approve-target "$APPROVAL" \
  >"$WORK_DIR/restore-nonempty.log" 2>&1; then
  fail "restore accepted a non-empty database"
fi
grep -Fq 'target_database_not_empty' "$WORK_DIR/restore-nonempty.log" \
  || fail "non-empty target rejection reason"
pass "restore refuses a target that already contains objects"

SOURCE_ROWS="$(psql -X -w -d "$SOURCE_DB" -At -F ':' \
  -c 'SELECT count(*), string_agg(marker, '\'','\'' ORDER BY id) FROM public.qa_backup_probe;')"
[ "$SOURCE_ROWS" = "2:qa-row-one,qa-row-two" ] || fail "source database changed"
pass "source QA database remains unchanged"

echo "All backup/restore tests passed using only temporary PostgreSQL databases."

#!/bin/sh
# Automated PostgreSQL backups for AlfathPOS (runs inside the "backup" container).
# Dumps the database on a fixed interval, writes a timestamped gzip file to
# /backups (bind-mounted to ./backups on the host), and deletes old dumps.
set -eu

INTERVAL="${BACKUP_INTERVAL_SECONDS:-21600}"   # default: every 6 hours
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"            # default: keep 14 days
BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_ONCE="${BACKUP_ONCE:-0}"

case "$INTERVAL" in ''|*[!0-9]*|0) echo "[backup] invalid BACKUP_INTERVAL_SECONDS" >&2; exit 2 ;; esac
case "$KEEP_DAYS" in ''|*[!0-9]*|0) echo "[backup] invalid BACKUP_KEEP_DAYS" >&2; exit 2 ;; esac
case "$BACKUP_ONCE" in 0|1) ;; *) echo "[backup] invalid BACKUP_ONCE (use 0 or 1)" >&2; exit 2 ;; esac

umask 077
mkdir -p "$BACKUP_DIR"
echo "[backup] started; interval=${INTERVAL}s keep=${KEEP_DAYS}d target=${BACKUP_DIR}"

WORK_DIR=""
GZIP_PID=""
cleanup() {
  if [ -n "$GZIP_PID" ]; then
    kill "$GZIP_PID" 2>/dev/null || true
    wait "$GZIP_PID" 2>/dev/null || true
  fi
  if [ -n "$WORK_DIR" ]; then
    rm -rf "$WORK_DIR"
  fi
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

while true; do
  TS="$(date +%Y%m%d-%H%M%S)"
  FILE="${BACKUP_DIR}/alfath-${TS}.sql.gz"
  BACKUP_OK=0

  echo "[backup] $(date '+%Y-%m-%d %H:%M:%S') dumping -> ${FILE}"
  if ! WORK_DIR="$(mktemp -d "${BACKUP_DIR}/.alfath-${TS}.XXXXXX")"; then
    echo "[backup] FAILED: cannot create temporary directory at ${BACKUP_DIR}" >&2
  else
    FIFO="${WORK_DIR}/dump.sql"
    TMP="${WORK_DIR}/backup.sql.gz"
    : > "$TMP"
    if ! mkfifo "$FIFO"; then
      echo "[backup] FAILED: cannot create dump pipe at ${TS}" >&2
    else
      # Keep streaming to avoid writing a second uncompressed copy to disk.
      # Capture pg_dump and gzip statuses separately: POSIX sh otherwise reports
      # only gzip's status for a pipeline, which can hide a failed/partial dump.
      gzip -c < "$FIFO" > "$TMP" &
      GZIP_PID=$!
      DUMP_STATUS=0
      if pg_dump --no-owner --no-privileges > "$FIFO"; then
        :
      else
        DUMP_STATUS=$?
      fi
      GZIP_STATUS=0
      if wait "$GZIP_PID"; then
        :
      else
        GZIP_STATUS=$?
      fi
      GZIP_PID=""

      if [ "$DUMP_STATUS" -eq 0 ] && [ "$GZIP_STATUS" -eq 0 ] &&
         [ -s "$TMP" ] && gzip -t "$TMP" &&
         gzip -cd "$TMP" | awk '
           NR <= 10 && $0 == "-- PostgreSQL database dump" { header = 1 }
           $0 == "-- PostgreSQL database dump complete" { footer = 1 }
           END { exit (header && footer) ? 0 : 1 }
         '; then
        if mv "$TMP" "$FILE"; then
          BACKUP_OK=1
          echo "[backup] $(date -u '+%Y-%m-%dT%H:%M:%SZ') status=SUCCESS file=${FILE} size=$(du -h "${FILE}" | cut -f1)"
        else
          echo "[backup] $(date -u '+%Y-%m-%dT%H:%M:%SZ') status=FAILED reason=publish_failed timestamp=${TS}" >&2
        fi
      else
        echo "[backup] $(date -u '+%Y-%m-%dT%H:%M:%SZ') status=FAILED reason=dump_compression_or_content_verification timestamp=${TS} pg_dump=${DUMP_STATUS} gzip=${GZIP_STATUS}" >&2
      fi
    fi
  fi
  if [ -n "$WORK_DIR" ]; then
    rm -rf "$WORK_DIR"
    WORK_DIR=""
  fi

  # Rotation: remove dumps older than KEEP_DAYS.
  if [ "$BACKUP_OK" -eq 1 ]; then
    if ! find "$BACKUP_DIR" -name 'alfath-*.sql.gz' -type f \
        -mtime "+${KEEP_DAYS}" -exec rm -f {} \;; then
      echo "[backup] WARNING: retention cleanup failed" >&2
    fi
  else
    echo "[backup] retention skipped because the new backup failed" >&2
  fi

  if [ "$BACKUP_ONCE" -eq 1 ]; then
    [ "$BACKUP_OK" -eq 1 ] && exit 0
    exit 1
  fi

  sleep "${INTERVAL}"
done

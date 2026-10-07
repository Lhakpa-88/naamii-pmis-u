#!/usr/bin/env bash
# Local PostgreSQL for development and tests (no Docker needed).
# Starts a throw-away PostgreSQL 16 cluster on port ${PMIS_PGPORT:-5433}.
#
#   npm run db:start   # init (first time) + start
#   npm run db:stop
#
# Data lives in .local/pgdata (git-ignored). Never use this for real NAAMII data;
# production runs on Azure Database for PostgreSQL (see docs/).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PMIS_PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PGDATA="${PMIS_PGDATA:-$ROOT/.local/pgdata}"
PGPORT="${PMIS_PGPORT:-5433}"
LOG="$PGDATA/server.log"

if [[ -z "$PGBIN" || ! -x "$PGBIN/pg_ctl" ]]; then
  echo "PostgreSQL binaries not found. Install postgresql (16+) or set PMIS_PGBIN." >&2
  exit 1
fi

# PostgreSQL refuses to run as root; fall back to the 'postgres' system user.
run() {
  if [[ "$(id -u)" == "0" ]]; then
    runuser -u postgres -- "$@"
  else
    "$@"
  fi
}

prepare_dir() {
  mkdir -p "$PGDATA"
  if [[ "$(id -u)" == "0" ]]; then
    chown -R postgres:postgres "$PGDATA"
    # the parent must be traversable by the postgres user
    chmod o+rx "$ROOT" "$ROOT/.local" 2>/dev/null || true
  fi
}

case "${1:-start}" in
  start)
    prepare_dir
    if [[ ! -f "$PGDATA/PG_VERSION" ]]; then
      echo "Initialising local cluster in $PGDATA"
      run "$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust -E UTF8 >/dev/null
    fi
    if run "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
      echo "PostgreSQL already running on port $PGPORT"
    else
      run "$PGBIN/pg_ctl" -D "$PGDATA" -l "$LOG" -o "-p $PGPORT -c listen_addresses=127.0.0.1 -k /tmp" -w start >/dev/null
      echo "PostgreSQL started on 127.0.0.1:$PGPORT (log: $LOG)"
    fi
    echo "Admin URL : postgres://postgres@127.0.0.1:$PGPORT/naamii_pmis"
    echo "App URL   : postgres://pmis_app@127.0.0.1:$PGPORT/naamii_pmis   (after npm run db:migrate)"
    ;;
  stop)
    if [[ -f "$PGDATA/PG_VERSION" ]]; then
      run "$PGBIN/pg_ctl" -D "$PGDATA" -m fast -w stop >/dev/null && echo "PostgreSQL stopped"
    fi
    ;;
  status)
    run "$PGBIN/pg_ctl" -D "$PGDATA" status
    ;;
  *)
    echo "usage: $0 {start|stop|status}" >&2
    exit 2
    ;;
esac

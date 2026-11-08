#!/usr/bin/env bash
# Starts local Postgres 18 + Valkey for development (idempotent).
set -euo pipefail
cd "$(dirname "$0")/.."
start() { docker start "$1" >/dev/null 2>&1 && echo "started $1" || return 1; }
start bok-postgres || docker run -d --name bok-postgres \
  -e POSTGRES_USER=bok -e POSTGRES_PASSWORD=bok -e POSTGRES_DB=bok -p 5432:5432 \
  -v bok-pgdata:/var/lib/postgresql \
  -v "$PWD/deploy/dev/init.sql:/docker-entrypoint-initdb.d/init.sql:ro" postgres:18
start bok-valkey || docker run -d --name bok-valkey -p 6379:6379 valkey/valkey:9

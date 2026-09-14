#!/usr/bin/env bash
# Prepare and start the API the Appium suite talks to.
#
#   e2e/scripts/backend.sh            # create/migrate/seed irtaki_e2e, build, run on :3847
#   E2E_PORT=4000 e2e/scripts/backend.sh
#
# Uses the Postgres from backend/docker-compose.yml. The database is dedicated
# to E2E (never the development `irtaki` database); rate limits are relaxed
# because every spec signs in many times.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND="$ROOT/backend"
DB_NAME="${E2E_DB_NAME:-irtaki_e2e}"
PORT="${E2E_PORT:-3847}"

if [ "$DB_NAME" = "irtaki" ]; then
  echo "Refusing to use the development database 'irtaki' for E2E." >&2
  exit 1
fi

cd "$BACKEND"
if [ -z "${E2E_SKIP_DOCKER:-}" ]; then
  docker compose up -d postgres
  until docker compose exec -T postgres pg_isready -U irtaki >/dev/null 2>&1; do sleep 1; done
  docker compose exec -T postgres psql -U irtaki -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 ||
    docker compose exec -T postgres psql -U irtaki -d postgres -c "CREATE DATABASE $DB_NAME;"
fi

export DB_NAME PORT NODE_ENV=development
export RATE_LIMIT_AUTH_PER_MINUTE=100000
export RATE_LIMIT_JOIN_REQUESTS_PER_MINUTE=100000

npm run -s migration:run >/dev/null
npm run -s seed
npm run -s build

echo "Starting API on http://localhost:$PORT/api/v1 (database $DB_NAME)"
exec node dist/src/main.js

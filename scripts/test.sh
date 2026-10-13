#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose -f docker-compose.test.yml up -d --wait
trap 'docker compose -f docker-compose.test.yml down' EXIT
export DATABASE_URL=postgresql+psycopg://stockroom:stockroom@localhost:55432/stockroom_test
export TEST_DATABASE_URL="$DATABASE_URL"
cd backend
.venv/bin/alembic upgrade head
.venv/bin/ruff check app tests alembic
.venv/bin/ruff format --check app tests alembic
.venv/bin/pytest -v
.venv/bin/alembic check
.venv/bin/alembic downgrade base
.venv/bin/alembic upgrade head

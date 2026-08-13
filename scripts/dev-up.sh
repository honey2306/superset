#!/usr/bin/env bash
# Local-first development requires no background infrastructure. This wrapper
# remains for compatibility with `bun run start`.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ "${1:-}" = "--stop" ]; then
  echo "No background cloud or database services are managed by Superset."
  exit 0
fi

if [ ! -f .env ]; then
  echo "Missing .env. Run ./.superset/setup.local.sh first." >&2
  exit 1
fi

exec bun run dev

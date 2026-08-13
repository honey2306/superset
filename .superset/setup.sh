#!/usr/bin/env bash
# Superset is local-first; the default workspace setup is the local setup.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/setup.local.sh" "$@"

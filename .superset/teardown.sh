#!/usr/bin/env bash
# Superset owns no remote branch or local service stack to tear down.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/teardown.local.sh" "$@"

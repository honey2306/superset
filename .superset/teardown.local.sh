#!/usr/bin/env bash
# The local-first app owns no Docker/database stack. Keep this hook as a safe,
# idempotent no-op for existing workspace overlays.
set -euo pipefail

echo "No Superset background infrastructure to tear down."

#!/usr/bin/env bash
# Prepare a workspace for the local-first Desktop app. No account, cloud API,
# database server, or Docker daemon is required.
set -uo pipefail

SUPERSET_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SUPERSET_SCRIPT_DIR/.." && pwd)"

# shellcheck source=/dev/null
source "$SUPERSET_SCRIPT_DIR/lib/common.sh"

cd "$ROOT_DIR" || exit 1

read_env_var() {
  local key="$1"
  [ -f .env ] || return 0
  awk -F= -v k="$key" '
    /^[[:space:]]*#/ { next }
    $1 ~ "^[[:space:]]*"k"[[:space:]]*$" {
      sub(/^[^=]*=/, ""); gsub(/^[[:space:]]+|[[:space:]]+$/, "");
      gsub(/^"|"$/, ""); value=$0
    }
    END { print value }
  ' .env
}

port_is_free() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    ! lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
  else
    return 0
  fi
}

allocate_local_ports() {
  local existing
  existing="$(read_env_var SUPERSET_PORT_BASE)"
  if [[ "$existing" =~ ^[0-9]+$ ]]; then
    SUPERSET_PORT_BASE="$existing"
    return 0
  fi

  local base
  for base in $(seq 3000 20 4980); do
    if port_is_free "$((base + 5))" && port_is_free "$((base + 6))"; then
      SUPERSET_PORT_BASE="$base"
      return 0
    fi
  done
  error "No free Desktop port window found between 3000 and 4999"
  return 1
}

write_local_env() {
  local base="$SUPERSET_PORT_BASE"
  local desktop_port=$((base + 5))
  local notifications_port=$((base + 6))
  local filtered_env
  filtered_env="$(mktemp)"

  # Preserve user-owned values such as model-provider API keys while removing
  # stale generated cloud/database settings from older setup versions.
  if [ -f .env ]; then
    awk -F= '
      BEGIN {
        split("SUPERSET_WORKSPACE_NAME SUPERSET_HOME_DIR SUPERSET_PORT_BASE DESKTOP_VITE_PORT DESKTOP_NOTIFICATIONS_PORT NEXT_PUBLIC_WEB_URL NEXT_PUBLIC_MARKETING_URL NEXT_PUBLIC_DOCS_URL NEXT_PUBLIC_API_URL SUPERSET_API_URL API_PORT DATABASE_URL DATABASE_URL_UNPOOLED LOCAL_PG_PORT LOCAL_NEON_PROXY_PORT LOCAL_REDIS_PORT LOCAL_SRH_PORT KV_REST_API_URL KV_REST_API_TOKEN KV_URL", keys, " ");
        for (i in keys) managed[keys[i]] = 1
      }
      /^[[:space:]]*#/ { print; next }
      /^[[:space:]]*$/ { print; next }
      {
        key=$1; gsub(/^[[:space:]]+|[[:space:]]+$/, "", key)
        if (!managed[key]) print
      }
    ' .env > "$filtered_env"
  fi

  cat "$filtered_env" > .env
  rm -f "$filtered_env"
  cat >> .env <<EOF

# ===== Local-first workspace settings (setup.local.sh) =====
SUPERSET_WORKSPACE_NAME="${SUPERSET_WORKSPACE_NAME:-$(basename "$PWD")}"
SUPERSET_HOME_DIR="$PWD/superset-dev-data"
SUPERSET_PORT_BASE="$base"
DESKTOP_VITE_PORT="$desktop_port"
DESKTOP_NOTIFICATIONS_PORT="$notifications_port"
NEXT_PUBLIC_WEB_URL="https://superset.sh"
NEXT_PUBLIC_MARKETING_URL="https://superset.sh"
NEXT_PUBLIC_DOCS_URL="https://docs.superset.sh"
EOF

  cat > "$SUPERSET_SCRIPT_DIR/ports.json" <<EOF
{
  "ports": [
    { "port": $desktop_port, "label": "Desktop Vite" },
    { "port": $notifications_port, "label": "Notifications" }
  ]
}
EOF
}

main() {
  FAILED_STEPS=()
  SKIPPED_STEPS=()

  echo "🚀 Setting up Superset for local-first development..."
  command -v bun >/dev/null 2>&1 || step_failed "Bun is required (https://bun.sh)"
  if [ ${#FAILED_STEPS[@]} -eq 0 ]; then
    bun install || step_failed "Install dependencies"
    allocate_local_ports || step_failed "Allocate ports"
    if [ ${#FAILED_STEPS[@]} -eq 0 ]; then
      write_local_env || step_failed "Write local environment"
      cat > "$SUPERSET_SCRIPT_DIR/config.local.json" <<'EOF'
{
  "setup": ["./.superset/setup.local.sh"],
  "teardown": ["./.superset/teardown.local.sh"]
}
EOF
    fi
  fi

  print_summary "Local setup"
  if [ ${#FAILED_STEPS[@]} -eq 0 ]; then
    echo "Run: bun run dev"
  fi
}

main "$@"

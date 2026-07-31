#!/usr/bin/env bash
# One-shot local dev launcher. Brings up the per-workspace docker stack
# (postgres + neon-proxy + electric + redis + SRH), waits until neon-proxy
# and SRH are actually serving (health != HTTP shim ready — see
# .superset/setup.local.sh), then execs `bun run dev`.
#
# Ctrl+C stops `bun run dev` only; containers stay up so the next launch is
# instant. Use `bun run start:stop` to stop containers (data volume preserved)
# or `.superset/teardown.local.sh` to fully remove the stack + volume.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; NC='\033[0m'
err()  { echo -e "${RED}✗${NC} $*" >&2; }
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }

# --- Load .env (only the vars we need; don't clobber the shell) --------------
if [ ! -f .env ]; then
  err ".env missing. Run ./.superset/setup.local.sh first."
  exit 1
fi

# Extract KEY="value" or KEY=value; tolerate quotes/whitespace/comments.
get_env() {
  # Last occurrence wins (matches dotenv semantics).
  awk -F= -v k="$1" '
    /^[[:space:]]*#/ { next }
    $1 ~ "^[[:space:]]*"k"[[:space:]]*$" {
      sub(/^[^=]*=/, "");
      gsub(/^[[:space:]]+|[[:space:]]+$/, "");
      gsub(/^"|"$/, "");
      val = $0
    }
    END { print val }
  ' .env
}

WORKSPACE_NAME="$(get_env SUPERSET_WORKSPACE_NAME)"
LOCAL_NEON_PROXY_PORT="$(get_env LOCAL_NEON_PROXY_PORT)"
LOCAL_SRH_PORT="$(get_env LOCAL_SRH_PORT)"

if [ -z "$WORKSPACE_NAME" ] || [ -z "$LOCAL_NEON_PROXY_PORT" ] || [ -z "$LOCAL_SRH_PORT" ]; then
  err "Missing SUPERSET_WORKSPACE_NAME / LOCAL_NEON_PROXY_PORT / LOCAL_SRH_PORT in .env."
  err "Run ./.superset/setup.local.sh first."
  exit 1
fi

# sanitize_name — same rule as setup.local.sh so project names match.
sanitize_name() {
  echo "$1" | tr '[:upper:]' '[:lower:]' \
    | sed 's/[^a-z0-9._-]/-/g; s/--*/-/g; s/^-//; s/-$//' \
    | cut -c1-48
}
PROJECT="superset-$(sanitize_name "$WORKSPACE_NAME")"

# --- Prereqs -----------------------------------------------------------------
command -v docker >/dev/null || { err "docker not found"; exit 1; }
docker info >/dev/null 2>&1 || { err "docker daemon not running"; exit 1; }
command -v bun    >/dev/null || { err "bun not found";    exit 1; }

# Support --stop as a subcommand so package.json can reuse this script.
if [ "${1:-}" = "--stop" ]; then
  echo "⏹  Stopping DB stack ($PROJECT) — data volume preserved..."
  docker compose -p "$PROJECT" -f "$ROOT_DIR/docker-compose.yml" stop
  ok  "Stopped. Use ./.superset/teardown.local.sh to remove the volume too."
  exit 0
fi

# --- Start containers --------------------------------------------------------
echo "🗄️  Starting DB stack ($PROJECT)..."
if ! docker compose -p "$PROJECT" -f "$ROOT_DIR/docker-compose.yml" up -d; then
  err "docker compose up failed"
  exit 1
fi

# --- Wait for neon-proxy to actually serve queries ---------------------------
# Postgres healthcheck != proxy ready. Probe a real query, matching what
# setup.local.sh does.
echo "  Waiting for neon-proxy :$LOCAL_NEON_PROXY_PORT to serve queries..."
proxy_ready=0
for _ in $(seq 1 30); do
  if curl -s --max-time 3 -X POST "http://localhost:$LOCAL_NEON_PROXY_PORT/sql" \
      -H "Neon-Connection-String: postgres://postgres:postgres@db.localtest.me:$LOCAL_NEON_PROXY_PORT/main" \
      -H "Content-Type: application/json" \
      -d '{"query":"select 1","params":[]}' 2>/dev/null | grep -q '"command"'; then
    proxy_ready=1
    break
  fi
  sleep 1
done
if [ "$proxy_ready" -ne 1 ]; then
  err "neon-proxy did not become ready within 30s. Try: docker compose -p $PROJECT logs neon-proxy"
  exit 1
fi
ok "neon-proxy ready"

# --- Wait for SRH ------------------------------------------------------------
echo "  Waiting for serverless-redis-http :$LOCAL_SRH_PORT to answer PING..."
srh_ready=0
for _ in $(seq 1 30); do
  if curl -s --max-time 3 -X POST "http://localhost:$LOCAL_SRH_PORT/" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer local_dev_token" \
      -d '["PING"]' 2>/dev/null | grep -q 'PONG'; then
    srh_ready=1
    break
  fi
  sleep 1
done
if [ "$srh_ready" -ne 1 ]; then
  err "serverless-redis-http did not become ready within 30s"
  exit 1
fi
ok "serverless-redis-http ready"

# --- Hand off to `bun run dev` ----------------------------------------------
# exec so Ctrl+C goes straight to turbo/dev processes.
echo ""
ok "Stack up. Handing off to \`bun run dev\`..."
echo ""
exec bun run dev

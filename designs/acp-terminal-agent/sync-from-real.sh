#!/bin/bash
# Sync the preview page's stylesheet from the real pane implementation so v3
# stays a faithful snapshot of the current UI. Run from repo root, or with any
# cwd — the paths below are absolute-from-repo-root.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$REPO_ROOT/apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/AcpSessionPane/acp-pane.css"
DST="$REPO_ROOT/designs/acp-terminal-agent/acp-pane.css"

cp "$SRC" "$DST"
echo "synced: $SRC → $DST"

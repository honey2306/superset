#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TARGET_DIR="apps/desktop/src"
failures=0

report_violation() {
	local message="$1"
	local pattern="$2"
	shift 2

	local output
	if output=$(rg -n -U --pcre2 "$pattern" "$TARGET_DIR" "$@" 2>/dev/null); then
		echo "$message"
		echo "$output"
		echo
		failures=1
	fi
}

report_violation \
	"[desktop-git-env] Direct runtime imports from simple-git are forbidden. Use a centralized Git helper from main/lib/shell-env.ts." \
	"^import(?!\\s+type\\b).*['\"]simple-git['\"]" \
	--glob '!**/*.test.ts' \
	--glob '!apps/desktop/src/lib/trpc/routers/workspaces/utils/git-client.ts'

report_violation \
	"[desktop-git-env] Direct simpleGit(...) construction is forbidden outside the centralized Git helper." \
	"\\bsimpleGit\\(" \
	--glob '!**/*.test.ts' \
	--glob '!apps/desktop/src/lib/trpc/routers/workspaces/utils/git-client.ts'

report_violation \
	"[desktop-git-env] Raw execFile/execFileAsync git calls are forbidden. Use execGitWithShellPath from main/lib/shell-env.ts." \
	"\\bexecFile(?:Async)?\\(\\s*['\"]git['\"]" \
	--glob '!**/*.test.ts' \
	--glob '!apps/desktop/src/main/lib/shell-env.ts'

report_violation \
	"[desktop-git-env] execWithShellEnv(\"git\", ...) is forbidden. Use execGitWithShellPath from main/lib/shell-env.ts." \
	"\\bexecWithShellEnv\\(\\s*['\"]git['\"]" \
	--glob '!**/*.test.ts'

if [[ "$failures" -ne 0 ]]; then
	exit 1
fi

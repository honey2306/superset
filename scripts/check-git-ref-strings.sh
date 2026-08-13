#!/bin/bash
# Forbids string-prefix checks against `origin/...` shortnames anywhere
# outside the git-refs module. See packages/host-service/GIT_REFS.md.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

failures=0

scan_typescript() {
	local pattern="$1"

	if command -v rg >/dev/null 2>&1; then
		rg -n -U --pcre2 "$pattern" \
			--type ts \
			--glob '!**/*.test.ts' \
			--glob '!packages/host-service/src/runtime/git/refs.ts' \
			--glob '!apps/desktop/src/lib/trpc/routers/**'
		return $?
	fi

	# Keep lint runnable in the documented Bun-only environment. Scan tracked and
	# untracked, non-ignored TypeScript files so new source cannot bypass the gate.
	local matched=1
	local file
	while IFS= read -r file; do
		[[ -f "$file" ]] || continue
		case "$file" in
			*.test.ts | packages/host-service/src/runtime/git/refs.ts | apps/desktop/src/lib/trpc/routers/*)
				continue
				;;
		esac
		local output
		output=$(grep -nE "$pattern" "$file" 2>&1)
		local rc=$?
		if [[ "$rc" -eq 0 ]]; then
			while IFS= read -r line; do printf '%s:%s\n' "$file" "$line"; done <<<"$output"
			matched=0
		elif [[ "$rc" -gt 1 ]]; then
			echo "$output" >&2
			return 2
		fi
	done < <(git ls-files --cached --others --exclude-standard -- '*.ts')
	return "$matched"
}

report_violation() {
	local message="$1"
	local rg_pattern="$2"
	local grep_pattern="$3"
	local output
	local rc

	if command -v rg >/dev/null 2>&1; then
		output=$(scan_typescript "$rg_pattern" 2>&1) && rc=0 || rc=$?
	else
		output=$(scan_typescript "$grep_pattern" 2>&1) && rc=0 || rc=$?
	fi

	case "$rc" in
		0)
			echo "$message"
			echo "$output"
			echo
			failures=1
			;;
		1)
			: # no matches
			;;
		*)
			echo "[git-refs] source scan failed (exit $rc)" >&2
			[[ -n "$output" ]] && echo "$output" >&2
			failures=1
			;;
	esac
}

report_violation \
	"[git-refs] '.startsWith(\"origin/\")' is forbidden — a local branch can be named 'origin/foo' and would be misclassified. Use ResolvedRef from @superset/host-service/git." \
	"\\.startsWith\\(\\s*['\"]origin/" \
	"\\.startsWith\\([[:space:]]*['\"]origin/"

report_violation \
	"[git-refs] '.replace(\"origin/\", ...)' is forbidden — same misclassification risk. Use ResolvedRef.shortName / .remote instead." \
	"\\.replace\\(\\s*['\"]origin/" \
	"\\.replace\\([[:space:]]*['\"]origin/"

exit "$failures"

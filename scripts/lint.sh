#!/bin/bash
# Run every lint gate and fail on any diagnostic or failed sub-check.
set -uo pipefail

status=0
output=$(bunx @biomejs/biome@2.4.2 check "$@" 2>&1)
biome_exit=$?

echo "$output"

# Biome can emit diagnostics without a non-zero status in some modes. CI treats
# every error, warning, and info diagnostic as a failure.
if [[ "$biome_exit" -ne 0 ]] || echo "$output" | grep -qE "Found [0-9]+ (error|info|warning)"; then
	status=1
fi

for check in \
	./scripts/check-desktop-git-env.sh \
	./scripts/check-git-ref-strings.sh \
	./scripts/check-simple-git-usage.sh; do
	if ! bash "$check"; then
		status=1
	fi
done

exit "$status"

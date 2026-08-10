#!/usr/bin/env bun

// Enforces unified versioning: desktop and every UNIFIED_PACKAGES entry use the
// same plain MAJOR.MINOR.PATCH version. pty-daemon is excluded.

import {
	assertUnified,
	DESKTOP_PACKAGE,
	repoRoot,
	UNIFIED_PACKAGES,
} from "./lib.ts";

/** Returns true if versions are unified, false (after printing errors) if not. */
export async function runCheck(): Promise<boolean> {
	const root = await repoRoot();
	const { desktop, entries, errors } = await assertUnified(root);

	if (errors.length > 0) {
		for (const e of errors) console.error(`  ✗ ${e}`);
		console.error(
			`\nVersion drift detected. Unified rule: ${DESKTOP_PACKAGE} == ${UNIFIED_PACKAGES.join(" == ")}`,
		);

		return false;
	}

	const summary = entries.map((e) => `${e.name}=${e.version}`).join(" ");
	console.log(
		`✓ versions unified at ${desktop}: ${DESKTOP_PACKAGE} ${summary}`,
	);
	return true;
}

if (import.meta.main) process.exit((await runCheck()) ? 0 : 1);

// Shared release primitives — the single source of truth for which packages
// track the desktop version and how versions are written, diffed, and checked.
// Consumed by release.ts (entry point), desktop.ts, and check-versions.ts.
//
// Add a package to UNIFIED_PACKAGES here and every flow + the CI check follows,
// so the bundle can't drift. See plans/20260709-unified-version-bumping.md.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
import semver from "semver";

// Desktop is the ceiling (a plain MAJOR.MINOR.PATCH release) and is NOT unified
// below. pty-daemon is intentionally excluded (its own 0.x track).
export const DESKTOP_PACKAGE = "apps/desktop";
export const UNIFIED_PACKAGES = ["packages/host-service"];
export const DAEMON_PACKAGE = "packages/pty-daemon";

// name -> src dir, for the release diff report.
export const RELEASE_COMPONENTS: { name: string; dir: string }[] = [
	{ name: "desktop", dir: "apps/desktop/src" },
	{ name: "host-service", dir: "packages/host-service/src" },
	{ name: "pty-daemon", dir: "packages/pty-daemon/src" },
];

export type Stream = "desktop";

// --- logging -----------------------------------------------------------------
const C = {
	red: "\x1b[0;31m",
	green: "\x1b[0;32m",
	yellow: "\x1b[1;33m",
	blue: "\x1b[0;34m",
	reset: "\x1b[0m",
};
export const info = (m: string) => console.log(`${C.blue}ℹ ${C.reset}${m}`);
export const success = (m: string) => console.log(`${C.green}✓${C.reset} ${m}`);
export const warn = (m: string) => console.log(`${C.yellow}⚠${C.reset} ${m}`);
export const green = (m: string) => `${C.green}${m}${C.reset}`;
export function fail(m: string): never {
	console.error(`${C.red}✗${C.reset} ${m}`);
	process.exit(1);
}

// --- pure logic (unit-tested in lib.test.ts) ---------------------------------

const PLAIN_SEMVER = /^\d+\.\d+\.\d+$/;

export function isPlainRelease(v: string): boolean {
	return PLAIN_SEMVER.test(v);
}

/** Errors if a unified package is not a plain release or differs from the
 * desktop version. Empty array = valid. */
export function unifiedErrors(
	desktop: string,
	entries: { name: string; version: string }[],
): string[] {
	const errors: string[] = [];
	if (!isPlainRelease(desktop)) {
		errors.push(
			`desktop version '${desktop}' is not a plain MAJOR.MINOR.PATCH release`,
		);
	}
	for (const { name, version } of entries) {
		if (!isPlainRelease(version)) {
			errors.push(
				`${name} '${version}' must be plain MAJOR.MINOR.PATCH (no prerelease suffix)`,
			);
		}
		if (version !== desktop) {
			errors.push(`${name} '${version}' != desktop '${desktop}'`);
		}
	}
	return errors;
}

/** Newest well-formed desktop tag, filtering malformed historical tags. */
export function latestReleaseTag(tags: string[]): string | undefined {
	const prefix = "desktop-v";
	const versions = tags
		.filter((tag) => /^desktop-v\d+\.\d+\.\d+$/.test(tag))
		.map((tag) => tag.slice(prefix.length))
		.sort(semver.rcompare);
	return versions[0] ? `${prefix}${versions[0]}` : undefined;
}

function inc(v: string, kind: "patch" | "minor" | "major"): string {
	const out = semver.inc(v, kind);
	if (!out) throw new Error(`cannot ${kind}-increment '${v}'`);
	return out;
}
export const incrementPatch = (v: string) => inc(v, "patch");
export const incrementMinor = (v: string) => inc(v, "minor");
export const incrementMajor = (v: string) => inc(v, "major");

// --- filesystem / git wrappers -----------------------------------------------

export async function repoRoot(): Promise<string> {
	return (await $`git rev-parse --show-toplevel`.text()).trim();
}

export function readVersion(root: string, pkgDir: string): string {
	const file = join(root, pkgDir, "package.json");
	return JSON.parse(readFileSync(file, "utf8")).version;
}

/** Write a package's version and reformat it with biome (matches repo style). */
export async function writeVersion(
	root: string,
	pkgDir: string,
	version: string,
): Promise<void> {
	const rel = join(pkgDir, "package.json");
	const file = join(root, rel);
	const pkg = JSON.parse(readFileSync(file, "utf8"));
	pkg.version = version;
	writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
	await $`bunx biome format --write ${rel}`.cwd(root).quiet();
}

export async function syncUnified(
	root: string,
	version: string,
): Promise<void> {
	for (const pkg of UNIFIED_PACKAGES) await writeVersion(root, pkg, version);
}

/** Patch-bump pty-daemon on its own track. Shared by both flows. */
export async function bumpDaemonPatch(
	root: string,
): Promise<{ old: string; next: string }> {
	const old = readVersion(root, DAEMON_PACKAGE);
	const next = incrementPatch(old);
	await writeVersion(root, DAEMON_PACKAGE, next);
	return { old, next };
}

/** Keep bun.lock's workspace versions consistent so --frozen CI installs pass. */
export async function refreshLockfile(root: string): Promise<void> {
	await $`bun install --lockfile-only --registry https://registry.npmjs.org`
		.cwd(root)
		.quiet()
		.nothrow();
}

/** Sync local tags with origin so tag-derived version checks reflect published
 * state, not stale/local tags. Prune so deleted remote tags don't linger. */
export async function fetchTags(root: string): Promise<void> {
	await $`git -C ${root} fetch --tags --force --prune-tags origin`
		.nothrow()
		.quiet();
}

async function tagList(root: string, pattern: string): Promise<string[]> {
	const out = await $`git -C ${root} tag -l ${pattern}`.nothrow().text();
	return out
		.split("\n")
		.map((s) => s.trim())
		.filter(Boolean);
}

export async function previousReleaseTag(
	root: string,
	_stream: Stream,
): Promise<string | undefined> {
	return latestReleaseTag(await tagList(root, "desktop-v*"));
}

async function tagResolves(root: string, tag: string): Promise<boolean> {
	const r = await $`git -C ${root} rev-parse -q --verify ${`${tag}^{commit}`}`
		.nothrow()
		.quiet();
	return r.exitCode === 0;
}

async function srcChangedSince(
	root: string,
	ref: string,
	dir: string,
): Promise<boolean> {
	if (!existsSync(join(root, dir))) return false;
	const r = await $`git -C ${root} diff --quiet ${`${ref}..HEAD`} -- ${dir}`
		.nothrow()
		.quiet();
	return r.exitCode !== 0;
}

export async function changedComponents(
	root: string,
	ref: string,
): Promise<string[]> {
	const out: string[] = [];
	for (const { name, dir } of RELEASE_COMPONENTS) {
		if (await srcChangedSince(root, ref, dir)) out.push(name);
	}
	return out;
}

/** True if pty-daemon/src changed since the commit that last bumped its
 * package.json (i.e. since its last version bump). Tag-independent. */
export async function daemonNeedsBump(root: string): Promise<boolean> {
	const base = (
		await $`git -C ${root} log -1 --format=%H -- packages/pty-daemon/package.json`
			.nothrow()
			.text()
	).trim();
	if (!base) return false;
	return srcChangedSince(root, base, "packages/pty-daemon/src");
}

/** Print what changed since the previous release of the stream. Best-effort. */
export async function releaseDiffReport(
	root: string,
	stream: Stream,
): Promise<void> {
	const prev = await previousReleaseTag(root, stream);
	if (!prev) {
		console.log(`  (no previous ${stream} release tag — skipping diff report)`);
		return;
	}
	if (!(await tagResolves(root, prev))) {
		await $`git -C ${root} fetch --tags --quiet origin`.nothrow().quiet();
	}
	if (!(await tagResolves(root, prev))) {
		console.log(
			`  (previous tag ${prev} not available locally — skipping diff report)`,
		);
		return;
	}
	const changed = await changedComponents(root, prev);
	console.log(
		`  Since ${prev}: changed = ${changed.length ? changed.join(" ") : "none"}`,
	);
}

/** HARD-BLOCK if pty-daemon/src changed since its last version bump but this
 * release isn't bumping it. Exits the process on violation. */
export async function guardDaemonBump(
	root: string,
	bumpingDaemon: boolean,
	fixHint?: string,
): Promise<void> {
	if (bumpingDaemon) return;
	if (!(await daemonNeedsBump(root))) return;
	const cur = readVersion(root, DAEMON_PACKAGE);
	console.error(
		`\n  ✗ pty-daemon/src changed since its last version bump (still ${cur}) but this release doesn't bump the daemon.`,
	);
	console.error(
		"    Old daemons won't be marked update-pending, so the fix won't ship on the shared org socket.",
	);
	console.error(
		`    ${fixHint ?? "Re-run with --daemon to patch-bump pty-daemon on its own track."}`,
	);
	fail("Release blocked by diff check.");
}

// --- CI / GitHub helpers -----------------------------------------------------

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function repoSlug(root: string): Promise<string> {
	const url = (await $`git -C ${root} remote get-url origin`.text()).trim();
	return url.replace(/.*github\.com[:/](.*?)(?:\.git)?$/, "$1");
}

/** Poll for the workflow run triggered by a tag push at <sha>. Returns "" if not
 * found after a few attempts. */
export async function findWorkflowRun(
	root: string,
	workflow: string,
	sha: string,
	{ retries = 6, delayMs = 5000 }: { retries?: number; delayMs?: number } = {},
): Promise<string> {
	const jq = `.[] | select(.headSha == "${sha}" and .event == "push") | .databaseId`;
	for (let i = 0; i < retries; i++) {
		await sleep(delayMs);
		const out =
			await $`gh run list --workflow=${workflow} --json databaseId,headSha,event --jq ${jq}`
				.cwd(root)
				.nothrow()
				.text();
		const id = out
			.split("\n")
			.map((s) => s.trim())
			.filter(Boolean)[0];
		if (id) return id;
	}
	return "";
}

export async function assertUnified(root: string): Promise<{
	desktop: string;
	entries: { name: string; version: string }[];
	errors: string[];
}> {
	const desktop = readVersion(root, DESKTOP_PACKAGE);
	const entries = UNIFIED_PACKAGES.map((name) => ({
		name,
		version: readVersion(root, name),
	}));
	return { desktop, entries, errors: unifiedErrors(desktop, entries) };
}

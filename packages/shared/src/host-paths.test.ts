import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	BASE_SUPERSET_DIR_NAME,
	CANARY_SUPERSET_DIR_NAME,
	getSupersetDirName,
	hostManifestPath,
	isHostServiceManifest,
	isProcessAlive,
	LOCAL_HOST_SCOPE_ID,
	PERSONAL_SUPERSET_DIR_NAME,
	readHostManifest,
	resolveBuildChannel,
	resolveSupersetHomeDir,
	resolveWorkspaceName,
} from "./host-paths";

describe("resolveBuildChannel", () => {
	it("defaults to stable when unset or invalid", () => {
		expect(resolveBuildChannel({})).toBe("stable");
		expect(resolveBuildChannel({ SUPERSET_BUILD_CHANNEL: "nope" })).toBe(
			"stable",
		);
	});

	it("accepts known channels", () => {
		expect(resolveBuildChannel({ SUPERSET_BUILD_CHANNEL: "canary" })).toBe(
			"canary",
		);
		expect(resolveBuildChannel({ SUPERSET_BUILD_CHANNEL: "personal" })).toBe(
			"personal",
		);
	});
});

describe("resolveWorkspaceName", () => {
	it("treats the default workspace as unsuffixed", () => {
		expect(resolveWorkspaceName({})).toBeUndefined();
		expect(
			resolveWorkspaceName({ SUPERSET_WORKSPACE_NAME: "superset" }),
		).toBeUndefined();
	});

	it("normalizes and truncates custom names", () => {
		expect(resolveWorkspaceName({ SUPERSET_WORKSPACE_NAME: "My Repo!" })).toBe(
			"my-repo-",
		);
		expect(
			resolveWorkspaceName({ SUPERSET_WORKSPACE_NAME: "a".repeat(40) })?.length,
		).toBe(32);
	});
});

describe("getSupersetDirName", () => {
	it("isolates canary and personal from stable", () => {
		expect(getSupersetDirName("canary", {})).toBe(CANARY_SUPERSET_DIR_NAME);
		expect(getSupersetDirName("personal", {})).toBe(PERSONAL_SUPERSET_DIR_NAME);
		expect(getSupersetDirName("stable", {})).toBe(BASE_SUPERSET_DIR_NAME);
	});

	it("suffixes stable dev worktrees by workspace", () => {
		expect(
			getSupersetDirName("stable", { SUPERSET_WORKSPACE_NAME: "feature-x" }),
		).toBe(".superset-feature-x");
	});
});

describe("resolveSupersetHomeDir", () => {
	it("prefers an explicit SUPERSET_HOME_DIR", () => {
		expect(resolveSupersetHomeDir({ SUPERSET_HOME_DIR: "/tmp/custom" })).toBe(
			"/tmp/custom",
		);
	});

	it("derives the path from the build channel otherwise", () => {
		const resolved = resolveSupersetHomeDir({
			SUPERSET_BUILD_CHANNEL: "canary",
		});
		expect(resolved.endsWith(CANARY_SUPERSET_DIR_NAME)).toBe(true);
	});
});

describe("hostManifestPath", () => {
	it("points at host/<scope>/manifest.json under the home dir", () => {
		const env = { SUPERSET_HOME_DIR: "/tmp/home" };
		expect(hostManifestPath(LOCAL_HOST_SCOPE_ID, env)).toBe(
			`/tmp/home/host/${LOCAL_HOST_SCOPE_ID}/manifest.json`,
		);
	});
});

describe("isHostServiceManifest", () => {
	const valid = {
		pid: 123,
		endpoint: "http://127.0.0.1:48679",
		authToken: "token",
		startedAt: 1,
		organizationId: LOCAL_HOST_SCOPE_ID,
	};

	it("accepts a complete manifest", () => {
		expect(isHostServiceManifest(valid)).toBe(true);
	});

	it("rejects non-objects and missing or mistyped fields", () => {
		expect(isHostServiceManifest(null)).toBe(false);
		expect(isHostServiceManifest("nope")).toBe(false);
		expect(isHostServiceManifest({ ...valid, pid: "123" })).toBe(false);
		const { authToken: _omitted, ...withoutToken } = valid;
		expect(isHostServiceManifest(withoutToken)).toBe(false);
	});
});

describe("readHostManifest", () => {
	function homeWithManifest(contents: string): { SUPERSET_HOME_DIR: string } {
		const home = mkdtempSync(join(tmpdir(), "superset-host-paths-"));
		mkdirSync(join(home, "host", LOCAL_HOST_SCOPE_ID), { recursive: true });
		writeFileSync(
			join(home, "host", LOCAL_HOST_SCOPE_ID, "manifest.json"),
			contents,
		);
		return { SUPERSET_HOME_DIR: home };
	}

	it("returns null when the manifest is absent", () => {
		const home = mkdtempSync(join(tmpdir(), "superset-host-paths-"));
		expect(
			readHostManifest(LOCAL_HOST_SCOPE_ID, { SUPERSET_HOME_DIR: home }),
		).toBeNull();
	});

	it("returns null for malformed JSON or an invalid shape", () => {
		expect(
			readHostManifest(LOCAL_HOST_SCOPE_ID, homeWithManifest("{ not json")),
		).toBeNull();
		expect(
			readHostManifest(LOCAL_HOST_SCOPE_ID, homeWithManifest('{"pid":1}')),
		).toBeNull();
	});

	it("parses a valid manifest", () => {
		const manifest = {
			pid: 4242,
			endpoint: "http://127.0.0.1:48679",
			authToken: "secret",
			startedAt: 99,
			organizationId: LOCAL_HOST_SCOPE_ID,
		};
		const env = homeWithManifest(JSON.stringify(manifest));
		expect(readHostManifest(LOCAL_HOST_SCOPE_ID, env)).toEqual(manifest);
	});
});

describe("isProcessAlive", () => {
	it("recognizes the current process", () => {
		expect(isProcessAlive(process.pid)).toBe(true);
	});

	it("rejects invalid pids", () => {
		expect(isProcessAlive(0)).toBe(false);
		expect(isProcessAlive(-1)).toBe(false);
		expect(isProcessAlive(1.5)).toBe(false);
	});
});

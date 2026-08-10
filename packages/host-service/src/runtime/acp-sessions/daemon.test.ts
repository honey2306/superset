import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	acpDaemonBuildVersion,
	acpDaemonSocketPath,
	isActiveDaemonSession,
} from "./daemon";

const tempDirectories: string[] = [];

afterEach(() => {
	for (const directory of tempDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("isActiveDaemonSession", () => {
	test("keeps an unversioned daemon while a turn or permission is active", () => {
		expect(isActiveDaemonSession({ status: "starting" })).toBe(true);
		expect(isActiveDaemonSession({ status: "running" })).toBe(true);
		expect(isActiveDaemonSession({ status: "awaiting_permission" })).toBe(true);
	});

	test("allows an idle, offline, or dead legacy daemon to be replaced", () => {
		expect(isActiveDaemonSession({ status: "idle" })).toBe(false);
		expect(isActiveDaemonSession({ status: "offline" })).toBe(false);
		expect(isActiveDaemonSession({ status: "dead" })).toBe(false);
	});
});

describe("acpDaemonBuildVersion", () => {
	test("changes when the daemon script is rebuilt without a package version bump", () => {
		const directory = mkdtempSync(path.join(os.tmpdir(), "acp-build-"));
		tempDirectories.push(directory);
		const scriptPath = path.join(directory, "acp-daemon.js");
		writeFileSync(scriptPath, "old");
		const oldVersion = acpDaemonBuildVersion(scriptPath);

		writeFileSync(scriptPath, "new-build-with-bridges");

		expect(acpDaemonBuildVersion(scriptPath)).not.toBe(oldVersion);
	});
});

describe("acpDaemonSocketPath", () => {
	test("uses a private Unix-domain socket path", () => {
		const socketPath = acpDaemonSocketPath(
			"org-1",
			{ SUPERSET_HOME_DIR: "/tmp/home-a" },
			"darwin",
		);
		expect(socketPath).toContain("superset-acpd-");
		expect(socketPath.endsWith(".sock")).toBe(true);
	});

	test("uses a Windows named pipe", () => {
		expect(
			acpDaemonSocketPath("org-1", { SUPERSET_HOME_DIR: "C:\\home" }, "win32"),
		).toStartWith("\\\\.\\pipe\\superset-acpd-");
	});

	test("accepts an explicit socket override", () => {
		expect(
			acpDaemonSocketPath(
				"org-1",
				{ SUPERSET_ACP_DAEMON_SOCKET_PATH: "/tmp/explicit.sock" },
				"linux",
			),
		).toBe("/tmp/explicit.sock");
	});
});

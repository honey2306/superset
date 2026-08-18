import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	AcpDaemonClient,
	acpDaemonBuildVersion,
	acpDaemonSocketPath,
	isActiveDaemonSession,
	type RequestOperation,
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

describe("AcpDaemonClient reconnects", () => {
	test("retries a read interrupted by daemon replacement", async () => {
		const client = new AcpDaemonClient({
			organizationId: "org-1",
			spawnIfMissing: false,
		});
		const internals = client as unknown as {
			connect: () => Promise<void>;
			sendRequest: (op: RequestOperation, params: unknown) => Promise<unknown>;
		};
		let sends = 0;
		internals.connect = async () => {};
		internals.sendRequest = async () => {
			sends += 1;
			if (sends === 1) {
				throw Object.assign(new Error("ACP daemon disconnected"), {
					code: "ACP_DAEMON_DISCONNECTED",
				});
			}
			return { sessionId: "session-1" };
		};

		await client.get("session-1");

		expect(sends).toBe(2);
	});

	test("coalesces concurrent daemon compatibility checks before create", async () => {
		const client = new AcpDaemonClient({
			organizationId: "org-1",
			spawnIfMissing: false,
		});
		const internals = client as unknown as {
			connect: () => Promise<void>;
			replaceConnectedDaemonIfSafe: () => Promise<void>;
			sendRequest: (op: RequestOperation, params: unknown) => Promise<unknown>;
		};
		let releaseReplacement!: () => void;
		const replacementGate = new Promise<void>((resolve) => {
			releaseReplacement = resolve;
		});
		let replacementCalls = 0;
		let activeReplacements = 0;
		let maxActiveReplacements = 0;
		internals.connect = async () => {};
		internals.replaceConnectedDaemonIfSafe = async () => {
			replacementCalls += 1;
			activeReplacements += 1;
			maxActiveReplacements = Math.max(
				maxActiveReplacements,
				activeReplacements,
			);
			await replacementGate;
			activeReplacements -= 1;
		};
		internals.sendRequest = async () => ({ sessionId: "created" });

		const first = client.create({
			sessionId: "session-1",
			workspaceId: "workspace-1",
		});
		const second = client.create({
			sessionId: "session-2",
			workspaceId: "workspace-1",
		});
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(replacementCalls).toBe(1);
		expect(maxActiveReplacements).toBe(1);
		releaseReplacement();
		await Promise.all([first, second]);
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

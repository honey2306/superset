import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import path from "node:path";
import {
	ensurePeekabooCompanion,
	resolvePeekabooInstallation,
} from "./peekaboo-companion";

const home = "/Users/test";
const appPath = "/Applications/Peekaboo.app";
const executable = "/opt/homebrew/bin/peekaboo";
const bridgeSocket = path.join(
	home,
	"Library",
	"Application Support",
	"Peekaboo",
	"bridge.sock",
);

describe("Peekaboo companion", () => {
	const originalPlatform = process.platform;

	beforeEach(() => {
		// The companion is intentionally macOS-only. Exercise its supported
		// lifecycle in Linux CI without changing the production platform guard.
		Object.defineProperty(process, "platform", { value: "darwin" });
	});

	afterEach(() => {
		Object.defineProperty(process, "platform", { value: originalPlatform });
	});

	test("resolves the official app, CLI, and GUI bridge", () => {
		const existing = new Set([appPath, executable, bridgeSocket]);
		expect(
			resolvePeekabooInstallation({
				environment: { PATH: "/opt/homebrew/bin:/usr/bin" },
				homeDirectory: home,
				exists: (candidate) => existing.has(candidate),
			}),
		).toEqual({ executable, appPath, bridgeSocket });
	});

	test("finds Homebrew's standard path when a GUI PATH omits it", () => {
		const existing = new Set([appPath, executable, bridgeSocket]);
		expect(
			resolvePeekabooInstallation({
				environment: { PATH: "/usr/bin:/bin" },
				homeDirectory: home,
				exists: (candidate) => existing.has(candidate),
			}),
		).toEqual({ executable, appPath, bridgeSocket });
	});

	test("launches the app and waits for its bridge", async () => {
		const environment: NodeJS.ProcessEnv = {
			PATH: "/opt/homebrew/bin:/usr/bin",
		};
		const existing = new Set([appPath, executable]);
		const launches: string[] = [];
		const state = await ensurePeekabooCompanion(
			environment,
			{
				homeDirectory: home,
				exists: (candidate) => existing.has(candidate),
				launchApp: async (candidate) => {
					launches.push(candidate);
				},
				sleep: async () => {
					existing.add(bridgeSocket);
				},
			},
			1_000,
		);
		expect(state).toEqual({
			available: true,
			executable,
			appPath,
			bridgeSocket,
			launched: true,
		});
		expect(launches).toEqual([appPath]);
		expect(environment.SUPERSET_PEEKABOO_BRIDGE_SOCKET).toBe(bridgeSocket);
	});

	test("does not launch again when the bridge already exists", async () => {
		const launches: string[] = [];
		const state = await ensurePeekabooCompanion(
			{ PATH: "/opt/homebrew/bin:/usr/bin" },
			{
				homeDirectory: home,
				exists: (candidate) =>
					new Set([appPath, executable, bridgeSocket]).has(candidate),
				launchApp: async (candidate) => {
					launches.push(candidate);
				},
			},
		);
		expect(state.available).toBe(true);
		expect(state.launched).toBe(false);
		expect(launches).toEqual([]);
	});

	test("keeps Computer Use disabled when the app is not installed", async () => {
		const state = await ensurePeekabooCompanion(
			{ PATH: "/opt/homebrew/bin:/usr/bin" },
			{
				homeDirectory: home,
				exists: (candidate) => candidate === executable,
			},
		);
		expect(state).toEqual({
			available: false,
			launched: false,
			reason: "app-not-installed",
		});
	});

	test("keeps Computer Use disabled outside macOS", async () => {
		Object.defineProperty(process, "platform", { value: "linux" });

		const state = await ensurePeekabooCompanion();

		expect(state).toEqual({
			available: false,
			launched: false,
			reason: "app-not-installed",
		});
	});
});

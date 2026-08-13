import { afterEach, describe, expect, it, mock } from "bun:test";

mock.module("electron", () => ({
	app: {
		getName: () => process.env.SUPERSET_TEST_APP_NAME || "Superset",
		getVersion: () => "1.18.1",
		isPackaged: true,
	},
}));

const { isCanaryBuild, isPersonalBuild, shouldUseOfficialAutoUpdater } =
	await import("./build-channel");

afterEach(() => {
	delete process.env.SUPERSET_TEST_APP_NAME;
});

describe("isCanaryBuild", () => {
	it("selects the Canary channel for a Canary artifact with a stable version", () => {
		process.env.SUPERSET_TEST_APP_NAME = "Superset Canary";
		expect(isCanaryBuild()).toBe(true);
	});

	it("recognizes Personal builds and disables the official updater", () => {
		process.env.SUPERSET_TEST_APP_NAME = "Superset Personal";
		expect(isPersonalBuild()).toBe(true);
		expect(shouldUseOfficialAutoUpdater()).toBe(false);
	});

	it("keeps the official updater enabled for stable and Canary builds", () => {
		expect(shouldUseOfficialAutoUpdater()).toBe(true);
		process.env.SUPERSET_TEST_APP_NAME = "Superset Canary";
		expect(shouldUseOfficialAutoUpdater()).toBe(true);
	});
});

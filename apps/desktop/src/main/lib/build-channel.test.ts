import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";

const { isCanaryBuild, isPersonalBuild, shouldUseOfficialAutoUpdater } =
	await import("./build-channel");

beforeAll(() => {
	process.env.SUPERSET_TEST_APP_VERSION = "1.18.1";
	process.env.SUPERSET_TEST_APP_PACKAGED = "1";
});

afterEach(() => {
	delete process.env.SUPERSET_TEST_APP_NAME;
});

afterAll(() => {
	delete process.env.SUPERSET_TEST_APP_VERSION;
	delete process.env.SUPERSET_TEST_APP_PACKAGED;
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

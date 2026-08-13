import { describe, expect, it } from "bun:test";
import {
	CANARY_SUPERSET_DIR_NAME,
	getProtocolSchemeForBuild,
	getSupersetDirNameForApp,
	getSupersetDirNameForBuild,
	PERSONAL_PROTOCOL_SCHEME,
	PERSONAL_SUPERSET_DIR_NAME,
	SUPERSET_DIR_NAME,
} from "./constants";

describe("getSupersetDirNameForApp", () => {
	it("keeps Canary runtime data separate from the stable Superset directory", () => {
		expect(getSupersetDirNameForApp("Superset Canary")).toBe(
			CANARY_SUPERSET_DIR_NAME,
		);
	});

	it("keeps stable and development workspace directory names unchanged", () => {
		expect(getSupersetDirNameForApp("Superset")).toBe(SUPERSET_DIR_NAME);
	});

	it("uses a dedicated home directory for the Personal app", () => {
		expect(getSupersetDirNameForApp("Superset Personal")).toBe(
			PERSONAL_SUPERSET_DIR_NAME,
		);
	});
});

describe("getSupersetDirNameForBuild", () => {
	it("selects isolated directories without Electron app state", () => {
		expect(getSupersetDirNameForBuild("personal")).toBe(
			PERSONAL_SUPERSET_DIR_NAME,
		);
		expect(getSupersetDirNameForBuild("canary")).toBe(CANARY_SUPERSET_DIR_NAME);
	});
});

describe("getProtocolSchemeForBuild", () => {
	it("keeps Personal deep links from registering the stable protocol", () => {
		expect(getProtocolSchemeForBuild("personal", "")).toBe(
			PERSONAL_PROTOCOL_SCHEME,
		);
	});

	it("preserves the stable and Canary protocols", () => {
		expect(getProtocolSchemeForBuild("stable", "")).toBe("superset");
		expect(getProtocolSchemeForBuild("canary", "")).toBe("superset");
	});
});

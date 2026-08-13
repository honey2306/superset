import { describe, expect, it } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { getSupersetDirNameForBuild } from "shared/constants";
import { getBuildChannel } from "shared/env.shared";

const configuredHomeDir = process.env.SUPERSET_HOME_DIR;
const { SUPERSET_HOME_DIR } = await import("./app-environment");

describe("SUPERSET_HOME_DIR", () => {
	it("uses the configured build home directory without loading Electron", () => {
		expect(SUPERSET_HOME_DIR).toBe(
			configuredHomeDir ??
				join(homedir(), getSupersetDirNameForBuild(getBuildChannel())),
		);
		expect(process.env.SUPERSET_HOME_DIR).toBe(SUPERSET_HOME_DIR);
	});
});

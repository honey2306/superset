import { describe, expect, test } from "bun:test";
import { patchPiAcpBundle } from "./pi-acp-bundle";

const piAcp033 = `
const args = ["--mode", "rpc", "--no-themes"];
const quietStartup = getQuietStartup(params.cwd);
function buildUpdateNotice() {
  spawnSync("npm", ["view"]);
  return null;
}
function buildStartupInfo() {}
`;

describe("patchPiAcpBundle", () => {
	test("removes synchronous upgrade work and makes extension skipping opt-in", () => {
		const patched = patchPiAcpBundle(piAcp033);
		expect(patched).toContain("SUPERSET_PI_ACP_UPDATE_NOTICE");
		expect(patched).not.toContain('spawnSync("npm"');
		expect(patched).toContain("SUPERSET_PI_ACP_QUIET_STARTUP");
		expect(patched).toContain("SUPERSET_PI_ACP_DISABLE_EXTENSIONS");
		expect(patched).toContain("SUPERSET_PI_ACP_MCP_EXTENSION");
		expect(patched).toContain('["--extension", process.env.');
	});

	test("fails closed when pi-acp changes its patch points", () => {
		expect(() => patchPiAcpBundle("export {};")).toThrow(
			"Unsupported pi-acp bundle",
		);
	});
});

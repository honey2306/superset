import { describe, expect, test } from "bun:test";
import { computerUseMcpServer } from "./computer-use-local-mcp";

describe("computerUseMcpServer", () => {
	test("builds a session-scoped Electron-as-Node MCP declaration", () => {
		expect(
			computerUseMcpServer({
				sessionId: "session-42",
				execPath: "/Applications/Superset.app/Contents/MacOS/Superset",
				scriptPath: "/opt/computer-use-mcp.js",
			}),
		).toEqual({
			name: "desktop-control",
			command: "/Applications/Superset.app/Contents/MacOS/Superset",
			args: ["/opt/computer-use-mcp.js"],
			env: [
				{ name: "ELECTRON_RUN_AS_NODE", value: "1" },
				{
					name: "SUPERSET_ACP_SOURCE_SESSION_ID",
					value: "session-42",
				},
			],
		});
	});
});

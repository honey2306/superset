import { describe, expect, test } from "bun:test";
import { supersetMcpServer } from "./superset-local-mcp";

describe("supersetMcpServer", () => {
	test("scopes the stdio server to its source session and daemon", () => {
		expect(
			supersetMcpServer({
				sessionId: "session-1",
				daemonSocketPath: "/tmp/acp.sock",
				execPath: "/usr/bin/node",
				scriptPath: "/app/superset-mcp.js",
			}),
		).toEqual({
			name: "superset",
			command: "/usr/bin/node",
			args: ["/app/superset-mcp.js"],
			env: [
				{ name: "ELECTRON_RUN_AS_NODE", value: "1" },
				{
					name: "SUPERSET_ACP_DAEMON_SOCKET_PATH",
					value: "/tmp/acp.sock",
				},
				{
					name: "SUPERSET_ACP_SOURCE_SESSION_ID",
					value: "session-1",
				},
			],
		});
	});
});

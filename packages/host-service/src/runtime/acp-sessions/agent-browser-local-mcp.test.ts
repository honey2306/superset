import { describe, expect, test } from "bun:test";
import { agentBrowserMcpServer } from "./agent-browser-local-mcp";

describe("agentBrowserMcpServer", () => {
	test("binds one MCP process to one ACP session", () => {
		expect(
			agentBrowserMcpServer({
				sessionId: "session-1",
				daemonSocketPath: "/tmp/acp.sock",
				execPath: "/opt/node",
				scriptPath: "/opt/agent-browser-mcp.js",
			}),
		).toEqual({
			name: "agent-browser",
			command: "/opt/node",
			args: ["/opt/agent-browser-mcp.js"],
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

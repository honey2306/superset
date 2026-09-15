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

test("the lifecycle MCP exposes keep, close and tabs alongside the official browser tools", async () => {
	const server = agentBrowserMcpServer({
		sessionId: "s",
		daemonSocketPath: "/tmp/unused-browser-test.sock",
		execPath: process.execPath,
		scriptPath: `${import.meta.dir}/agent-browser-mcp.ts`,
		lifecycleOnly: true,
	});
	if (!("command" in server)) throw new Error("Expected stdio MCP");
	const child = Bun.spawn([server.command, ...server.args], {
		env: {
			...process.env,
			...Object.fromEntries(
				server.env.map((entry) => [entry.name, entry.value]),
			),
		},
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
	});
	child.stdin.write(
		`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })}\n`,
	);
	child.stdin.end();
	const [stdout, stderr, code] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	expect(code, stderr).toBe(0);
	const response = JSON.parse(stdout) as {
		result: { tools: Array<{ name: string }> };
	};
	expect(response.result.tools.map((tool) => tool.name)).toEqual([
		"browser_tabs",
		"browser_close",
		"browser_keep_open",
	]);
});

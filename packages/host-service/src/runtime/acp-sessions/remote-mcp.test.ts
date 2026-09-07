import { describe, expect, it } from "bun:test";
import type { McpServer } from "@agentclientprotocol/sdk";
import {
	prepareRemoteMcpServersForHarness,
	remoteMcpProxyServer,
} from "./remote-mcp";

const remote: McpServer = {
	type: "http",
	name: "docs",
	url: "https://mcp.example.com/api",
	headers: [{ name: "Authorization", value: "Bearer test" }],
};

describe("remote MCP harness compatibility", () => {
	it("passes native remote transport to Claude", () => {
		expect(
			prepareRemoteMcpServersForHarness([remote], "claude-agent-acp"),
		).toEqual([remote]);
	});

	it("uses the bundled stdio bridge for harnesses without remote support", () => {
		const [server] = prepareRemoteMcpServersForHarness(
			[remote],
			"myflicker-acp",
			{ execPath: "/app/electron", scriptPath: "/app/remote-mcp-proxy.js" },
		);
		expect(server).toEqual({
			name: "docs",
			command: "/app/electron",
			args: [
				"/app/remote-mcp-proxy.js",
				"https://mcp.example.com/api",
				"--transport",
				"http-only",
				"--header",
				"Authorization:Bearer test",
			],
			env: [{ name: "ELECTRON_RUN_AS_NODE", value: "1" }],
		});
	});

	it("maps SSE to the proxy's strict SSE strategy", () => {
		const server = remoteMcpProxyServer(
			{ ...remote, type: "sse" },
			{ execPath: "node", scriptPath: "proxy.js" },
		);
		expect("args" in server ? server.args : []).toContain("sse-only");
	});
});

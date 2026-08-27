import { expect, test } from "bun:test";
import type { McpServer } from "@agentclientprotocol/sdk";
import {
	BROWSER_USE_MCP_TOOLS,
	prepareSharedMcpServers,
} from "./browser-use-mcp";
import { LAZY_MCP_CONFIG_ENV } from "./lazy-mcp";

const browserUse: McpServer = {
	name: "browser-use",
	command: "/opt/browser-use",
	args: ["--cli-mcp"],
	env: [],
};

const ordinary: McpServer = {
	name: "ordinary",
	command: "/opt/ordinary-mcp",
	args: [],
	env: [],
};

test("prepares Browser Use through the same lazy declaration for every harness", () => {
	const [wrapped, unchanged] = prepareSharedMcpServers([browserUse, ordinary], {
		execPath: "/usr/bin/node",
		scriptPath: "/app/lazy-mcp-proxy.js",
	});

	expect(wrapped).toMatchObject({
		name: "browser-use",
		command: "/usr/bin/node",
		args: ["/app/lazy-mcp-proxy.js"],
	});
	if (!wrapped || !("command" in wrapped))
		throw new Error("Expected wrapped stdio MCP server");
	const config = JSON.parse(
		wrapped.env.find(({ name }) => name === LAZY_MCP_CONFIG_ENV)?.value ??
			"null",
	);
	expect(config).toMatchObject({
		upstream: browserUse,
		tools: BROWSER_USE_MCP_TOOLS,
	});
	expect(unchanged).toBe(ordinary);
});

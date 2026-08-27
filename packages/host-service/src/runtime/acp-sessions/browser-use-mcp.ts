import type { McpServer } from "@agentclientprotocol/sdk";
import {
	type LazyMcpWrapOptions,
	wrapMcpServerForLazyStartup,
} from "./lazy-mcp";
import type { McpTool } from "./stdio-mcp-client";

export const BROWSER_USE_MCP_TOOLS: readonly McpTool[] = [
	{
		name: "browser_exec",
		description:
			"Execute Python in the browser-harness session. Helpers like new_tab(url), goto_url(url), page_info(), click_at_xy(x, y), type_text(text), js(code), cdp(method, ...), wait_for_load(), list_tabs() are pre-imported. The namespace persists across calls. Returns whatever the code prints. First navigation should be new_tab(url).",
		inputSchema: {
			type: "object",
			properties: {
				code: { type: "string", description: "Python code to execute" },
			},
			required: ["code"],
		},
	},
	{
		name: "browser_screenshot",
		description:
			"Capture the current page and return it as an image. Prefer this over capture_screenshot() in browser_exec.",
		inputSchema: {
			type: "object",
			properties: {
				full: {
					type: "boolean",
					description: "Capture beyond the viewport (full page)",
					default: false,
				},
				max_dim: {
					type: "integer",
					minimum: 1,
					description:
						"Downscale so no side exceeds this many pixels (e.g. 1800 for 2x displays)",
				},
			},
		},
	},
];

export function isBrowserUseMcpServer(
	server: McpServer,
): server is Extract<McpServer, { command: string }> {
	return (
		server.name === "browser-use" &&
		"command" in server &&
		typeof server.command === "string" &&
		server.args.includes("--cli-mcp")
	);
}

/** Apply manifest-backed startup policies before any ACP harness sees MCPs. */
export function prepareSharedMcpServers(
	servers: readonly McpServer[],
	options: LazyMcpWrapOptions = {},
): McpServer[] {
	return servers.map((server) =>
		isBrowserUseMcpServer(server)
			? wrapMcpServerForLazyStartup(server, BROWSER_USE_MCP_TOOLS, options)
			: server,
	);
}

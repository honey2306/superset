import { describe, expect, test } from "bun:test";
import {
	EXCLUDED_PEEKABOO_TOOLS,
	exposePeekabooTools,
	peekabooToolName,
	rewriteComputerUseRequest,
	rewritePeekabooResponse,
} from "./peekaboo-mcp-proxy";

const UPSTREAM_TOOL_NAMES = [
	"press",
	"click",
	"type",
	"permissions",
	"window",
	"menu",
	"paste",
	"analyze",
	"clipboard",
	"action",
	"move",
	"space",
	"sleep",
	"see",
	"set_value",
	"browser",
	"dock",
	"dialog",
	"verify_state",
	"image",
	"capture",
	"scroll",
	"app",
	"inspect_ui",
	"agent",
	"drag",
] as const;

describe("Peekaboo MCP proxy", () => {
	test("exposes every deterministic native tool with a computer_ prefix", () => {
		const result = exposePeekabooTools({
			tools: UPSTREAM_TOOL_NAMES.map((name) => ({
				name,
				description: `${name} description`,
				inputSchema: {
					type: "object",
					properties: { marker: { const: name } },
				},
			})),
		}) as {
			tools: Array<{
				name: string;
				inputSchema: Record<string, unknown>;
			}>;
		};

		expect(result.tools.map((tool) => tool.name)).toEqual(
			UPSTREAM_TOOL_NAMES.filter(
				(name) => !EXCLUDED_PEEKABOO_TOOLS.has(name),
			).map((name) => `computer_${name}`),
		);
		expect(
			result.tools.find((tool) => tool.name === "computer_window")?.inputSchema,
		).toEqual({
			type: "object",
			properties: { marker: { const: "window" } },
		});
	});

	test("excludes only agent loop, model analyze, and browser handoff", () => {
		expect([...EXCLUDED_PEEKABOO_TOOLS].sort()).toEqual([
			"agent",
			"analyze",
			"browser",
		]);
		for (const name of EXCLUDED_PEEKABOO_TOOLS) {
			expect(peekabooToolName(`computer_${name}`)).toBeNull();
		}
	});

	test("maps tool calls back to the original Peekaboo name without changing arguments", () => {
		const arguments_ = {
			action: "set-bounds",
			app: "Finder",
			x: 10,
			y: 20,
			width: 800,
			height: 600,
		};
		const rewritten = rewriteComputerUseRequest({
			jsonrpc: "2.0",
			id: 7,
			method: "tools/call",
			params: { name: "computer_window", arguments: arguments_ },
		});
		expect(rewritten).toEqual({
			request: {
				jsonrpc: "2.0",
				id: 7,
				method: "tools/call",
				params: { name: "window", arguments: arguments_ },
			},
			upstreamMethod: "tools/call",
		});
	});

	test("rejects bypass attempts and non-prefixed tool names", () => {
		for (const name of [
			"agent",
			"computer_agent",
			"browser",
			"computer_browser",
		]) {
			expect(() =>
				rewriteComputerUseRequest({
					jsonrpc: "2.0",
					id: 1,
					method: "tools/call",
					params: { name, arguments: {} },
				}),
			).toThrow("not allowed");
		}
	});

	test("rewrites initialize identity while retaining upstream capabilities", () => {
		const response = rewritePeekabooResponse(
			{
				jsonrpc: "2.0",
				id: 1,
				result: {
					protocolVersion: "2024-11-05",
					capabilities: { tools: { listChanged: true } },
					serverInfo: { name: "peekaboo-mcp", version: "4.3.1" },
				},
			},
			"initialize",
		) as { result: Record<string, unknown> };
		expect(response.result.serverInfo).toEqual({
			name: "superset-computer-use",
			version: "4.3.1",
		});
		expect(response.result.capabilities).toEqual({
			tools: { listChanged: true },
		});
	});
});

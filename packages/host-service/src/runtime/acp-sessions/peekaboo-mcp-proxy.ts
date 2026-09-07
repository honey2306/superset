import type { ChildProcessWithoutNullStreams } from "node:child_process";

export const EXCLUDED_PEEKABOO_TOOLS = new Set(["agent", "analyze", "browser"]);

export const COMPUTER_USE_TOOL_PREFIX = "computer_";

interface JsonRpcRequest {
	jsonrpc: "2.0";
	id?: string | number;
	method: string;
	params?: unknown;
}

interface JsonRpcResponse {
	jsonrpc: "2.0";
	id?: string | number | null;
	result?: unknown;
	error?: unknown;
}

interface PeekabooTool {
	name: string;
	description?: string;
	inputSchema: Record<string, unknown>;
	[key: string]: unknown;
}

function record(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

export function exposedComputerToolName(peekabooName: string): string {
	return `${COMPUTER_USE_TOOL_PREFIX}${peekabooName}`;
}

export function peekabooToolName(exposedName: string): string | null {
	if (!exposedName.startsWith(COMPUTER_USE_TOOL_PREFIX)) return null;
	const name = exposedName.slice(COMPUTER_USE_TOOL_PREFIX.length);
	if (!name || EXCLUDED_PEEKABOO_TOOLS.has(name)) return null;
	return name;
}

export function exposePeekabooTools(value: unknown): unknown {
	const result = record(value);
	if (!result || !Array.isArray(result.tools)) return value;
	return {
		...result,
		tools: result.tools.flatMap((candidate) => {
			const tool = record(candidate) as PeekabooTool | null;
			if (!tool || typeof tool.name !== "string") return [];
			if (EXCLUDED_PEEKABOO_TOOLS.has(tool.name)) return [];
			return [
				{
					...tool,
					name: exposedComputerToolName(tool.name),
					description: tool.description
						? `${tool.description}\n\nProvided by Peekaboo through Superset Computer Use.`
						: "Provided by Peekaboo through Superset Computer Use.",
				},
			];
		}),
	};
}

export function rewriteComputerUseRequest(request: JsonRpcRequest): {
	request: JsonRpcRequest;
	upstreamMethod?: string;
} {
	if (request.method !== "tools/call") {
		return {
			request,
			...(request.id !== undefined ? { upstreamMethod: request.method } : {}),
		};
	}
	const params = record(request.params);
	const exposedName = params?.name;
	if (typeof exposedName !== "string") {
		throw new Error("Computer Use tool name is required");
	}
	const name = peekabooToolName(exposedName);
	if (!name)
		throw new Error(`Computer Use tool is not allowed: ${exposedName}`);
	return {
		request: {
			...request,
			params: { ...params, name },
		},
		...(request.id !== undefined ? { upstreamMethod: request.method } : {}),
	};
}

const COMPUTER_USE_INSTRUCTIONS = [
	"Superset exposes Peekaboo's deterministic macOS automation tools with a computer_ prefix.",
	"Use computer_see or computer_inspect_ui before element-based actions and preserve returned opaque element and snapshot identifiers exactly.",
	"Website content belongs in Superset Agent Browser/CDP, not these native desktop tools.",
	"Peekaboo's autonomous agent loop, AI analyze tool, and browser bridge are intentionally excluded.",
	"Computer Use results include plain-text execution status. An error with a dispatched/unconfirmed operation requires readback, not repeating the action. Use computer_verify_state for the intended postcondition; do not claim success from delivery alone.",
	"Prefer exact accessible document windows. App-targeted computer_press resolves an AX window; foreground=true focuses the app and checks its active document before exact-window key delivery. Explicit snapshot and title/index selectors retain Peekaboo behavior.",
	"When screenshot and Accessibility bounds disagree (such as a Stage Manager thumbnail), restore/focus the target and take a new computer_see snapshot before coordinate input. Never reuse the old coordinates after restoration. If a fresh observation still disagrees, stop and report the mismatch.",
	"For semantic commands such as Save, inspect computer_menu list and prefer the observed exact menu path over raw keyboard chords. Default background menu access avoids unnecessary focus transitions. Confirm the intended document first, and verify completion (for Save, persisted content), not only AX text or key delivery. After an input invalidates a snapshot, obtain a fresh observation before another element action.",
	"computer_window restore/focus recovers known Peekaboo window-identity failures through one activation of the pinned process and verifies stable exact-window bounds. computer_verify_state polls structured Accessibility state for the requested window; satisfied requires stable matching samples, and unknown/unsatisfied are not success.",
].join(" ");

export function rewritePeekabooResponse(
	response: JsonRpcResponse,
	upstreamMethod: string | undefined,
): JsonRpcResponse {
	if (upstreamMethod === "tools/list" && response.result !== undefined) {
		return { ...response, result: exposePeekabooTools(response.result) };
	}
	if (upstreamMethod === "initialize") {
		const result = record(response.result);
		if (!result) return response;
		return {
			...response,
			result: {
				...result,
				serverInfo: {
					name: "superset-computer-use",
					version: record(result.serverInfo)?.version ?? "1",
				},
				instructions: [result.instructions, COMPUTER_USE_INSTRUCTIONS]
					.filter((value): value is string => typeof value === "string")
					.join("\n\n"),
			},
		};
	}
	return response;
}

export function jsonRpcError(
	id: string | number | null,
	message: string,
): JsonRpcResponse {
	return {
		jsonrpc: "2.0",
		id,
		error: { code: -32602, message },
	};
}

export function closePeekabooChild(
	child: ChildProcessWithoutNullStreams,
): void {
	child.stdin.end();
	const timeout = setTimeout(() => child.kill("SIGTERM"), 1_500);
	timeout.unref();
	child.once("exit", () => clearTimeout(timeout));
}

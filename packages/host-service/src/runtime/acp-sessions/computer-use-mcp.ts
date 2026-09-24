import { createInterface } from "node:readline";
import {
	ComputerRuntimeBridgeClient,
	type ComputerRuntimePermissionState,
	type ComputerRuntimeTool,
	type ComputerRuntimeToolResult,
} from "./computer-runtime-bridge-client";

type JsonRecord = Record<string, unknown>;

interface JsonRpcMessage {
	jsonrpc: "2.0";
	id?: string | number | null;
	method?: string;
	params?: unknown;
	result?: unknown;
	error?: unknown;
}

interface PublicToolMapping {
	publicName: string;
	providerName: string;
}

const PROTOCOL_VERSION = "2025-06-18";
const PUBLIC_TOOL_PREFIX = "computer_";
const SOURCE_SESSION_ID = process.env.SUPERSET_ACP_SOURCE_SESSION_ID;
const bridge = new ComputerRuntimeBridgeClient();
const activeCalls = new Map<string | number, AbortController>();

const TOOL_MAPPINGS: PublicToolMapping[] = [
	{ publicName: "apps", providerName: "list_apps" },
	{ publicName: "windows", providerName: "list_windows" },
	{ publicName: "see", providerName: "get_window_state" },
	{ publicName: "inspect_ui", providerName: "get_accessibility_tree" },
	{ publicName: "capture", providerName: "get_desktop_state" },
	{ publicName: "verify_state", providerName: "verify_state" },
	{ publicName: "launch_app", providerName: "launch_app" },
	{ publicName: "kill_app", providerName: "kill_app" },
	{ publicName: "focus_window", providerName: "bring_to_front" },
	{ publicName: "set_window_frame", providerName: "set_window_frame" },
	{ publicName: "menu", providerName: "invoke_menu" },
	{ publicName: "click", providerName: "click" },
	{ publicName: "double_click", providerName: "double_click" },
	{ publicName: "right_click", providerName: "right_click" },
	{ publicName: "drag", providerName: "drag" },
	{ publicName: "type", providerName: "type_text" },
	{ publicName: "press", providerName: "press_key" },
	{ publicName: "hotkey", providerName: "hotkey" },
	{ publicName: "set_value", providerName: "set_value" },
	{ publicName: "scroll", providerName: "scroll" },
	{ publicName: "clipboard_read", providerName: "clipboard_read" },
	{ publicName: "clipboard_write", providerName: "clipboard_write" },
	{ publicName: "screen_size", providerName: "get_screen_size" },
	{ publicName: "cursor", providerName: "get_cursor_position" },
	{ publicName: "move", providerName: "move_cursor" },
	{ publicName: "zoom", providerName: "zoom" },
	{ publicName: "window", providerName: "superset_window" },
	{ publicName: "space", providerName: "superset_space" },
	{ publicName: "dock", providerName: "superset_dock" },
	{ publicName: "app", providerName: "superset_app" },
	{ publicName: "paste", providerName: "superset_paste" },
	{ publicName: "dialog", providerName: "superset_dialog" },
	{ publicName: "action", providerName: "superset_action" },
];

const PUBLIC_TO_PROVIDER = new Map(
	TOOL_MAPPINGS.map(({ publicName, providerName }) => [
		`${PUBLIC_TOOL_PREFIX}${publicName}`,
		providerName,
	]),
);

function record(value: unknown): JsonRecord | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as JsonRecord)
		: null;
}

function rpcError(
	id: string | number | null,
	code: number,
	message: string,
): JsonRpcMessage {
	return {
		jsonrpc: "2.0",
		id,
		error: { code, message },
	};
}

function send(message: JsonRpcMessage): void {
	process.stdout.write(`${JSON.stringify(message)}\n`);
}

function cloneSchema(schema: JsonRecord): JsonRecord {
	return JSON.parse(JSON.stringify(schema)) as JsonRecord;
}

function sanitizeInputSchema(schema: JsonRecord): JsonRecord {
	const next = cloneSchema(schema);
	const properties = record(next.properties);
	if (properties) {
		delete properties.session;
	}
	if (Array.isArray(next.required)) {
		next.required = next.required.filter((name) => name !== "session");
	}
	return next;
}

function publicTool(tool: ComputerRuntimeTool, publicName: string): JsonRecord {
	return {
		name: `${PUBLIC_TOOL_PREFIX}${publicName}`,
		...(tool.description
			? {
					description: `${tool.description}\n\nExecuted by Superset Computer Runtime. The provider is an implementation detail; preserve snapshot/element tokens exactly and verify consequential state changes.`,
				}
			: {
					description:
						"Executed by Superset Computer Runtime. Preserve observation handles exactly and verify consequential state changes.",
				}),
		inputSchema: sanitizeInputSchema(tool.inputSchema),
		...(tool.outputSchema
			? { outputSchema: cloneSchema(tool.outputSchema) }
			: {}),
		...(tool.annotations ? { annotations: tool.annotations } : {}),
	};
}

function permissionTool(): JsonRecord {
	return {
		name: "computer_permissions",
		description:
			"Inspect desktop automation permissions owned by Superset. On macOS, set prompt=true only when the user has asked to enable Computer Use or a previous call reports missing Accessibility or Screen Recording permission.",
		inputSchema: {
			type: "object",
			additionalProperties: false,
			properties: {
				prompt: {
					type: "boolean",
					description:
						"Request missing host permissions. Default false for a read-only status check.",
				},
			},
		},
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
	};
}

async function listPublicTools(signal?: AbortSignal): Promise<JsonRecord[]> {
	const catalog = await bridge.tools(signal);
	const byName = new Map(catalog.tools.map((tool) => [tool.name, tool]));
	const tools = TOOL_MAPPINGS.flatMap(({ publicName, providerName }) => {
		const tool = byName.get(providerName);
		return tool ? [publicTool(tool, publicName)] : [];
	});
	return [...tools, permissionTool()];
}

function structuredContent(
	result: ComputerRuntimeToolResult,
): JsonRecord | undefined {
	if (!result.structuredJson) return undefined;
	try {
		const value = JSON.parse(result.structuredJson) as unknown;
		return record(value) ?? { value };
	} catch {
		return { raw: result.structuredJson };
	}
}

function toMcpToolResult(
	generation: number,
	result: ComputerRuntimeToolResult,
): JsonRecord {
	const content: JsonRecord[] = [];
	if (result.text) content.push({ type: "text", text: result.text });
	for (const image of result.images) {
		content.push({
			type: "image",
			data: image.dataBase64,
			mimeType: image.mimeType,
		});
	}
	if (content.length === 0 && result.isError) {
		content.push({
			type: "text",
			text: result.errorCode
				? `Computer Use failed: ${result.errorCode}`
				: "Computer Use failed.",
		});
	}
	const structured = structuredContent(result);
	return {
		content,
		...(structured ? { structuredContent: structured } : {}),
		isError: result.isError,
		_meta: {
			supersetComputer: {
				generation,
				provider: "desktop-runtime",
				degraded: result.degraded,
				...(result.errorCode ? { errorCode: result.errorCode } : {}),
				...(result.action ? { action: result.action } : {}),
				...(result.verification ? { verification: result.verification } : {}),
			},
		},
	};
}

function permissionResult(state: ComputerRuntimePermissionState): JsonRecord {
	return {
		content: [
			{
				type: "text",
				text: state.ready
					? "Superset Computer Use permissions are ready."
					: "Superset Computer Use is missing required host permissions. Enable the reported permission in system settings, then retry the observation. A relaunch may be required after Screen Recording changes.",
			},
		],
		structuredContent: { ...state },
		isError: false,
	};
}

async function handleToolCall(
	id: string | number,
	params: JsonRecord,
): Promise<void> {
	const name = params.name;
	if (typeof name !== "string") {
		send(rpcError(id, -32602, "Computer Use tool name is required"));
		return;
	}
	const args = record(params.arguments) ?? {};
	const controller = new AbortController();
	activeCalls.set(id, controller);
	try {
		if (name === "computer_permissions") {
			const state = await bridge.permissions(
				args.prompt === true,
				controller.signal,
			);
			send({
				jsonrpc: "2.0",
				id,
				result: permissionResult(state),
			});
			return;
		}

		const providerName = PUBLIC_TO_PROVIDER.get(name);
		if (!providerName) {
			send(rpcError(id, -32602, `Computer Use tool is not allowed: ${name}`));
			return;
		}
		if (!SOURCE_SESSION_ID) {
			send(
				rpcError(id, -32603, "Computer Use session identity is unavailable"),
			);
			return;
		}

		const execution = await bridge.callTool(
			SOURCE_SESSION_ID,
			providerName,
			args,
			controller.signal,
		);
		send({
			jsonrpc: "2.0",
			id,
			result: toMcpToolResult(execution.generation, execution.result),
		});
	} catch (error) {
		send({
			jsonrpc: "2.0",
			id,
			result: {
				content: [
					{
						type: "text",
						text: error instanceof Error ? error.message : String(error),
					},
				],
				isError: true,
			},
		});
	} finally {
		activeCalls.delete(id);
	}
}

createInterface({
	input: process.stdin,
	crlfDelay: Number.POSITIVE_INFINITY,
}).on("line", (line) => {
	if (!line) return;
	let message: JsonRpcMessage;
	try {
		message = JSON.parse(line) as JsonRpcMessage;
	} catch {
		send(rpcError(null, -32700, "Parse error"));
		return;
	}

	if (message.method === "notifications/initialized") return;
	if (message.method === "notifications/cancelled") {
		const requestId = record(message.params)?.requestId;
		if (
			(typeof requestId === "string" || typeof requestId === "number") &&
			activeCalls.has(requestId)
		) {
			activeCalls.get(requestId)?.abort();
		}
		return;
	}
	if (message.id === undefined || message.id === null) return;

	const id = message.id;
	if (message.method === "initialize") {
		const requested = record(message.params)?.protocolVersion;
		send({
			jsonrpc: "2.0",
			id,
			result: {
				protocolVersion:
					typeof requested === "string" ? requested : PROTOCOL_VERSION,
				capabilities: { tools: {} },
				serverInfo: { name: "superset-computer-runtime", version: "1" },
				instructions:
					"Superset owns the desktop Computer Use runtime and coordinates the physical desktop across agents. Observe before element-based actions, preserve snapshot/element handles exactly, prefer semantic accessibility actions when available, and verify consequential changes. Website tasks belong in Superset Agent Browser rather than desktop Computer Use.",
			},
		});
		return;
	}
	if (message.method === "tools/list") {
		const controller = new AbortController();
		activeCalls.set(id, controller);
		void listPublicTools(controller.signal)
			.then((tools) => {
				send({
					jsonrpc: "2.0",
					id,
					result: { tools },
				});
			})
			.catch((error) => {
				send(
					rpcError(
						id,
						-32603,
						error instanceof Error ? error.message : String(error),
					),
				);
			})
			.finally(() => activeCalls.delete(id));
		return;
	}
	if (message.method === "tools/call") {
		const params = record(message.params);
		if (!params) {
			send(rpcError(id, -32602, "Invalid tools/call params"));
			return;
		}
		void handleToolCall(id, params);
		return;
	}

	send(rpcError(id, -32601, `Method not found: ${message.method ?? ""}`));
});

const close = () => {
	for (const controller of activeCalls.values()) controller.abort();
};
process.once("SIGTERM", close);
process.once("SIGINT", close);
process.stdin.once("end", close);

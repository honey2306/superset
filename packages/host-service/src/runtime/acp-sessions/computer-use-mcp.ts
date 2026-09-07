import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import {
	peekabooBridgeArguments,
	resolvePeekabooBridgeSocket,
} from "./peekaboo-bridge";
import { resolvePeekabooExecutable } from "./peekaboo-executable";
import {
	closePeekabooChild,
	jsonRpcError,
	rewriteComputerUseRequest,
	rewritePeekabooResponse,
} from "./peekaboo-mcp-proxy";
import { createNativeStateReader } from "./peekaboo-native-state";
import { PeekabooToolExecutor } from "./peekaboo-tool-executor";
import type { McpToolResult } from "./stdio-mcp-client";

interface JsonRpcMessage {
	jsonrpc: "2.0";
	id?: string | number | null;
	method?: string;
	params?: unknown;
	result?: unknown;
	error?: unknown;
}

const executable = resolvePeekabooExecutable();
if (!executable) {
	process.stderr.write(
		"Superset Computer Use requires a pinned Peekaboo binary. Set SUPERSET_PEEKABOO_PATH or install peekaboo on PATH.\n",
	);
	process.exit(1);
}

const child = spawn(
	executable,
	peekabooBridgeArguments(resolvePeekabooBridgeSocket()),
	{
		stdio: ["pipe", "pipe", "pipe"],
		env: {
			...process.env,
			// Filter before Peekaboo initializes its MCP context. Output-side
			// filtering is too late because `browser` opens a browser session while
			// the upstream server is being constructed.
			PEEKABOO_DISABLE_TOOLS: "agent,analyze,browser",
		},
	},
);
const pendingMethods = new Map<string | number, string>();
const internalCalls = new Map<string, (response: JsonRpcMessage) => void>();
const activeCalls = new Map<string | number, AbortController>();
const internalIdPrefix = `superset-${randomUUID()}-`;
let toolQueue = Promise.resolve();
const executor = new PeekabooToolExecutor(
	(name, args, signal) => {
		return new Promise<McpToolResult>((resolve, reject) => {
			const id = `${internalIdPrefix}${randomUUID()}`;
			const cleanup = () => {
				clearTimeout(timeout);
				internalCalls.delete(id);
				signal?.removeEventListener("abort", cancel);
			};
			const cancel = () => {
				cleanup();
				if (!child.stdin.destroyed)
					child.stdin.write(
						`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: id } })}\n`,
					);
				reject(
					new Error(
						"Computer Use call cancelled; an in-flight action may have taken effect. Observe before retrying.",
					),
				);
			};
			const timeout = setTimeout(cancel, 120_000);
			if (signal?.aborted) {
				cancel();
				return;
			}
			signal?.addEventListener("abort", cancel, { once: true });
			internalCalls.set(id, (response) => {
				cleanup();
				if (response.error !== undefined)
					reject(new Error(JSON.stringify(response.error)));
				else if (response.result && typeof response.result === "object")
					resolve(response.result as McpToolResult);
				else reject(new Error("Invalid Peekaboo tool result"));
			});
			child.stdin.write(
				`${JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } })}\n`,
			);
		});
	},
	createNativeStateReader(executable, resolvePeekabooBridgeSocket()),
);
let stderr = "";

child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk: string) => {
	stderr = `${stderr}${chunk}`.slice(-8_000);
});

createInterface({
	input: process.stdin,
	crlfDelay: Number.POSITIVE_INFINITY,
}).on("line", (line) => {
	if (!line) return;
	let message: JsonRpcMessage;
	try {
		message = JSON.parse(line) as JsonRpcMessage;
	} catch {
		process.stdout.write(
			`${JSON.stringify(jsonRpcError(null, "Parse error"))}\n`,
		);
		return;
	}
	if (typeof message.method !== "string") return;
	if (message.method === "notifications/cancelled") {
		const requestId = (
			message.params as { requestId?: string | number } | undefined
		)?.requestId;
		if (requestId !== undefined && activeCalls.has(requestId)) {
			activeCalls.get(requestId)?.abort();
			return;
		}
	}
	try {
		const rewritten = rewriteComputerUseRequest({
			jsonrpc: "2.0",
			...(message.id !== undefined && message.id !== null
				? { id: message.id }
				: {}),
			method: message.method,
			...(message.params !== undefined ? { params: message.params } : {}),
		});
		if (
			message.method === "tools/call" &&
			message.id !== undefined &&
			message.id !== null
		) {
			const id = message.id;
			const params = rewritten.request.params as {
				name: string;
				arguments?: Record<string, unknown>;
			};
			const controller = new AbortController();
			activeCalls.set(id, controller);
			toolQueue = toolQueue.then(async () => {
				try {
					controller.signal.throwIfAborted();
					const result = await executor.call(
						params.name,
						params.arguments ?? {},
						controller.signal,
					);
					process.stdout.write(
						`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`,
					);
				} catch (error) {
					process.stdout.write(
						`${JSON.stringify(jsonRpcError(id, error instanceof Error ? error.message : String(error)))}\n`,
					);
				} finally {
					activeCalls.delete(id);
				}
			});
			return;
		}
		if (
			message.id !== undefined &&
			message.id !== null &&
			rewritten.upstreamMethod
		) {
			pendingMethods.set(message.id, rewritten.upstreamMethod);
		}
		child.stdin.write(`${JSON.stringify(rewritten.request)}\n`);
	} catch (error) {
		if (message.id === undefined || message.id === null) return;
		process.stdout.write(
			`${JSON.stringify(
				jsonRpcError(
					message.id,
					error instanceof Error ? error.message : String(error),
				),
			)}\n`,
		);
	}
});

createInterface({
	input: child.stdout,
	crlfDelay: Number.POSITIVE_INFINITY,
}).on("line", (line) => {
	if (!line) return;
	try {
		const response = JSON.parse(line) as JsonRpcMessage;
		const id = response.id;
		// Late responses to timed-out/cancelled internal requests must not leak
		// into the parent MCP stream as unsolicited tool results.
		if (typeof id === "string" && id.startsWith(internalIdPrefix)) {
			internalCalls.get(id)?.(response);
			return;
		}
		const method =
			id !== undefined && id !== null ? pendingMethods.get(id) : undefined;
		if (id !== undefined && id !== null) pendingMethods.delete(id);
		process.stdout.write(
			`${JSON.stringify(rewritePeekabooResponse(response, method))}\n`,
		);
	} catch {
		// Peekaboo MCP should only emit JSON-RPC on stdout. Ignore an invalid line
		// rather than corrupting the parent ACP transport.
	}
});

child.once("error", (error) => {
	for (const controller of activeCalls.values()) controller.abort();
	process.stderr.write(`Peekaboo MCP failed to start: ${error.message}\n`);
	process.exitCode = 1;
});
child.once("exit", (code) => {
	for (const controller of activeCalls.values()) controller.abort();
	if (code && stderr.trim()) process.stderr.write(`${stderr.trim()}\n`);
	process.exitCode = code ?? 0;
});

const close = () => {
	for (const controller of activeCalls.values()) controller.abort();
	closePeekabooChild(child);
};
process.once("SIGTERM", close);
process.once("SIGINT", close);
process.stdin.once("end", close);

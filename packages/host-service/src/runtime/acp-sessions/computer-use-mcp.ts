import { spawn } from "node:child_process";
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
	process.stderr.write(`Peekaboo MCP failed to start: ${error.message}\n`);
	process.exitCode = 1;
});
child.once("exit", (code) => {
	if (code && stderr.trim()) process.stderr.write(`${stderr.trim()}\n`);
	process.exitCode = code ?? 0;
});

const close = () => closePeekabooChild(child);
process.once("SIGTERM", close);
process.once("SIGINT", close);
process.stdin.once("end", close);

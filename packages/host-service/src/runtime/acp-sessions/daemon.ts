import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, openSync, statSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
	EnqueuePromptResult,
	MessagesPage,
	PromptAccepted,
	RespondToPermissionResult,
	SessionScopedState,
	SessionStatus,
	SessionsPage,
	SessionUpdateEnvelope,
} from "@superset/session-protocol";
import hostServicePackageJson from "../../../package.json" with {
	type: "json",
};
import {
	AcpSessionDeadError,
	AcpSessionNotFoundError,
	AcpWorkspaceMismatchError,
} from "./acp-sessions";
import type {
	AcpSessionChangeHandler,
	AcpSessionOpenRequestEvent,
	AcpSessionOpenRequestHandler,
	AcpSessionRuntime,
} from "./runtime";

// Superset tool operations/events are additive. Keep v1 compatibility so a
// new Desktop can continue resolving permissions owned by an older live daemon.
export const ACP_DAEMON_PROTOCOL_VERSION = 1;
export const ACP_DAEMON_BUILD_VERSION = hostServicePackageJson.version;

/**
 * Identifies the exact daemon artifact, not only the package release. During
 * desktop development the bundle can be rebuilt many times without changing
 * package.json; using only the package version would keep an old detached
 * process alive after new protocol bridges were emitted beside it.
 */
export function acpDaemonBuildVersion(scriptPath: string): string {
	try {
		const stat = statSync(scriptPath);
		return `${ACP_DAEMON_BUILD_VERSION}:${stat.size}:${stat.mtimeMs}`;
	} catch {
		return ACP_DAEMON_BUILD_VERSION;
	}
}

export function isActiveDaemonSession(
	state: Pick<SessionScopedState, "status">,
): boolean {
	return (
		state.status === "starting" ||
		state.status === "running" ||
		state.status === "awaiting_permission"
	);
}

const CONNECT_TIMEOUT_MS = 5_000;
const RETRY_INTERVAL_MS = 50;
const MAX_LINE_BYTES = 16 * 1024 * 1024;

export type RequestOperation =
	| "hello"
	| "create"
	| "get"
	| "list"
	| "ensureLive"
	| "getMessages"
	| "prompt"
	| "respondToPermission"
	| "cancel"
	| "close"
	| "setMode"
	| "setConfigOption"
	| "enqueuePrompt"
	| "sendNow"
	| "removeQueuedPrompt"
	| "reorderQueue"
	| "editQueuedPrompt"
	| "clearQueue"
	| "supersetTool"
	| "subscribe"
	| "unsubscribe"
	| "shutdown";

export interface AcpDaemonHello {
	pid: number;
	protocolVersion: number;
	buildVersion?: string;
	pendingInteractionCount?: number;
}

export interface AcpDaemonRequest {
	type: "request";
	id: string;
	op: RequestOperation;
	params: unknown;
}

export interface AcpDaemonResponse {
	type: "response";
	id: string;
	ok: boolean;
	result?: unknown;
	error?: { name: string; message: string };
}

export interface AcpDaemonEvent {
	type: "event";
	subscriptionId: string;
	envelope: SessionUpdateEnvelope;
}

/**
 * Host-wide session status transitions. Delivered automatically on every
 * connected client — no per-session subscribe needed. Older daemons simply
 * never emit this message; the client tolerates the absence and falls back
 * to slower refetch paths where applicable.
 */
export interface AcpDaemonSessionChangedEvent {
	type: "session-changed";
	sessionId: string;
	workspaceId: string;
	eventType: "changed" | "deleted";
	status?: SessionStatus;
	occurredAt: number;
}

export interface AcpDaemonSessionOpenRequestedEvent
	extends AcpSessionOpenRequestEvent {
	type: "session-open-requested";
}

export type AcpDaemonMessage =
	| AcpDaemonRequest
	| AcpDaemonResponse
	| AcpDaemonEvent
	| AcpDaemonSessionChangedEvent
	| AcpDaemonSessionOpenRequestedEvent;

export function acpDaemonSocketPath(
	organizationId: string,
	env: NodeJS.ProcessEnv = process.env,
	platform: NodeJS.Platform = process.platform,
): string {
	if (env.SUPERSET_ACP_DAEMON_SOCKET_PATH) {
		return env.SUPERSET_ACP_DAEMON_SOCKET_PATH;
	}
	const namespace = `${organizationId}:${env.SUPERSET_HOME_DIR ?? ""}`;
	const id = createHash("sha256").update(namespace).digest("hex").slice(0, 12);
	return platform === "win32"
		? `\\\\.\\pipe\\superset-acpd-${id}`
		: path.join(os.tmpdir(), `superset-acpd-${id}.sock`);
}

export function resolveAcpDaemonScriptPath(): string {
	const override = process.env.SUPERSET_ACP_DAEMON_SCRIPT_PATH;
	if (override) return override;
	const here = path.dirname(fileURLToPath(import.meta.url));
	const bundledCandidates = [
		path.resolve(here, "acp-daemon.js"),
		// electron-vite may place this module in dist/main/chunks while emitting
		// daemon entries at dist/main.
		path.resolve(here, "..", "acp-daemon.js"),
	];
	for (const candidate of bundledCandidates) {
		if (existsSync(candidate)) return candidate;
	}
	return path.resolve(here, "daemon-entry.ts");
}

interface PendingRequest {
	resolve: (value: unknown) => void;
	reject: (reason: Error) => void;
}

interface ClientSubscription {
	sessionId: string;
	onEnvelope: (envelope: SessionUpdateEnvelope) => void;
}

/**
 * Lazy client for the detached ACP owner. The daemon owns adapters, journals,
 * pending permission callbacks, and the SQLite registry, so a host-service or
 * Electron restart only disconnects presentation; active turns keep running.
 */
export interface AcpDaemonClientOptions {
	organizationId: string;
	scriptPath?: string;
	socketPath?: string;
	spawnIfMissing?: boolean;
	spawnEnv?: NodeJS.ProcessEnv;
	execPath?: string;
	/** Test/diagnostic override; production expects this package's build. */
	expectedBuildVersion?: string;
}

export class AcpDaemonClient implements AcpSessionRuntime {
	private socket: net.Socket | null = null;
	private connecting: Promise<void> | null = null;
	private buffer = "";
	private connectedHello: AcpDaemonHello | null = null;
	private readonly pending = new Map<string, PendingRequest>();
	private readonly subscriptions = new Map<string, ClientSubscription>();
	private readonly sessionChangeHandlers = new Set<AcpSessionChangeHandler>();
	private readonly sessionOpenRequestHandlers =
		new Set<AcpSessionOpenRequestHandler>();

	constructor(private readonly options: AcpDaemonClientOptions) {}

	/**
	 * Register a handler for host-wide session status transitions the daemon
	 * pushes on every connection. Handlers see every session (including from
	 * other workspaces) — filter downstream. Returns an unregister function.
	 */
	onSessionChanged(handler: AcpSessionChangeHandler): () => void {
		this.sessionChangeHandlers.add(handler);
		return () => {
			this.sessionChangeHandlers.delete(handler);
		};
	}

	onSessionOpenRequested(handler: AcpSessionOpenRequestHandler): () => void {
		this.sessionOpenRequestHandlers.add(handler);
		return () => {
			this.sessionOpenRequestHandlers.delete(handler);
		};
	}

	async hello(): Promise<AcpDaemonHello> {
		return this.request<AcpDaemonHello>("hello", {});
	}

	async shutdown(input: { force?: boolean } = {}): Promise<void> {
		await this.connect();
		const socket = this.socket;
		const pid = this.connectedHello?.pid;
		await this.sendRequest("shutdown", input);
		if (!socket || (await waitForSocketClose(socket))) return;
		if (!input.force || !pid) {
			throw new Error("ACP daemon acknowledged shutdown but stayed running");
		}
		try {
			process.kill(pid, "SIGTERM");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
		}
	}

	async create(input: Parameters<AcpSessionRuntime["create"]>[0]) {
		await this.connect();
		await this.replaceConnectedDaemonIfSafe();
		return this.sendRequest<SessionScopedState>("create", input);
	}

	async get(sessionId: string) {
		return this.request<SessionScopedState>("get", { sessionId });
	}

	async list(input: Parameters<AcpSessionRuntime["list"]>[0]) {
		return this.request<SessionsPage>("list", input);
	}

	async ensureLive(sessionId: string): Promise<void> {
		await this.request("ensureLive", { sessionId });
	}

	async getMessages(input: Parameters<AcpSessionRuntime["getMessages"]>[0]) {
		return this.request<MessagesPage>("getMessages", input);
	}

	async prompt(input: Parameters<AcpSessionRuntime["prompt"]>[0]) {
		return this.request<{ accepted: true }>("prompt", input);
	}

	async respondToPermission(
		input: Parameters<AcpSessionRuntime["respondToPermission"]>[0],
	) {
		return this.request<RespondToPermissionResult>(
			"respondToPermission",
			input,
		);
	}

	async cancel(input: { sessionId: string }): Promise<void> {
		await this.request("cancel", input);
	}

	async close(input: { sessionId: string }): Promise<void> {
		await this.request("close", input);
	}

	async setMode(input: { sessionId: string; modeId: string }): Promise<void> {
		await this.request("setMode", input);
	}

	async setConfigOption(
		input: Parameters<AcpSessionRuntime["setConfigOption"]>[0],
	): Promise<void> {
		await this.request("setConfigOption", input);
	}

	async enqueuePrompt(
		input: Parameters<AcpSessionRuntime["enqueuePrompt"]>[0],
	) {
		return this.request<EnqueuePromptResult>("enqueuePrompt", input);
	}

	async sendNow(input: Parameters<AcpSessionRuntime["sendNow"]>[0]) {
		return this.request<PromptAccepted>("sendNow", input);
	}

	async removeQueuedPrompt(
		input: Parameters<AcpSessionRuntime["removeQueuedPrompt"]>[0],
	): Promise<void> {
		await this.request("removeQueuedPrompt", input);
	}

	async reorderQueue(
		input: Parameters<AcpSessionRuntime["reorderQueue"]>[0],
	): Promise<void> {
		await this.request("reorderQueue", input);
	}

	async editQueuedPrompt(
		input: Parameters<AcpSessionRuntime["editQueuedPrompt"]>[0],
	): Promise<void> {
		await this.request("editQueuedPrompt", input);
	}

	async clearQueue(
		input: Parameters<AcpSessionRuntime["clearQueue"]>[0],
	): Promise<void> {
		await this.request("clearQueue", input);
	}

	async subscribe(
		input: Parameters<AcpSessionRuntime["subscribe"]>[0],
	): Promise<() => void> {
		const subscriptionId = randomUUID();
		this.subscriptions.set(subscriptionId, {
			sessionId: input.sessionId,
			onEnvelope: input.onEnvelope,
		});
		try {
			await this.request("subscribe", {
				subscriptionId,
				sessionId: input.sessionId,
				since: input.since,
				epoch: input.epoch,
			});
		} catch (error) {
			this.subscriptions.delete(subscriptionId);
			throw error;
		}
		return () => {
			if (!this.subscriptions.delete(subscriptionId)) return;
			void this.request("unsubscribe", { subscriptionId }).catch(() => {});
		};
	}

	/** Disconnect this host only. The daemon and every ACP adapter stay alive. */
	async dispose(): Promise<void> {
		const socket = this.socket;
		this.socket = null;
		this.connecting = null;
		this.connectedHello = null;
		if (socket) socket.destroy();
		this.rejectPending(new Error("ACP daemon client disposed"));
		this.subscriptions.clear();
	}

	private async request<T = void>(
		op: RequestOperation,
		params: unknown,
	): Promise<T> {
		await this.connect();
		return this.sendRequest<T>(op, params);
	}

	private async sendRequest<T = void>(
		op: RequestOperation,
		params: unknown,
	): Promise<T> {
		const socket = this.socket;
		if (!socket || socket.destroyed) {
			throw new Error("ACP daemon is not connected");
		}
		const id = randomUUID();
		const response = new Promise<unknown>((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
		});
		const message: AcpDaemonRequest = { type: "request", id, op, params };
		socket.write(`${JSON.stringify(message)}\n`);
		return (await response) as T;
	}

	private async connect(): Promise<void> {
		if (this.socket && !this.socket.destroyed) return;
		if (this.connecting) return this.connecting;
		this.connecting = this.connectOrSpawn().finally(() => {
			this.connecting = null;
		});
		return this.connecting;
	}

	private async replaceConnectedDaemonIfSafe(): Promise<void> {
		const scriptPath = this.options.scriptPath ?? resolveAcpDaemonScriptPath();
		const expectedBuild =
			this.options.expectedBuildVersion ?? acpDaemonBuildVersion(scriptPath);
		if ((await this.verifyConnectedDaemon(expectedBuild)) === "use") return;

		const oldSocket = this.socket;
		await this.sendRequest("shutdown", {});
		if (oldSocket) await waitForSocketClose(oldSocket);
		this.socket = null;
		await this.connect();
	}

	private async connectOrSpawn(): Promise<void> {
		const socketPath =
			this.options.socketPath ??
			acpDaemonSocketPath(this.options.organizationId);
		const scriptPath = this.options.scriptPath ?? resolveAcpDaemonScriptPath();
		const expectedBuild =
			this.options.expectedBuildVersion ?? acpDaemonBuildVersion(scriptPath);
		if (await this.tryConnect(socketPath)) {
			const disposition = await this.verifyConnectedDaemon(expectedBuild);
			if (disposition === "use") return;
			const oldSocket = this.socket;
			const oldPid = this.connectedHello?.pid;
			await this.sendRequest("shutdown", {});
			const closed = oldSocket ? await waitForSocketClose(oldSocket) : true;
			if (!closed && oldPid) {
				try {
					process.kill(oldPid, "SIGTERM");
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
				}
			}
			this.socket = null;
			this.connectedHello = null;
		}
		if (this.options.spawnIfMissing === false) {
			throw new Error(`ACP daemon is not available at ${socketPath}`);
		}
		const logPath =
			process.env.SUPERSET_ACP_DAEMON_LOG_PATH ??
			path.join(os.tmpdir(), `superset-acpd-${process.pid}.log`);
		const logFd = openSync(logPath, "a");
		const child = spawn(
			this.options.execPath ?? process.execPath,
			[scriptPath],
			{
				detached: true,
				stdio: ["ignore", logFd, logFd],
				env: {
					...process.env,
					...this.options.spawnEnv,
					ELECTRON_RUN_AS_NODE: "1",
					SUPERSET_ACP_DAEMON_SOCKET_PATH: socketPath,
					SUPERSET_ACP_DAEMON_BUILD_VERSION: expectedBuild,
					SUPERSET_ACP_DAEMON_LOG_PATH: logPath,
				},
				windowsHide: true,
			},
		);
		try {
			closeSync(logFd);
		} catch {}
		child.on("error", () => {});
		child.unref();
		const deadline = Date.now() + CONNECT_TIMEOUT_MS;
		while (Date.now() < deadline) {
			if (await this.tryConnect(socketPath)) {
				const disposition = await this.verifyConnectedDaemon(expectedBuild);
				if (disposition === "use") return;
				this.socket?.destroy();
				this.socket = null;
			}
			await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS));
		}
		throw new Error(`ACP daemon did not listen at ${socketPath}`);
	}

	private async verifyConnectedDaemon(
		expectedBuild: string,
	): Promise<"use" | "replace"> {
		const hello = await this.sendRequest<AcpDaemonHello>("hello", {});
		this.connectedHello = hello;
		if (hello.protocolVersion !== ACP_DAEMON_PROTOCOL_VERSION) {
			if ((hello.pendingInteractionCount ?? 0) > 0) {
				throw new Error(
					`ACP daemon protocol ${hello.protocolVersion} is incompatible with ${ACP_DAEMON_PROTOCOL_VERSION} and still owns pending interactions`,
				);
			}
			return "replace";
		}
		if (!hello.buildVersion) {
			// The first daemon release did not report a build id or interaction
			// count. Its list snapshot still reveals active turns and permissions,
			// allowing idle legacy daemons to upgrade without killing live work.
			return (await this.legacyDaemonHasActiveSessions()) ? "use" : "replace";
		}
		if (hello.buildVersion === expectedBuild) return "use";
		return (hello.pendingInteractionCount ?? 0) > 0 ? "use" : "replace";
	}

	private async legacyDaemonHasActiveSessions(): Promise<boolean> {
		let cursor: string | undefined;
		const seenCursors = new Set<string>();
		try {
			for (;;) {
				const page = await this.sendRequest<SessionsPage>("list", {
					cursor,
					limit: 100,
				});
				if (page.items.some(isActiveDaemonSession)) return true;
				if (!page.nextCursor || seenCursors.has(page.nextCursor)) return false;
				seenCursors.add(page.nextCursor);
				cursor = page.nextCursor;
			}
		} catch {
			// Unknown legacy behavior must remain conservative: preserving a live
			// permission resolver is more important than forcing an upgrade.
			return true;
		}
	}

	private tryConnect(socketPath: string): Promise<boolean> {
		return new Promise((resolve) => {
			const socket = net.createConnection(socketPath);
			let settled = false;
			const finish = (connected: boolean) => {
				if (settled) return;
				settled = true;
				if (!connected) socket.destroy();
				resolve(connected);
			};
			socket.once("connect", () => {
				this.attachSocket(socket);
				finish(true);
			});
			socket.once("error", () => finish(false));
		});
	}

	private attachSocket(socket: net.Socket): void {
		this.socket?.destroy();
		this.socket = socket;
		this.buffer = "";
		socket.setEncoding("utf8");
		socket.on("data", (chunk: string) => this.onData(chunk));
		socket.on("close", () => {
			if (this.socket !== socket) return;
			this.socket = null;
			this.connectedHello = null;
			this.rejectPending(new Error("ACP daemon disconnected"));
			for (const subscription of this.subscriptions.values()) {
				subscription.onEnvelope({
					seq: 0,
					epoch: "reset",
					sessionId: subscription.sessionId,
					ts: Date.now(),
					frame: { kind: "reset", reason: "daemon_disconnected" },
				});
			}
			this.subscriptions.clear();
		});
	}

	private onData(chunk: string): void {
		this.buffer += chunk;
		if (Buffer.byteLength(this.buffer) > MAX_LINE_BYTES) {
			this.socket?.destroy(new Error("ACP daemon frame exceeded size limit"));
			return;
		}
		for (;;) {
			const newline = this.buffer.indexOf("\n");
			if (newline < 0) return;
			const line = this.buffer.slice(0, newline);
			this.buffer = this.buffer.slice(newline + 1);
			if (!line) continue;
			try {
				this.onMessage(JSON.parse(line) as AcpDaemonMessage);
			} catch {
				this.socket?.destroy(new Error("Invalid ACP daemon response"));
				return;
			}
		}
	}

	private onMessage(message: AcpDaemonMessage): void {
		if (message.type === "event") {
			this.subscriptions
				.get(message.subscriptionId)
				?.onEnvelope(message.envelope);
			return;
		}
		if (message.type === "session-changed") {
			const { type: _type, ...payload } = message;
			for (const handler of this.sessionChangeHandlers) {
				try {
					handler(payload);
				} catch (error) {
					console.warn(
						"[acp-daemon-client] session-changed handler threw",
						error,
					);
				}
			}
			return;
		}
		if (message.type === "session-open-requested") {
			const { type: _type, ...payload } = message;
			for (const handler of this.sessionOpenRequestHandlers) {
				try {
					handler(payload);
				} catch (error) {
					console.warn(
						"[acp-daemon-client] session-open-requested handler threw",
						error,
					);
				}
			}
			return;
		}
		if (message.type !== "response") return;
		const pending = this.pending.get(message.id);
		if (!pending) return;
		this.pending.delete(message.id);
		if (message.ok) pending.resolve(message.result);
		else pending.reject(deserializeError(message.error));
	}

	private rejectPending(error: Error): void {
		for (const pending of this.pending.values()) pending.reject(error);
		this.pending.clear();
	}
}

async function waitForSocketClose(socket: net.Socket): Promise<boolean> {
	if (socket.destroyed) return true;
	const closed = await Promise.race([
		new Promise<true>((resolve) => socket.once("close", () => resolve(true))),
		new Promise<false>((resolve) => setTimeout(() => resolve(false), 2_000)),
	]);
	if (!closed) socket.destroy();
	return closed;
}

function deserializeError(error?: { name: string; message: string }): Error {
	const message = error?.message ?? "Unknown ACP daemon error";
	switch (error?.name) {
		case "AcpSessionNotFoundError":
			return new AcpSessionNotFoundError(message);
		case "AcpSessionDeadError":
			return new AcpSessionDeadError(message);
		case "AcpWorkspaceMismatchError":
			return new AcpWorkspaceMismatchError(message);
		default:
			return new Error(message);
	}
}

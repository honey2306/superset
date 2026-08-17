import { existsSync, unlinkSync } from "node:fs";
import net from "node:net";
import { eq } from "drizzle-orm";
import { createDb } from "../../db";
import { projects, workspaces } from "../../db/schema";
import { resolveDelegatedExecutionTarget } from "../../trpc/router/settings/delegated-execution-target";
import {
	assertProjectConfigIsEditable,
	resolveScript,
	shellSingleQuote,
	updateProjectConfig,
} from "../setup/config";
import {
	AcpCliAutoUpdater,
	acpCliUpdateCommands,
} from "./acp-cli-auto-updater";
import { AcpSessionManager } from "./acp-sessions";
import { generateAcpSessionTitle } from "./acp-title-generation";
import {
	ACP_DAEMON_BUILD_VERSION,
	ACP_DAEMON_PROTOCOL_VERSION,
	type AcpDaemonEvent,
	type AcpDaemonRequest,
	type AcpDaemonResponse,
	type AcpDaemonSessionChangedEvent,
	type AcpDaemonSessionOpenRequestedEvent,
	acpDaemonSocketPath,
} from "./daemon";
import { browserUseMcpServerFromEnvironment } from "./local-mcp";
import { SqliteAcpSessionPersistence } from "./persistence";
import {
	PI_ACP_MCP_EXTENSION_ENV,
	resolvePiAcpMcpExtensionPath,
} from "./pi-acp-mcp-config";
import { supersetMcpServer } from "./superset-local-mcp";
import { SupersetToolController } from "./superset-tools";

const MAX_BUFFER_BYTES = 16 * 1024 * 1024;

async function main(): Promise<void> {
	const organizationId = requiredEnv("ORGANIZATION_ID");
	const db = createDb(
		requiredEnv("HOST_DB_PATH"),
		requiredEnv("HOST_MIGRATIONS_FOLDER"),
	);
	const claudeCommand = process.env.CLAUDE_CODE_EXECUTABLE ?? "claude";
	const mfcliCommand =
		process.env.SUPERSET_MFCLI_ACP_COMMAND ??
		process.env.SUPERSET_MFCLI_TITLE_COMMAND ??
		"mfcli";
	const cliAutoUpdater = new AcpCliAutoUpdater({
		commands: acpCliUpdateCommands({
			claude: claudeCommand,
			mfcli: mfcliCommand,
		}),
	});
	const socketPath = acpDaemonSocketPath(organizationId);
	const persistence = new SqliteAcpSessionPersistence(db);
	const manager = new AcpSessionManager({
		resolveWorkspaceCwd: (workspaceId) => {
			const workspace = db.query.workspaces
				.findFirst({ where: eq(workspaces.id, workspaceId) })
				.sync();
			if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`);
			return workspace.worktreePath;
		},
		persistence,
		adapterEntry: process.env.SUPERSET_ACP_ADAPTER_ENTRY,
		codexAdapterEntry: process.env.SUPERSET_CODEX_ACP_ADAPTER_ENTRY,
		piAdapterEntry: process.env.SUPERSET_PI_ACP_ADAPTER_ENTRY,
		myflickerAdapterCommand: mfcliCommand,
		adapterEnv: {
			[PI_ACP_MCP_EXTENSION_ENV]: resolvePiAcpMcpExtensionPath(),
		},
		mcpServers: [browserUseMcpServerFromEnvironment()].filter(
			(server): server is NonNullable<typeof server> => server !== null,
		),
		mcpServerFactory: ({ sessionId }) => [
			supersetMcpServer({ sessionId, daemonSocketPath: socketPath }),
		],
		generateTitle: ({ message }) => generateAcpSessionTitle(message),
	});
	await removeStaleSocket(socketPath);

	const clientWriters = new Set<
		(event: AcpDaemonSessionOpenRequestedEvent) => void
	>();
	const toolController = new SupersetToolController({
		manager,
		delegationRuns: persistence,
		resolveDelegatedExecution: () => resolveDelegatedExecutionTarget(db),
		setProjectRunCommand: ({ workspaceId, commands }) => {
			const project = db
				.select({ id: projects.id, repoPath: projects.repoPath })
				.from(workspaces)
				.innerJoin(projects, eq(projects.id, workspaces.projectId))
				.where(eq(workspaces.id, workspaceId))
				.get();
			if (!project) {
				throw new Error(`Workspace not found: ${workspaceId}`);
			}
			const existing = resolveScript("run", {
				repoPath: project.repoPath,
				projectId: project.id,
			});
			if (existing) {
				return {
					status: "already_configured" as const,
					commands:
						existing.kind === "commands"
							? existing.commands
							: [`bash ${shellSingleQuote(existing.scriptPath)}`],
				};
			}
			assertProjectConfigIsEditable(project.repoPath);
			updateProjectConfig(project.repoPath, { run: commands });
			return { status: "configured" as const, commands };
		},
		onOpenRequested: (event) => {
			for (const write of clientWriters) {
				write({ type: "session-open-requested", ...event });
			}
		},
	});

	let closing = false;
	let server: net.Server;
	const shutdown = async () => {
		if (closing) return;
		closing = true;
		server.close();
		cliAutoUpdater.dispose();
		await manager.dispose();
		if (process.platform !== "win32") {
			try {
				unlinkSync(socketPath);
			} catch {}
		}
		process.exit(0);
	};

	server = net.createServer((socket) => {
		socket.setEncoding("utf8");
		let buffer = "";
		const subscriptions = new Map<string, () => void>();
		const requestControllers = new Set<AbortController>();
		const write = (
			message:
				| AcpDaemonResponse
				| AcpDaemonEvent
				| AcpDaemonSessionChangedEvent
				| AcpDaemonSessionOpenRequestedEvent,
		) => {
			if (socket.destroyed || socket.writableLength > MAX_BUFFER_BYTES) {
				socket.destroy();
				return;
			}
			socket.write(`${JSON.stringify(message)}\n`);
		};
		clientWriters.add(write);
		// Host-wide session-change broadcast. Every daemon client hears every
		// session transition and filters downstream.
		const detachSessionChanges = manager.onSessionChanged((event) => {
			write({
				type: "session-changed",
				sessionId: event.sessionId,
				workspaceId: event.workspaceId,
				eventType: event.eventType,
				...(event.status !== undefined ? { status: event.status } : {}),
				occurredAt: event.occurredAt,
			});
		});
		socket.on("data", (chunk: string) => {
			buffer += chunk;
			if (Buffer.byteLength(buffer) > MAX_BUFFER_BYTES) {
				socket.destroy(new Error("ACP daemon request exceeded size limit"));
				return;
			}
			for (;;) {
				const newline = buffer.indexOf("\n");
				if (newline < 0) break;
				const line = buffer.slice(0, newline);
				buffer = buffer.slice(newline + 1);
				if (!line) continue;
				let request: AcpDaemonRequest;
				try {
					request = JSON.parse(line) as AcpDaemonRequest;
				} catch {
					socket.destroy(new Error("Invalid ACP daemon JSON"));
					return;
				}
				const controller = new AbortController();
				requestControllers.add(controller);
				void dispatch(
					manager,
					toolController,
					request,
					subscriptions,
					write,
					shutdown,
					controller.signal,
				).finally(() => requestControllers.delete(controller));
			}
		});
		const detach = () => {
			for (const controller of requestControllers) controller.abort();
			requestControllers.clear();
			clientWriters.delete(write);
			for (const unsubscribe of subscriptions.values()) unsubscribe();
			subscriptions.clear();
			detachSessionChanges();
		};
		socket.on("close", detach);
		socket.on("error", () => {});
	});
	server.on("error", (error) => {
		console.error("[acp-daemon] server error", error);
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(socketPath, () => {
			server.off("error", reject);
			resolve();
		});
	});
	if (process.platform !== "win32") {
		const { chmodSync } = await import("node:fs");
		chmodSync(socketPath, 0o600);
	}
	console.error(`[acp-daemon] listening at ${socketPath} (pid=${process.pid})`);
	cliAutoUpdater.start();

	process.on("SIGTERM", () => void shutdown());
	process.on("SIGINT", () => void shutdown());
}

async function dispatch(
	manager: AcpSessionManager,
	toolController: SupersetToolController,
	request: AcpDaemonRequest,
	subscriptions: Map<string, () => void>,
	write: (message: AcpDaemonResponse | AcpDaemonEvent) => void,
	shutdown: () => Promise<void>,
	signal: AbortSignal,
): Promise<void> {
	try {
		let result: unknown;
		let shutdownAfterResponse = false;
		switch (request.op) {
			case "hello":
				result = {
					pid: process.pid,
					protocolVersion: ACP_DAEMON_PROTOCOL_VERSION,
					buildVersion:
						process.env.SUPERSET_ACP_DAEMON_BUILD_VERSION ??
						ACP_DAEMON_BUILD_VERSION,
					pendingInteractionCount: manager.pendingInteractionCount(),
				};
				break;
			case "create":
				result = await manager.create(
					request.params as Parameters<AcpSessionManager["create"]>[0],
				);
				break;
			case "get":
				result = manager.get(
					(request.params as { sessionId: string }).sessionId,
				);
				break;
			case "list":
				result = manager.list(
					request.params as Parameters<AcpSessionManager["list"]>[0],
				);
				break;
			case "ensureLive":
				await manager.ensureLive(
					(request.params as { sessionId: string }).sessionId,
				);
				break;
			case "getMessages":
				result = manager.getMessages(
					request.params as Parameters<AcpSessionManager["getMessages"]>[0],
				);
				break;
			case "prompt": {
				const admission = manager.prompt(
					request.params as Parameters<AcpSessionManager["prompt"]>[0],
				);
				result = { accepted: admission.accepted };
				break;
			}
			case "respondToPermission":
				result = manager.respondToPermission(
					request.params as Parameters<typeof manager.respondToPermission>[0],
				);
				break;
			case "cancel":
				await manager.cancel(
					request.params as Parameters<AcpSessionManager["cancel"]>[0],
				);
				break;
			case "close":
				await manager.close(
					request.params as Parameters<AcpSessionManager["close"]>[0],
				);
				break;
			case "setMode":
				await manager.setMode(
					request.params as Parameters<AcpSessionManager["setMode"]>[0],
				);
				break;
			case "setConfigOption":
				await manager.setConfigOption(
					request.params as Parameters<AcpSessionManager["setConfigOption"]>[0],
				);
				break;
			case "enqueuePrompt":
				result = manager.enqueuePrompt(
					request.params as Parameters<AcpSessionManager["enqueuePrompt"]>[0],
				);
				break;
			case "sendNow":
				result = await manager.sendNow(
					request.params as Parameters<AcpSessionManager["sendNow"]>[0],
				);
				break;
			case "removeQueuedPrompt":
				manager.removeQueuedPrompt(
					request.params as Parameters<
						AcpSessionManager["removeQueuedPrompt"]
					>[0],
				);
				break;
			case "reorderQueue":
				manager.reorderQueue(
					request.params as Parameters<AcpSessionManager["reorderQueue"]>[0],
				);
				break;
			case "editQueuedPrompt":
				manager.editQueuedPrompt(
					request.params as Parameters<
						AcpSessionManager["editQueuedPrompt"]
					>[0],
				);
				break;
			case "clearQueue":
				manager.clearQueue(
					request.params as Parameters<AcpSessionManager["clearQueue"]>[0],
				);
				break;
			case "supersetTool":
				result = await toolController.execute(request.params, signal);
				break;
			case "subscribe": {
				const input = request.params as {
					subscriptionId: string;
					sessionId: string;
					since?: number;
					epoch?: string;
				};
				subscriptions.get(input.subscriptionId)?.();
				const unsubscribe = manager.subscribe({
					sessionId: input.sessionId,
					since: input.since,
					epoch: input.epoch,
					onEnvelope: (envelope) =>
						write({
							type: "event",
							subscriptionId: input.subscriptionId,
							envelope,
						}),
				});
				subscriptions.set(input.subscriptionId, unsubscribe);
				break;
			}
			case "unsubscribe": {
				const id = (request.params as { subscriptionId: string })
					.subscriptionId;
				subscriptions.get(id)?.();
				subscriptions.delete(id);
				break;
			}
			case "shutdown": {
				const force =
					(request.params as { force?: boolean } | null)?.force === true;
				const pendingInteractionCount = manager.pendingInteractionCount();
				if (!force && pendingInteractionCount > 0) {
					throw new Error(
						`ACP daemon owns ${pendingInteractionCount} pending interaction(s)`,
					);
				}
				shutdownAfterResponse = true;
				result = { shuttingDown: true };
				break;
			}
			default: {
				const unsupported: never = request.op;
				throw new Error(`Unsupported ACP daemon operation: ${unsupported}`);
			}
		}
		write({ type: "response", id: request.id, ok: true, result });
		if (shutdownAfterResponse) setImmediate(() => void shutdown());
	} catch (error) {
		const normalized =
			error instanceof Error ? error : new Error(String(error));
		write({
			type: "response",
			id: request.id,
			ok: false,
			error: { name: normalized.constructor.name, message: normalized.message },
		});
	}
}

async function removeStaleSocket(socketPath: string): Promise<void> {
	if (process.platform !== "win32" && !existsSync(socketPath)) return;
	const live = await new Promise<boolean>((resolve) => {
		const socket = net.createConnection(socketPath);
		socket.once("connect", () => {
			socket.destroy();
			resolve(true);
		});
		socket.once("error", () => resolve(false));
	});
	if (live) {
		throw new Error(`ACP daemon is already listening at ${socketPath}`);
	}
	if (process.platform !== "win32") {
		try {
			unlinkSync(socketPath);
		} catch {}
	}
}

function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required by acp-daemon`);
	return value;
}

void main().catch((error) => {
	console.error("[acp-daemon] failed to start", error);
	process.exit(1);
});

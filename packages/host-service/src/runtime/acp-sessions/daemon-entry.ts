import { existsSync, unlinkSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import {
	composeSupersetModelFacingInstructions,
	formatProjectMemoryInstructions,
	formatSupersetDelegationInstructions,
	SUPERSET_ROOT_COORDINATOR_ROLE,
} from "@superset/session-protocol";
import { eq } from "drizzle-orm";
import { createDb } from "../../db";
import { projects, workspaces } from "../../db/schema";
import {
	createProjectMemory,
	listProjectMemories,
	markProjectMemoriesUsed,
	resolveProjectIdForWorkspace,
} from "../../project-memories";
import {
	readDelegationProfiles,
	resolveDelegatedExecutionTarget,
	resolveDelegationProfileTargets,
	toDelegationProfileSummary,
} from "../../trpc/router/settings/delegated-execution-target";
import { canonicalizeHostPath } from "../../workspace-catalog";
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
import { agentBrowserMcpServer } from "./agent-browser-local-mcp";
import { AgentBrowserRuntime } from "./agent-browser-runtime";
import { AcpArtifactStore } from "./artifact-store";
import {
	ACP_DAEMON_BUILD_VERSION,
	ACP_DAEMON_PROTOCOL_VERSION,
	type AcpDaemonEvent,
	type AcpDaemonMergeRequestOpenRequestedEvent,
	type AcpDaemonRequest,
	type AcpDaemonResponse,
	type AcpDaemonSessionChangedEvent,
	type AcpDaemonSessionOpenRequestedEvent,
	acpDaemonSocketPath,
} from "./daemon";
import { resolveKDevMergeRequestPage } from "./kdev-merge-request";
import { browserUseMcpServerFromEnvironment } from "./local-mcp";
import { SqliteAcpSessionPersistence } from "./persistence";
import { supersetMcpServer } from "./superset-local-mcp";
import { SupersetToolController } from "./superset-tools";

const MAX_BUFFER_BYTES = 16 * 1024 * 1024;

class AcpDaemonFrameTooLargeError extends Error {
	constructor(bytes: number) {
		super(
			`ACP daemon frame exceeds the ${MAX_BUFFER_BYTES} byte transport limit (${bytes} bytes)`,
		);
	}
}

async function main(): Promise<void> {
	const organizationId = requiredEnv("ORGANIZATION_ID");
	const dbPath = requiredEnv("HOST_DB_PATH");
	const db = createDb(dbPath, requiredEnv("HOST_MIGRATIONS_FOLDER"));
	const claudeCommand = process.env.CLAUDE_CODE_EXECUTABLE ?? "claude";
	const mfcliCommand =
		process.env.SUPERSET_MFCLI_ACP_COMMAND ??
		process.env.SUPERSET_MFCLI_TITLE_COMMAND ??
		"mfcli";
	const deepseekCommand =
		process.env.SUPERSET_DSH_ACP_COMMAND ?? "dsh-acp-demo";
	const deepseekConfig = process.env.SUPERSET_DSH_ACP_CONFIG;
	const cliAutoUpdater = new AcpCliAutoUpdater({
		commands: acpCliUpdateCommands({
			claude: claudeCommand,
			mfcli: mfcliCommand,
		}),
	});
	const socketPath = acpDaemonSocketPath(organizationId);
	const persistence = new SqliteAcpSessionPersistence(db);
	const artifactStore = new AcpArtifactStore(
		path.join(path.dirname(dbPath), "acp-artifacts"),
	);
	const agentBrowserEnabled = process.env.SUPERSET_AGENT_BROWSER === "1";
	const agentBrowserRuntime = new AgentBrowserRuntime({
		enabled: agentBrowserEnabled,
	});
	const compaction = persistence.compactHistoricalJournal(artifactStore);
	if (!compaction.skipped) {
		console.error(
			`[acp-daemon] historical journal compaction: ${compaction.rowsUpdated}/${compaction.rowsScanned} rows, ${compaction.bytesBefore} -> ${compaction.bytesAfter} bytes, ${compaction.uniqueArtifacts} unique artifacts`,
		);
	}
	const manager = new AcpSessionManager({
		resolveWorkspaceCwd: (workspaceId) => {
			const workspace = db.query.workspaces
				.findFirst({ where: eq(workspaces.id, workspaceId) })
				.sync();
			if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`);
			return workspace.worktreePath;
		},
		persistence,
		artifactStore,
		adapterEntry: process.env.SUPERSET_ACP_ADAPTER_ENTRY,
		codexAdapterEntry: process.env.SUPERSET_CODEX_ACP_ADAPTER_ENTRY,
		piAdapterEntry: process.env.SUPERSET_PI_ACP_ADAPTER_ENTRY,
		myflickerAdapterCommand: mfcliCommand,
		deepseekAdapterCommand: deepseekCommand,
		deepseekAdapterConfig: deepseekConfig,
		mcpServers: agentBrowserEnabled
			? []
			: [browserUseMcpServerFromEnvironment()].filter(
					(server): server is NonNullable<typeof server> => server !== null,
				),
		mcpServerFactory: ({ sessionId, role }) => [
			supersetMcpServer({ sessionId, daemonSocketPath: socketPath, role }),
			...(agentBrowserEnabled
				? [
						agentBrowserMcpServer({
							sessionId,
							daemonSocketPath: socketPath,
						}),
					]
				: []),
		],
		modelFacingInstructions: ({ role, workspaceId }) => {
			const embeddedBrowserInstructions = agentBrowserEnabled
				? [
						"## Embedded Agent Browser",
						"For every request to browse, open, inspect, or interact with a website, use the agent-browser MCP tools so the page appears in the conversation's Agent Browser pane.",
						"Never use shell commands such as `open`, `xdg-open`, or `start`, and never fall back to the OS/system browser. If an agent-browser tool fails, report the failure instead of claiming the page was opened.",
					].join("\n\n")
				: undefined;
			if (role !== SUPERSET_ROOT_COORDINATOR_ROLE) {
				return embeddedBrowserInstructions;
			}
			const profiles = resolveDelegationProfileTargets(db);
			const summaries = profiles.map(toDelegationProfileSummary);
			const delegationInstructions = summaries.some(
				(profile) => profile.enabled && profile.valid,
			)
				? formatSupersetDelegationInstructions(summaries)
				: undefined;
			const projectId = resolveProjectIdForWorkspace(db, workspaceId);
			const memories = projectId
				? listProjectMemories(db, {
						projectId,
						includeDisabled: false,
						limit: 12,
					})
				: [];
			markProjectMemoriesUsed(
				db,
				memories.map((memory) => memory.id),
			);
			return composeSupersetModelFacingInstructions([
				embeddedBrowserInstructions,
				delegationInstructions,
				formatProjectMemoryInstructions(
					memories.map((memory) => ({
						title: memory.title,
						category: memory.category,
					})),
				),
			]);
		},
		generateTitle: ({ message }) => generateAcpSessionTitle(message),
	});
	await removeStaleSocket(socketPath);

	const clientWriters = new Set<
		(
			event:
				| AcpDaemonSessionOpenRequestedEvent
				| AcpDaemonMergeRequestOpenRequestedEvent,
		) => void
	>();
	const toolController = new SupersetToolController({
		manager,
		delegationRuns: persistence,
		resolveDelegatedExecution: () => {
			const profiles = resolveDelegationProfileTargets(db);
			const profilesState = readDelegationProfiles(db);
			if (profilesState.persisted) {
				const selected = profiles.find(
					(profile) => profile.enabled && profile.valid && profile.agent,
				);
				if (selected?.agent) {
					return {
						enabled: true as const,
						valid: true as const,
						agent: selected.agent,
						model: selected.model ?? null,
						profiles,
						profilesConfigured: true,
					};
				}
				const invalid = profiles.find((profile) => profile.enabled);
				if (invalid) {
					return {
						enabled: true as const,
						valid: false as const,
						error:
							invalid.error ??
							`Delegation profile '${invalid.name}' has an invalid executor target.`,
						profiles,
						profilesConfigured: true,
					};
				}
				return {
					enabled: false as const,
					profiles,
					profilesConfigured: true,
				};
			}
			return {
				...resolveDelegatedExecutionTarget(db),
				profiles,
				profilesConfigured: false,
			};
		},
		resolveTargetWorkspace: ({
			sourceWorkspaceId,
			workspaceId,
			projectId,
			projectPath,
		}) => {
			if (workspaceId) {
				const workspace = db.query.workspaces
					.findFirst({ where: eq(workspaces.id, workspaceId) })
					.sync();
				if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`);
				return workspace.id;
			}
			let resolvedProjectId = projectId;
			if (projectPath) {
				const canonicalProjectPath = canonicalizeHostPath(projectPath);
				const project = db.query.projects
					.findFirst({
						where: eq(projects.canonicalRepoPath, canonicalProjectPath),
					})
					.sync();
				if (!project) throw new Error(`Project not found: ${projectPath}`);
				resolvedProjectId = project.id;
			}
			if (!resolvedProjectId) return sourceWorkspaceId;
			const candidates = db
				.select({
					id: workspaces.id,
					type: workspaces.type,
					createdAt: workspaces.createdAt,
				})
				.from(workspaces)
				.where(eq(workspaces.projectId, resolvedProjectId))
				.all();
			const target =
				candidates.find((workspace) => workspace.type === "main") ??
				candidates.sort((a, b) => b.createdAt - a.createdAt)[0];
			if (!target)
				throw new Error(
					`Workspace not found for project: ${resolvedProjectId}`,
				);
			return target.id;
		},
		rememberProjectMemory: ({
			workspaceId,
			sourceSessionId,
			title,
			content,
			category,
			pinned,
		}) => {
			const projectId = resolveProjectIdForWorkspace(db, workspaceId);
			if (!projectId) throw new Error(`Workspace not found: ${workspaceId}`);
			const result = createProjectMemory(db, {
				projectId,
				title,
				content,
				category,
				source: "agent",
				sourceSessionId,
				pinned,
			});
			return { ...result, projectId };
		},
		searchProjectMemories: ({ workspaceId, query, limit }) => {
			const projectId = resolveProjectIdForWorkspace(db, workspaceId);
			if (!projectId) throw new Error(`Workspace not found: ${workspaceId}`);
			const memories = listProjectMemories(db, {
				projectId,
				query,
				includeDisabled: false,
				limit,
			});
			markProjectMemoriesUsed(
				db,
				memories.map((memory) => memory.id),
			);
			return { projectId, memories };
		},
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
		openMergeRequest: ({ cwd }) => resolveKDevMergeRequestPage(cwd),
		onMergeRequestOpenRequested: (event) => {
			for (const write of clientWriters) {
				write({ type: "merge-request-open-requested", ...event });
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
		await agentBrowserRuntime.dispose();
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
				| AcpDaemonSessionOpenRequestedEvent
				| AcpDaemonMergeRequestOpenRequestedEvent,
		): boolean => {
			if (socket.destroyed) return false;
			const line = `${JSON.stringify(message)}\n`;
			const bytes = Buffer.byteLength(line);
			if (bytes > MAX_BUFFER_BYTES)
				throw new AcpDaemonFrameTooLargeError(bytes);
			return socket.write(line);
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
					agentBrowserRuntime,
					toolController,
					request,
					subscriptions,
					socket,
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

/**
 * Node accepts writes after its high-water mark, so a synchronous journal
 * replay could otherwise enqueue every retained envelope and eventually make
 * us tear down the control socket. Pause at the first backpressure signal,
 * detach the listener, and replay the durable tail from the last accepted
 * sequence on drain. The journal remains the only queue, keeping memory
 * bounded without losing ordered envelopes.
 */
function subscribeWithBackpressure(input: {
	manager: AcpSessionManager;
	socket: net.Socket;
	write: (message: AcpDaemonResponse | AcpDaemonEvent) => boolean;
	input: {
		subscriptionId: string;
		sessionId: string;
		since?: number;
		epoch?: string;
	};
}): () => void {
	let stopped = false;
	let paused = false;
	let unsubscribe: (() => void) | undefined;
	let lastDelivered = input.input.since;
	const detachForPause = () => {
		unsubscribe?.();
		unsubscribe = undefined;
	};

	const stop = () => {
		if (stopped) return;
		stopped = true;
		unsubscribe?.();
		unsubscribe = undefined;
	};
	const resume = () => {
		if (stopped || input.socket.destroyed) return;
		detachForPause();
		paused = false;
		const attached = input.manager.subscribe({
			sessionId: input.input.sessionId,
			since: lastDelivered,
			epoch: input.input.epoch,
			onEnvelope: (envelope) => {
				if (stopped || paused) return;
				try {
					const drained = input.write({
						type: "event",
						subscriptionId: input.input.subscriptionId,
						envelope,
					});
					// `false` still means Node accepted this envelope into its
					// write queue, so the resume cursor advances past it.
					lastDelivered = envelope.seq;
					if (!drained) {
						paused = true;
						detachForPause();
						input.socket.once("drain", resume);
					}
				} catch (error) {
					if (!(error instanceof AcpDaemonFrameTooLargeError)) throw error;
					paused = true;
					detachForPause();
					// A single envelope can never fit this protocol. Report that
					// honestly; do not turn it into a daemon disconnect.
					input.write({
						type: "event",
						subscriptionId: input.input.subscriptionId,
						envelope: {
							seq: envelope.seq,
							epoch: envelope.epoch,
							sessionId: envelope.sessionId,
							ts: Date.now(),
							frame: { kind: "reset", reason: "frame_exceeds_transport_limit" },
						},
					});
				}
			},
		});
		unsubscribe = attached;
		// Backlog delivery is synchronous. Once it returned, it is safe to
		// detach if it hit backpressure or an oversized envelope.
		if (paused) detachForPause();
	};
	resume();
	return stop;
}

async function dispatch(
	manager: AcpSessionManager,
	agentBrowserRuntime: AgentBrowserRuntime,
	toolController: SupersetToolController,
	request: AcpDaemonRequest,
	subscriptions: Map<string, () => void>,
	socket: net.Socket,
	write: (message: AcpDaemonResponse | AcpDaemonEvent) => boolean,
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
			case "discoverModels":
				result = await manager.discoverModels(
					request.params as Parameters<AcpSessionManager["discoverModels"]>[0],
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
			case "getTranscript":
				result = manager.getTranscript(
					request.params as Parameters<AcpSessionManager["getTranscript"]>[0],
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
			case "close": {
				const input = request.params as Parameters<
					AcpSessionManager["close"]
				>[0];
				await manager.close(input);
				await agentBrowserRuntime.closeSession(input.sessionId);
				break;
			}
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
			case "agentBrowserTool":
				result = await agentBrowserRuntime.execute(
					request.params as Parameters<AgentBrowserRuntime["execute"]>[0],
				);
				break;
			case "getAgentBrowserView":
				result = await agentBrowserRuntime.getView(
					request.params as Parameters<AgentBrowserRuntime["getView"]>[0],
				);
				break;
			case "setAgentBrowserViewport":
				await agentBrowserRuntime.setViewport(
					request.params as Parameters<AgentBrowserRuntime["setViewport"]>[0],
				);
				break;
			case "supersetTool":
				result = await toolController.execute(request.params, signal);
				break;
			case "getDelegatedExecution":
				result = toolController.getDelegatedExecution();
				break;
			case "subscribe": {
				const input = request.params as {
					subscriptionId: string;
					sessionId: string;
					since?: number;
					epoch?: string;
				};
				subscriptions.get(input.subscriptionId)?.();
				const unsubscribe = subscribeWithBackpressure({
					manager,
					socket,
					write,
					input,
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

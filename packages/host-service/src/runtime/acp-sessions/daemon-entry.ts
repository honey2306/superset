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
	readGlobalMcpServers,
	removeGlobalMcpServer,
	toAcpMcpServers,
	upsertGlobalMcpServer,
} from "../../global-mcp";
import {
	readGlobalSkills,
	removeGlobalSkill,
	upsertGlobalSkill,
} from "../../global-skills";
import {
	createProjectMemory,
	deleteProjectMemory,
	listProjectMemories,
	markProjectMemoriesUsed,
	resolveProjectIdForWorkspace,
	updateProjectMemory,
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
import { AgentBrowserRuntime } from "./agent-browser-runtime";
import { AcpArtifactStore } from "./artifact-store";
import { computerUseMcpServer } from "./computer-use-local-mcp";
import {
	ACP_DAEMON_BUILD_VERSION,
	ACP_DAEMON_PROTOCOL_VERSION,
	type AcpDaemonDiscussionOpenRequestedEvent,
	type AcpDaemonEvent,
	type AcpDaemonMergeRequestOpenRequestedEvent,
	type AcpDaemonRequest,
	type AcpDaemonResponse,
	type AcpDaemonSessionChangedEvent,
	type AcpDaemonSessionOpenRequestedEvent,
	type AcpDaemonTerminalOpenRequestedEvent,
	acpDaemonSocketPath,
} from "./daemon";
import { resolveKDevMergeRequestPage } from "./kdev-merge-request";
import {
	browserUseMcpServerFromEnvironment,
	embeddedBrowserUseMcpServer,
} from "./local-mcp";
import { resolvePeekabooExecutable } from "./peekaboo-executable";
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
	const computerUseEnabled =
		agentBrowserEnabled &&
		process.platform === "darwin" &&
		resolvePeekabooExecutable() !== null;
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
		resolveMcpServers: () => toAcpMcpServers(readGlobalMcpServers()),
		mcpServerFactory: ({ sessionId, role }) => {
			const embeddedBrowserMcp = agentBrowserEnabled
				? embeddedBrowserUseMcpServer({
						sessionId,
						cdpProxyUrl: requiredEnv("SUPERSET_AGENT_BROWSER_CDP_PROXY_URL"),
					})
				: null;
			const computerUseMcp = computerUseEnabled
				? computerUseMcpServer({ sessionId })
				: null;
			return [
				supersetMcpServer({ sessionId, daemonSocketPath: socketPath, role }),
				...(embeddedBrowserMcp ? [embeddedBrowserMcp] : []),
				...(computerUseMcp ? [computerUseMcp] : []),
			];
		},
		modelFacingInstructions: ({ role, workspaceId }) => {
			const embeddedBrowserInstructions = agentBrowserEnabled
				? [
						"## Embedded Agent Browser",
						"For every request to browse, open, inspect, or interact with a website, use the official browser-use MCP tools so the page appears in the conversation's Agent Browser pane.",
						"Never use shell commands such as `open`, `xdg-open`, or `start`, and never fall back to the OS/system browser. If an agent-browser tool fails, report the failure instead of claiming the page was opened.",
					].join("\n\n")
				: undefined;
			const computerUseInstructions = computerUseEnabled
				? [
						"## macOS Computer Use",
						"When the user asks you to inspect or operate a native macOS application, use the computer-use tools. Call computer_see for visual state or computer_inspect_ui for an Accessibility-only tree before element-based actions, and preserve Peekaboo element/snapshot identifiers exactly.",
						"The computer-use surface wraps all deterministic Peekaboo native capabilities, including app/window/menu/dialog/Dock/Space management, capture, clipboard, drag, semantic actions, and state verification. Peekaboo's autonomous agent loop and AI analyze tool are intentionally excluded because the current Superset Agent owns planning and reasoning.",
						"Computer Use actions execute immediately and visibly. Do not use them for websites; website tasks belong in the Embedded Agent Browser. If macOS reports missing Accessibility, Automation, or Screen Recording access, tell the user which permission to enable instead of using shell automation as a workaround.",
					].join("\n\n")
				: undefined;
			if (role !== SUPERSET_ROOT_COORDINATOR_ROLE) {
				return composeSupersetModelFacingInstructions([
					embeddedBrowserInstructions,
					computerUseInstructions,
				]);
			}
			const profiles = resolveDelegationProfileTargets(db);
			const summaries = profiles.map(toDelegationProfileSummary);
			const delegationInstructions = summaries.some(
				(profile) => profile.enabled && profile.valid,
			)
				? formatSupersetDelegationInstructions(summaries)
				: undefined;
			const projectId = resolveProjectIdForWorkspace(db, workspaceId);
			const projectMemories = projectId
				? listProjectMemories(db, {
						projectId,
						includeDisabled: false,
						limit: 12,
					})
				: [];
			const globalMemories = listProjectMemories(db, {
				projectId: null,
				includeDisabled: false,
				limit: 8,
			});
			const memories = [...projectMemories, ...globalMemories];
			markProjectMemoriesUsed(
				db,
				memories.map((memory) => memory.id),
			);
			return composeSupersetModelFacingInstructions([
				embeddedBrowserInstructions,
				computerUseInstructions,
				delegationInstructions,
				formatProjectMemoryInstructions([
					...projectMemories.map((memory) => ({
						title: memory.title,
						category: memory.category,
						scope: "project" as const,
					})),
					...globalMemories.map((memory) => ({
						title: memory.title,
						category: memory.category,
						scope: "global" as const,
					})),
				]),
			]);
		},
		generateTitle: ({ message }) => generateAcpSessionTitle(message),
	});
	await removeStaleSocket(socketPath);

	const clientWriters = new Set<
		(
			event:
				| AcpDaemonSessionOpenRequestedEvent
				| AcpDaemonDiscussionOpenRequestedEvent
				| AcpDaemonTerminalOpenRequestedEvent
				| AcpDaemonMergeRequestOpenRequestedEvent,
		) => void
	>();
	const toolController = new SupersetToolController({
		manager,
		delegationRuns: persistence,
		discussionRuns: persistence,
		listGlobalMcpServers: () =>
			readGlobalMcpServers().map((server) => {
				if (server.type === "stdio") {
					const { env, ...summary } = server;
					return { ...summary, envNames: Object.keys(env) };
				}
				const { headers, ...summary } = server;
				return { ...summary, headerNames: Object.keys(headers) };
			}),
		upsertGlobalMcpServer: (input) => upsertGlobalMcpServer(input),
		removeGlobalMcpServer: (name) => removeGlobalMcpServer(name),
		listGlobalSkills: () => readGlobalSkills(),
		upsertGlobalSkill: (input, options) => upsertGlobalSkill(input, options),
		removeGlobalSkill: (name) => removeGlobalSkill(name),
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
			const workspace = workspaceId
				? db.query.workspaces
						.findFirst({ where: eq(workspaces.id, workspaceId) })
						.sync()
				: undefined;
			if (workspaceId && !workspace) {
				throw new Error(`Workspace not found: ${workspaceId}`);
			}
			let pathProjectId: string | undefined;
			if (projectPath) {
				const canonicalProjectPath = canonicalizeHostPath(projectPath);
				const project = db.query.projects
					.findFirst({
						where: eq(projects.canonicalRepoPath, canonicalProjectPath),
					})
					.sync();
				if (!project) throw new Error(`Project not found: ${projectPath}`);
				pathProjectId = project.id;
			}
			const targetProjectIds = [
				workspace?.projectId,
				projectId,
				pathProjectId,
			].filter((value): value is string => value !== undefined);
			if (
				targetProjectIds.some(
					(targetProjectId) => targetProjectId !== targetProjectIds[0],
				)
			) {
				throw new Error(
					"workspaceId, projectId, and projectPath must identify the same project",
				);
			}
			if (workspace) return workspace.id;
			const resolvedProjectId = targetProjectIds[0];
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
			scope,
		}) => {
			const projectId =
				scope === "global"
					? null
					: resolveProjectIdForWorkspace(db, workspaceId);
			if (scope === "project" && !projectId) {
				throw new Error(`Workspace not found: ${workspaceId}`);
			}
			const result = createProjectMemory(db, {
				projectId,
				title,
				content,
				category,
				source: "agent",
				sourceSessionId,
				pinned,
			});
			return { ...result, projectId, scope };
		},
		searchProjectMemories: ({ workspaceId, query, limit, scope }) => {
			const projectId = resolveProjectIdForWorkspace(db, workspaceId);
			if ((scope === "project" || scope === "all") && !projectId) {
				throw new Error(`Workspace not found: ${workspaceId}`);
			}
			const projectResults =
				scope === "global"
					? []
					: listProjectMemories(db, {
							projectId,
							query,
							includeDisabled: false,
							limit,
						});
			const remaining = Math.max(0, limit - projectResults.length);
			const globalResults =
				scope === "project" || (scope === "all" && remaining === 0)
					? []
					: listProjectMemories(db, {
							projectId: null,
							query,
							includeDisabled: false,
							limit: scope === "all" ? remaining : limit,
						});
			const memories = [
				...projectResults.map((memory) => ({
					...memory,
					scope: "project" as const,
				})),
				...globalResults.map((memory) => ({
					...memory,
					scope: "global" as const,
				})),
			];
			markProjectMemoriesUsed(
				db,
				memories.map((memory) => memory.id),
			);
			return { projectId, scope, memories };
		},
		updateProjectMemory: ({ workspaceId, memoryId, scope, patch }) => {
			const projectId =
				scope === "global"
					? null
					: resolveProjectIdForWorkspace(db, workspaceId);
			if (scope === "project" && !projectId) {
				throw new Error(`Workspace not found: ${workspaceId}`);
			}
			const memory = updateProjectMemory(db, projectId, memoryId, patch);
			if (!memory) {
				throw new Error(`Memory not found in ${scope} scope: ${memoryId}`);
			}
			return { memory, projectId, scope };
		},
		deleteProjectMemory: ({ workspaceId, memoryId, scope }) => {
			const projectId =
				scope === "global"
					? null
					: resolveProjectIdForWorkspace(db, workspaceId);
			if (scope === "project" && !projectId) {
				throw new Error(`Workspace not found: ${workspaceId}`);
			}
			return {
				deleted: deleteProjectMemory(db, projectId, memoryId),
				projectId,
				scope,
			};
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
		terminal: createHostTerminalController(),
		onTerminalOpenRequested: (event) => {
			for (const write of clientWriters) {
				write({ type: "terminal-open-requested", ...event });
			}
		},
		onOpenRequested: (event) => {
			for (const write of clientWriters) {
				write({ type: "session-open-requested", ...event });
			}
		},
		onDiscussionOpenRequested: (event) => {
			for (const write of clientWriters) {
				write({ type: "discussion-open-requested", ...event });
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
				| AcpDaemonDiscussionOpenRequestedEvent
				| AcpDaemonTerminalOpenRequestedEvent
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

function createHostTerminalController() {
	const hostUrl = `http://127.0.0.1:${requiredEnv("HOST_SERVICE_PORT")}`;
	const token = requiredEnv("HOST_SERVICE_SECRET");
	const call = async (
		path: string,
		init: RequestInit,
	): Promise<Record<string, unknown>> => {
		const response = await fetch(`${hostUrl}${path}`, {
			...init,
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
				...init.headers,
			},
		});
		const payload: unknown = await response.json();
		if (!response.ok) {
			const message =
				typeof payload === "object" &&
				payload !== null &&
				"error" in payload &&
				typeof payload.error === "string"
					? payload.error
					: `Terminal request failed (${response.status})`;
			throw new Error(message);
		}
		return payload as Record<string, unknown>;
	};
	const query = (input: Record<string, string | number | undefined>) => {
		const params = new URLSearchParams();
		for (const [key, value] of Object.entries(input)) {
			if (value !== undefined) params.set(key, String(value));
		}
		return params.toString();
	};
	return {
		create: (input: Record<string, unknown>) =>
			call("/terminal/sessions", {
				method: "POST",
				body: JSON.stringify(input),
			}),
		write: (input: { workspaceId: string; terminalId: string; data: string }) =>
			call(`/terminal/sessions/${encodeURIComponent(input.terminalId)}/input`, {
				method: "POST",
				body: JSON.stringify({
					workspaceId: input.workspaceId,
					data: input.data,
				}),
			}),
		read: (input: {
			workspaceId: string;
			terminalId: string;
			cursor?: number;
			maxBytes: number;
		}) =>
			call(
				`/terminal/sessions/${encodeURIComponent(input.terminalId)}/output?${query(input)}`,
				{ method: "GET" },
			),
		status: (input: { workspaceId: string; terminalId: string }) =>
			call(
				`/terminal/sessions/${encodeURIComponent(input.terminalId)}/status?${query(input)}`,
				{ method: "GET" },
			),
		close: (input: { workspaceId: string; terminalId: string }) =>
			call(
				`/terminal/sessions/${encodeURIComponent(input.terminalId)}?${query(input)}`,
				{ method: "DELETE" },
			),
	};
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
			case "listDiscussions": {
				const input = request.params as { workspaceId: string; limit?: number };
				result = toolController.listDiscussions(input.workspaceId, input.limit);
				break;
			}
			case "stopDiscussion":
				result = await toolController.stopDiscussion(
					(request.params as { runId: string }).runId,
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
			case "steerPrompt":
				result = await manager.steerPrompt(
					request.params as Parameters<AcpSessionManager["steerPrompt"]>[0],
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

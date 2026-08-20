import { randomUUID } from "node:crypto";
import type {
	HarnessKind,
	SessionScopedState,
} from "@superset/session-protocol";
import {
	decodeMessagesCursor,
	SUPERSET_DELEGATED_EXECUTOR_ROLE,
	SUPERSET_ROOT_COORDINATOR_ROLE,
	type SupersetAgent,
	type SupersetDelegationProfileSummary,
	type SupersetToolRequest,
	supersetToolRequestSchema,
} from "@superset/session-protocol";
import type { DelegationProfileTarget } from "../../trpc/router/settings/delegated-execution-target";
import type { AcpSessionManager } from "./acp-sessions";
import type { DelegationRunPersistence } from "./persistence";

export interface AcpSessionOpenRequest {
	workspaceId: string;
	sessionId: string;
	sourceSessionId: string;
	harness: HarnessKind;
	reason: "context_limit" | "parallel_task" | "fresh_start" | "delegation";
	occurredAt: number;
}

export interface MergeRequestOpenRequest {
	workspaceId: string;
	sourceSessionId: string;
	provider: "kdev";
	url: string;
	sourceBranch: string;
	occurredAt: number;
}

export type SetProjectRunCommandResult =
	| { status: "configured"; commands: string[] }
	| { status: "already_configured"; commands: string[] };

export type DelegatedExecutionResolution =
	| ({ enabled: false } & DelegatedExecutionProfileState)
	| ({
			enabled: true;
			valid: false;
			error: string;
	  } & DelegatedExecutionProfileState)
	| ({
			enabled: true;
			valid: true;
			agent: SupersetAgent;
			model: string | null;
	  } & DelegatedExecutionProfileState);

interface DelegatedExecutionProfileState {
	profiles?: DelegationProfileTarget[];
	profilesConfigured?: boolean;
}

export interface SupersetToolControllerOptions {
	manager: AcpSessionManager;
	onOpenRequested?: (event: AcpSessionOpenRequest) => void;
	/** Resolves only the current session's KDev create-MR page. */
	openMergeRequest?: (input: {
		cwd: string;
	}) => Promise<{ provider: "kdev"; url: string; sourceBranch: string }>;
	onMergeRequestOpenRequested?: (event: MergeRequestOpenRequest) => void;
	setProjectRunCommand?: (input: {
		workspaceId: string;
		commands: string[];
	}) => Promise<SetProjectRunCommandResult> | SetProjectRunCommandResult;
	resolveDelegatedExecution?: () => DelegatedExecutionResolution;
	/** Optional to preserve in-process/legacy controller construction. */
	delegationRuns?: DelegationRunPersistence;
}

const AGENT_TO_HARNESS = {
	claude: "claude-agent-acp",
	codex: "codex-app-server",
	pi: "pi-acp",
	myflicker: "myflicker-acp",
	deepseek: "deepseek-acp",
} as const satisfies Record<SupersetAgent, HarnessKind>;

function projectSession(state: SessionScopedState) {
	return {
		sessionId: state.sessionId,
		harness: state.harness,
		status: state.status,
		title: state.title,
		lastStopReason: state.lastStopReason,
		lastError: state.lastError,
		createdAt: state.createdAt,
		updatedAt: state.updatedAt,
	};
}

function textPrompt(text: string) {
	return [{ type: "text" as const, text }];
}

type DelegationTerminalStatus = "completed" | "cancelled" | "interrupted";

function delegationStatusForStopReason(
	stopReason: string,
): DelegationTerminalStatus {
	if (stopReason === "cancelled" || stopReason === "cancel") return "cancelled";
	if (stopReason === "interrupted") return "interrupted";
	return "completed";
}

interface ChildLaunchRecord {
	child: Promise<SessionScopedState>;
	prompt: Promise<void>;
	openRequested: boolean;
	actualAgent: string | null;
	actualModel: string | null;
	harness: HarnessKind;
	childSessionId: string;
	delegationRunId: string | null;
	profileName: string | null;
	profileInstructions: string | null;
}

/**
 * Executes the host-owned semantics behind the bundled Superset MCP server.
 * Every operation derives its workspace from the source ACP session; callers
 * cannot name an arbitrary workspace or inspect/control a session elsewhere.
 */
export class SupersetToolController {
	private readonly manager: AcpSessionManager;
	private readonly onOpenRequested: SupersetToolControllerOptions["onOpenRequested"];
	private readonly openMergeRequest: SupersetToolControllerOptions["openMergeRequest"];
	private readonly onMergeRequestOpenRequested: SupersetToolControllerOptions["onMergeRequestOpenRequested"];
	private readonly setProjectRunCommand: SupersetToolControllerOptions["setProjectRunCommand"];
	private readonly resolveDelegatedExecution: SupersetToolControllerOptions["resolveDelegatedExecution"];
	private readonly delegationRuns: SupersetToolControllerOptions["delegationRuns"];
	private readonly childByIdempotencyKey = new Map<string, ChildLaunchRecord>();
	private readonly delegationRunByChildSessionId = new Map<string, string>();

	constructor(options: SupersetToolControllerOptions) {
		this.manager = options.manager;
		this.onOpenRequested = options.onOpenRequested;
		this.openMergeRequest = options.openMergeRequest;
		this.onMergeRequestOpenRequested = options.onMergeRequestOpenRequested;
		this.setProjectRunCommand = options.setProjectRunCommand;
		this.resolveDelegatedExecution = options.resolveDelegatedExecution;
		this.delegationRuns = options.delegationRuns;
		if (this.delegationRuns) {
			for (const run of this.delegationRuns.listActiveDelegationRuns()) {
				this.delegationRunByChildSessionId.set(run.childSessionId, run.id);
				this.reconcileDelegationRun(run.childSessionId);
			}
			this.manager.onSessionChanged?.((event) => {
				this.reconcileDelegationRun(event.sessionId);
			});
		}
	}

	/**
	 * Resolve the host-wide delegated executor without requiring a live source
	 * session. MCP servers ask for this while their parent adapter is still
	 * inside `session/new`, before the manager has published the runtime.
	 */
	getDelegatedExecution(): DelegatedExecutionResolution {
		return this.resolveDelegatedExecution?.() ?? { enabled: false };
	}

	async execute(
		input: unknown,
		signal?: AbortSignal,
	): Promise<Record<string, unknown>> {
		const request = supersetToolRequestSchema.parse(input);
		const source = this.manager.get(request.sourceSessionId);
		if (
			request.name === "delegate" &&
			this.manager.getRole?.(request.sourceSessionId) ===
				SUPERSET_DELEGATED_EXECUTOR_ROLE
		) {
			throw new Error("Delegated executor sessions cannot delegate again");
		}

		switch (request.name) {
			case "get_context": {
				const siblings = this.manager.list({
					workspaceId: source.workspaceId,
					limit: 100,
				});
				const delegatedExecution = this.getDelegatedExecution();
				return {
					workspaceId: source.workspaceId,
					cwd: source.cwd,
					currentSession: projectSession(source),
					sessions: siblings.items.map(projectSession),
					delegatedExecution,
					delegationProfiles: (delegatedExecution.profiles ?? []).map(
						(profile): SupersetDelegationProfileSummary => ({
							id: profile.id,
							name: profile.name,
							description: profile.description,
							enabled: profile.enabled,
							valid: profile.enabled && profile.valid,
							...(profile.agent ? { agent: profile.agent } : {}),
							...(profile.model !== undefined ? { model: profile.model } : {}),
						}),
					),
				};
			}
			case "list_sessions": {
				const page = this.manager.list({
					workspaceId: source.workspaceId,
					limit: request.arguments.limit,
				});
				return {
					workspaceId: source.workspaceId,
					items: page.items.map(projectSession),
					nextCursor: page.nextCursor,
				};
			}
			case "get_session_status": {
				const target = this.getWorkspaceSession(
					source,
					request.arguments.sessionId,
				);
				return projectSession(target);
			}
			case "get_session_messages": {
				const target = this.getWorkspaceSession(
					source,
					request.arguments.sessionId,
				);
				const beforeSeq = request.arguments.cursor
					? decodeMessagesCursor(request.arguments.cursor)
					: undefined;
				if (beforeSeq === null) {
					throw new Error("Invalid messages cursor");
				}
				const page = await this.manager.getMessages({
					sessionId: target.sessionId,
					beforeSeq,
					limit: request.arguments.limit,
				});
				return { ...page };
			}
			case "send_message": {
				const target = this.getWorkspaceSession(
					source,
					request.arguments.sessionId,
				);
				await this.manager.ensureLive(target.sessionId);
				const result = this.manager.enqueuePrompt({
					sessionId: target.sessionId,
					commandId: randomUUID(),
					prompt: textPrompt(request.arguments.message),
				});
				return {
					sessionId: target.sessionId,
					status: target.status,
					...result,
				};
			}
			case "continue_in_new_session":
				return this.createChild(request, source, {
					prompt: request.arguments.handoff,
					reason: request.arguments.reason,
				});
			case "delegate":
				return this.createChild(request, source, {
					prompt: request.arguments.task,
					reason: "delegation",
				});
			case "ask_user":
				return this.manager.askUser({
					sessionId: source.sessionId,
					questions: request.arguments.questions,
					signal,
				});
			case "set_project_run_command": {
				if (!this.setProjectRunCommand) {
					throw new Error("Project run command configuration is unavailable");
				}
				return this.setProjectRunCommand({
					workspaceId: source.workspaceId,
					commands: request.arguments.commands,
				});
			}
			case "update_plan": {
				const envelope = this.manager.updatePlan({
					sessionId: source.sessionId,
					entries: request.arguments.plan.map((entry) => ({
						content: entry.step,
						status: entry.status,
					})),
					explanation: request.arguments.explanation,
				});
				return {
					updated: true,
					sessionId: source.sessionId,
					seq: envelope.seq,
				};
			}
			case "open_merge_request": {
				if (!this.openMergeRequest) {
					throw new Error(
						"Merge request opening is unavailable in this runtime",
					);
				}
				const mergeRequest = await this.openMergeRequest({ cwd: source.cwd });
				this.onMergeRequestOpenRequested?.({
					workspaceId: source.workspaceId,
					sourceSessionId: source.sessionId,
					...mergeRequest,
					occurredAt: Date.now(),
				});
				return {
					provider: mergeRequest.provider,
					sourceBranch: mergeRequest.sourceBranch,
					opened: true,
				};
			}
			default:
				throw new Error("Unsupported Superset tool");
		}
	}

	private getWorkspaceSession(
		source: SessionScopedState,
		targetSessionId: string,
	): SessionScopedState {
		let target: SessionScopedState;
		try {
			target = this.manager.get(targetSessionId);
		} catch {
			throw new Error("Session is unavailable in the current workspace");
		}
		if (target.workspaceId !== source.workspaceId) {
			throw new Error("Session is unavailable in the current workspace");
		}
		return target;
	}

	private async createChild(
		request: Extract<
			SupersetToolRequest,
			{ name: "continue_in_new_session" | "delegate" }
		>,
		source: SessionScopedState,
		input: {
			prompt: string;
			reason: AcpSessionOpenRequest["reason"];
		},
	): Promise<Record<string, unknown>> {
		const idempotencyKey = request.arguments.idempotencyKey
			? `${source.sessionId}:${request.name}:${request.arguments.idempotencyKey}`
			: null;
		let record = idempotencyKey
			? this.childByIdempotencyKey.get(idempotencyKey)
			: undefined;
		const reused = record !== undefined;
		if (!record) {
			record = this.startChild(request, source, input);
			if (request.name === "delegate" && this.delegationRuns) {
				const now = Date.now();
				record.delegationRunId = randomUUID();
				this.delegationRuns.createDelegationRun({
					id: record.delegationRunId,
					parentSessionId: source.sessionId,
					parentWorkspaceId: source.workspaceId,
					childSessionId: record.childSessionId,
					childWorkspaceId: source.workspaceId,
					handoff: input.prompt,
					actualAgent: record.actualAgent,
					actualModel: record.actualModel,
					harness: record.harness,
					status: "creating",
					failureMessage: null,
					createdAt: now,
					startedAt: null,
					completedAt: null,
					failedAt: null,
					updatedAt: now,
				});
				this.delegationRunByChildSessionId.set(
					record.childSessionId,
					record.delegationRunId,
				);
				const createdRecord = record;
				void createdRecord.child.catch((error: unknown) => {
					this.markDelegationFailed(createdRecord, error);
				});
				void createdRecord.prompt.catch((error: unknown) => {
					this.markDelegationFailed(createdRecord, error);
				});
			}
			if (idempotencyKey) {
				this.childByIdempotencyKey.set(idempotencyKey, record);
				void record.child.catch(() => {
					if (this.childByIdempotencyKey.get(idempotencyKey) === record) {
						this.childByIdempotencyKey.delete(idempotencyKey);
					}
				});
			}
		} else {
			const failedPrompt = record.prompt;
			try {
				await failedPrompt;
			} catch {
				// Creation already succeeded. Retry prompt admission against the same
				// child instead of allocating duplicate delegated work.
				if (record.prompt === failedPrompt) {
					record.prompt = this.promptChildForRecord(
						record,
						this.buildDelegatedPrompt(record, input.prompt),
					);
				}
			}
		}

		await record.prompt;
		const child = await record.child;
		if (request.arguments.focus && !record.openRequested) {
			record.openRequested = true;
			try {
				this.onOpenRequested?.({
					workspaceId: source.workspaceId,
					sessionId: child.sessionId,
					sourceSessionId: source.sessionId,
					harness: child.harness,
					reason: input.reason,
					occurredAt: Date.now(),
				});
			} catch {
				// Presentation is explicitly best-effort and must never turn a
				// successfully started child into a failed tool call.
			}
		}
		return {
			sessionId: child.sessionId,
			workspaceId: source.workspaceId,
			reused,
			delegationRunId: record.delegationRunId,
			actualAgent: record.actualAgent,
			actualModel: record.actualModel,
		};
	}

	private startChild(
		request: Extract<
			SupersetToolRequest,
			{ name: "continue_in_new_session" | "delegate" }
		>,
		source: SessionScopedState,
		input: {
			prompt: string;
			reason: AcpSessionOpenRequest["reason"];
		},
	): ChildLaunchRecord {
		const selectedAgent =
			request.name === "continue_in_new_session"
				? request.arguments.agent
				: undefined;
		let actualAgent: string | null = selectedAgent ?? null;
		let actualModel: string | null = null;
		let harness = selectedAgent
			? AGENT_TO_HARNESS[selectedAgent]
			: source.harness;
		let profileName: string | null = null;
		let profileInstructions: string | null = null;

		if (request.name === "delegate") {
			const delegatedExecution = this.getDelegatedExecution();
			const selectedProfile = this.selectDelegationProfile(
				delegatedExecution,
				request.arguments.profileId,
			);
			if (selectedProfile) {
				profileName = selectedProfile.name;
				profileInstructions = selectedProfile.instructions;
				harness = AGENT_TO_HARNESS[selectedProfile.agent as SupersetAgent];
				actualAgent = selectedProfile.agent ?? null;
				actualModel = selectedProfile.model ?? null;
			} else if (delegatedExecution.enabled === false) {
				throw new Error("Delegated execution is disabled");
			} else if (!delegatedExecution.valid) {
				throw new Error(delegatedExecution.error);
			} else if (delegatedExecution.profiles === undefined) {
				// Legacy callers and in-process controllers may only provide the
				// original single target. Keep that path intact while profiles roll out.
				harness = AGENT_TO_HARNESS[delegatedExecution.agent];
				actualAgent = delegatedExecution.agent;
				actualModel = delegatedExecution.model;
			} else {
				throw new Error("Delegated execution target is unavailable");
			}
			if (!actualAgent || !AGENT_TO_HARNESS[actualAgent as SupersetAgent]) {
				throw new Error("The selected delegation profile has no ACP executor.");
			}
			harness = AGENT_TO_HARNESS[actualAgent as SupersetAgent];
			/*
			 * Profile-specific instructions are part of the child's task handoff,
			 * not parent-only context. This preserves the coordinator boundary while
			 * letting a profile specialize how the child approaches the task.
			 */
		}

		const childPrompt =
			request.name === "delegate"
				? this.buildDelegatedPrompt(
						{ profileName, profileInstructions },
						input.prompt,
					)
				: input.prompt;
		const childSessionId = randomUUID();
		const child = this.manager.create({
			sessionId: childSessionId,
			workspaceId: source.workspaceId,
			harness,
			role:
				request.name === "delegate"
					? SUPERSET_DELEGATED_EXECUTOR_ROLE
					: SUPERSET_ROOT_COORDINATOR_ROLE,
			...(actualModel ? { model: actualModel, strictModel: true } : {}),
		});
		const childPromise = Promise.resolve(child);
		const record: ChildLaunchRecord = {
			child: childPromise,
			prompt: Promise.resolve(),
			openRequested: false,
			actualAgent,
			actualModel,
			harness,
			childSessionId,
			delegationRunId: null,
			profileName,
			profileInstructions,
		};
		record.prompt = this.promptChildForRecord(record, childPrompt);
		return record;
	}

	private promptChildForRecord(
		record: ChildLaunchRecord,
		prompt: string,
	): Promise<void> {
		return this.promptChild(record.child, prompt, {
			onAdmitted: () => this.markDelegationRunning(record),
			onTurn: (turn) => this.watchDelegationTurn(record, turn),
		});
	}

	private buildDelegatedPrompt(
		record: Pick<ChildLaunchRecord, "profileName" | "profileInstructions">,
		prompt: string,
	): string {
		if (!record.profileInstructions) return prompt;
		return `Delegation profile: ${record.profileName ?? "configured profile"}\n\n${record.profileInstructions}\n\nDelegated task:\n${prompt}`;
	}

	private selectDelegationProfile(
		delegatedExecution: DelegatedExecutionResolution,
		profileId: string | undefined,
	): DelegationProfileTarget | null {
		const profiles = delegatedExecution.profiles;
		if (profiles === undefined) return null;
		const selected = profileId
			? profiles.find((profile) => profile.id === profileId)
			: profiles.find((profile) => profile.enabled && profile.valid);
		if (!selected) {
			if (profileId) {
				throw new Error(`Delegation profile '${profileId}' is unavailable.`);
			}
			if (delegatedExecution.profilesConfigured) {
				throw new Error("No enabled valid delegation profile is available.");
			}
			return null;
		}
		if (!selected.enabled) {
			throw new Error(`Delegation profile '${selected.name}' is disabled.`);
		}
		if (!selected.valid) {
			throw new Error(
				selected.error ??
					`Delegation profile '${selected.name}' has an invalid executor target.`,
			);
		}
		if (!selected.agent) {
			throw new Error(`Delegation profile '${selected.name}' has no executor.`);
		}
		return selected;
	}

	private async promptChild(
		childPromise: Promise<SessionScopedState>,
		prompt: string,
		callbacks?: {
			onAdmitted: () => void;
			onTurn: (turn: Promise<{ stopReason: string }>) => void;
		},
	): Promise<void> {
		const child = await childPromise;
		const result = await this.manager.prompt({
			sessionId: child.sessionId,
			commandId: randomUUID(),
			prompt: textPrompt(prompt),
		});
		callbacks?.onAdmitted();
		if (result && "turn" in result && result.turn) {
			callbacks?.onTurn(result.turn);
		}
	}

	private markDelegationRunning(record: ChildLaunchRecord): void {
		if (!record.delegationRunId || !this.delegationRuns) return;
		const now = Date.now();
		this.delegationRunByChildSessionId.set(
			record.childSessionId,
			record.delegationRunId,
		);
		this.delegationRuns.updateDelegationRun(record.delegationRunId, {
			status: "running",
			startedAt: now,
			completedAt: null,
			failedAt: null,
			failureMessage: null,
			updatedAt: now,
		});
	}

	private watchDelegationTurn(
		record: ChildLaunchRecord,
		turn: Promise<{ stopReason: string }>,
	): void {
		void turn.then(
			(result) => this.markDelegationStopped(record, result.stopReason),
			(error: unknown) => this.markDelegationFailed(record, error),
		);
	}

	private markDelegationStopped(
		record: ChildLaunchRecord,
		stopReason: string,
	): void {
		if (!record.delegationRunId || !this.delegationRuns) return;
		if (
			this.delegationRunByChildSessionId.get(record.childSessionId) !==
			record.delegationRunId
		) {
			return;
		}
		const now = Date.now();
		const status = delegationStatusForStopReason(stopReason);
		this.delegationRuns.updateDelegationRun(record.delegationRunId, {
			status,
			completedAt: status === "completed" ? now : null,
			failedAt: null,
			failureMessage: null,
			updatedAt: now,
		});
		this.delegationRunByChildSessionId.delete(record.childSessionId);
	}

	private markDelegationFailed(
		record: ChildLaunchRecord,
		error: unknown,
	): void {
		if (!record.delegationRunId || !this.delegationRuns) return;
		if (
			this.delegationRunByChildSessionId.get(record.childSessionId) !==
			record.delegationRunId
		) {
			return;
		}
		const now = Date.now();
		this.delegationRuns.updateDelegationRun(record.delegationRunId, {
			status: "failed",
			failureMessage: error instanceof Error ? error.message : String(error),
			completedAt: null,
			failedAt: now,
			updatedAt: now,
		});
		this.delegationRunByChildSessionId.delete(record.childSessionId);
	}

	private reconcileDelegationRun(childSessionId: string): void {
		const runId = this.delegationRunByChildSessionId.get(childSessionId);
		if (!runId || !this.delegationRuns) return;
		let child: SessionScopedState;
		try {
			child = this.manager.get(childSessionId);
		} catch {
			return;
		}
		if (child.lastError) {
			const now = Date.now();
			this.delegationRuns.updateDelegationRun(runId, {
				status: "failed",
				failureMessage: child.lastError,
				completedAt: null,
				failedAt: now,
				updatedAt: now,
			});
			this.delegationRunByChildSessionId.delete(childSessionId);
			return;
		}
		if (child.lastStopReason) {
			const now = Date.now();
			const status = delegationStatusForStopReason(child.lastStopReason);
			this.delegationRuns.updateDelegationRun(runId, {
				status,
				completedAt:
					status === "completed" ? (child.lastCompletedAt ?? now) : null,
				failedAt: null,
				failureMessage: null,
				updatedAt: now,
			});
			this.delegationRunByChildSessionId.delete(childSessionId);
		}
	}
}

import { randomUUID } from "node:crypto";
import type {
	HarnessKind,
	SessionScopedState,
} from "@superset/session-protocol";
import {
	type SupersetAgent,
	type SupersetToolRequest,
	supersetToolRequestSchema,
} from "@superset/session-protocol";
import type { AcpSessionManager } from "./acp-sessions";

export interface AcpSessionOpenRequest {
	workspaceId: string;
	sessionId: string;
	sourceSessionId: string;
	harness: HarnessKind;
	reason: "context_limit" | "parallel_task" | "fresh_start" | "delegation";
	occurredAt: number;
}

export interface SupersetToolControllerOptions {
	manager: AcpSessionManager;
	onOpenRequested?: (event: AcpSessionOpenRequest) => void;
}

const AGENT_TO_HARNESS = {
	claude: "claude-agent-acp",
	codex: "codex-app-server",
	pi: "pi-acp",
	myflicker: "myflicker-acp",
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

interface ChildLaunchRecord {
	child: Promise<SessionScopedState>;
	prompt: Promise<void>;
	openRequested: boolean;
}

/**
 * Executes the host-owned semantics behind the bundled Superset MCP server.
 * Every operation derives its workspace from the source ACP session; callers
 * cannot name an arbitrary workspace or inspect/control a session elsewhere.
 */
export class SupersetToolController {
	private readonly manager: AcpSessionManager;
	private readonly onOpenRequested: SupersetToolControllerOptions["onOpenRequested"];
	private readonly childByIdempotencyKey = new Map<string, ChildLaunchRecord>();

	constructor(options: SupersetToolControllerOptions) {
		this.manager = options.manager;
		this.onOpenRequested = options.onOpenRequested;
	}

	async execute(input: unknown): Promise<Record<string, unknown>> {
		const request = supersetToolRequestSchema.parse(input);
		const source = this.manager.get(request.sourceSessionId);

		switch (request.name) {
			case "get_context": {
				const siblings = this.manager.list({
					workspaceId: source.workspaceId,
					limit: 100,
				});
				return {
					workspaceId: source.workspaceId,
					cwd: source.cwd,
					currentSession: projectSession(source),
					sessions: siblings.items.map(projectSession),
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
					record.prompt = this.promptChild(record.child, input.prompt);
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
		const selectedAgent = request.arguments.agent;
		const harness = selectedAgent
			? AGENT_TO_HARNESS[selectedAgent]
			: source.harness;
		const child = this.manager.create({
			sessionId: randomUUID(),
			workspaceId: source.workspaceId,
			harness,
		});
		const childPromise = Promise.resolve(child);
		return {
			child: childPromise,
			prompt: this.promptChild(childPromise, input.prompt),
			openRequested: false,
		};
	}

	private async promptChild(
		childPromise: Promise<SessionScopedState>,
		prompt: string,
	): Promise<void> {
		const child = await childPromise;
		await this.manager.prompt({
			sessionId: child.sessionId,
			commandId: randomUUID(),
			prompt: textPrompt(prompt),
		});
	}
}

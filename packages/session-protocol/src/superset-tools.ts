import { z } from "zod";

export const supersetAgentSchema = z.enum([
	"claude",
	"codex",
	"pi",
	"myflicker",
	"deepseek",
]);

const sessionIdSchema = z.string().min(1).max(256);
const messageSchema = z.string().min(1).max(100_000);

const getContextArgsSchema = z.object({}).strict();
const listSessionsArgsSchema = z
	.object({ limit: z.number().int().min(1).max(100).default(20) })
	.strict();
const getSessionStatusArgsSchema = z
	.object({ sessionId: sessionIdSchema })
	.strict();
const openSessionArgsSchema = z.object({ sessionId: sessionIdSchema }).strict();
const getSessionMessagesArgsSchema = z
	.object({
		sessionId: sessionIdSchema,
		cursor: z
			.string()
			.regex(/^s[1-9][0-9]*$/, "expected an s<sequence> messages cursor")
			.refine(
				(cursor) => Number.isSafeInteger(Number(cursor.slice(1))),
				"expected a safe-integer messages cursor",
			)
			.optional(),
		limit: z.number().int().min(1).max(200).default(50),
	})
	.strict();
const sendMessageArgsSchema = z
	.object({
		sessionId: sessionIdSchema,
		message: messageSchema,
	})
	.strict();
const targetWorkspaceIdSchema = z.string().trim().min(1).max(256);
const targetProjectIdSchema = z.string().trim().min(1).max(256);
const targetProjectPathSchema = z.string().trim().min(1).max(2_000);

// Keep the historical reason accepted by the runtime request parser. It is
// intentionally omitted from the model-facing definition below so a model
// cannot mistake a continuation for a delegation primitive.
const continueInNewSessionArgsSchema = z
	.object({
		reason: z
			.enum(["context_limit", "parallel_task", "fresh_start"])
			.default("context_limit"),
		handoff: messageSchema,
		workspaceId: targetWorkspaceIdSchema.optional(),
		projectId: targetProjectIdSchema.optional(),
		projectPath: targetProjectPathSchema.optional(),
		agent: supersetAgentSchema.optional(),
		focus: z.boolean().default(true),
		idempotencyKey: z.string().min(1).max(128).optional(),
	})
	.strict();

const MAX_DELEGATION_PAYLOAD_BYTES = 32 * 1024;

function addSerializedPayloadLimit<T extends z.ZodTypeAny>(schema: T) {
	return schema.superRefine((value, context) => {
		const serialized = JSON.stringify(value);
		if (serialized === undefined) return;
		const bytes = new TextEncoder().encode(serialized).byteLength;
		if (bytes > MAX_DELEGATION_PAYLOAD_BYTES) {
			context.addIssue({
				code: "custom",
				message: `serialized delegation payload must be at most ${MAX_DELEGATION_PAYLOAD_BYTES} bytes`,
			});
		}
	});
}

const delegationContextSnapshotSchema = addSerializedPayloadLimit(
	z
		.object({
			summary: z.string().trim().min(1).max(4_000).optional(),
			relevantFacts: z
				.array(z.string().trim().min(1).max(1_000))
				.max(20)
				.optional(),
			relevantFiles: z
				.array(z.string().trim().min(1).max(1_000))
				.max(30)
				.optional(),
			constraints: z
				.array(z.string().trim().min(1).max(1_000))
				.max(20)
				.optional(),
			acceptanceChecks: z
				.array(z.string().trim().min(1).max(1_000))
				.max(20)
				.optional(),
		})
		.strict(),
);

const delegationValidationSchema = z
	.object({
		command: z.string().trim().min(1).max(1_000),
		status: z.enum(["passed", "failed", "not_run"]),
		details: z.string().trim().max(2_000).optional(),
	})
	.strict();

const delegationResultSchema = addSerializedPayloadLimit(
	z
		.object({
			summary: z.string().trim().min(1).max(4_000),
			filesChanged: z
				.array(z.string().trim().min(1).max(1_000))
				.max(100)
				.optional(),
			validation: z.array(delegationValidationSchema).max(50).optional(),
			notes: z.array(z.string().trim().min(1).max(1_000)).max(50).optional(),
		})
		.strict(),
);

const delegateArgsSchema = z
	.object({
		task: messageSchema,
		workspaceId: targetWorkspaceIdSchema.optional(),
		projectId: targetProjectIdSchema.optional(),
		projectPath: targetProjectPathSchema.optional(),
		/** Optional for backwards compatibility; configured profiles require it at runtime. */
		profileId: z.string().trim().min(1).max(128).optional(),
		contextSnapshot: delegationContextSnapshotSchema.optional(),
		focus: z.boolean().default(false),
		idempotencyKey: z.string().min(1).max(128).optional(),
	})
	.strict();
const waitDelegationArgsSchema = z
	.object({
		delegationRunId: z.string().trim().min(1).max(256),
	})
	.strict();
export const projectMemoryCategorySchema = z.enum([
	"debugging",
	"architecture",
	"workflow",
	"environment",
	"preference",
	"other",
]);
const rememberProjectMemoryArgsSchema = z
	.object({
		title: z.string().trim().min(1).max(200),
		content: z.string().trim().min(1).max(20_000),
		category: projectMemoryCategorySchema.default("other"),
		pinned: z.boolean().default(false),
	})
	.strict();
const searchProjectMemoriesArgsSchema = z
	.object({
		query: z.string().trim().max(500).default(""),
		limit: z.number().int().min(1).max(50).default(10),
	})
	.strict();
const setProjectRunCommandArgsSchema = z
	.object({
		commands: z.array(z.string().trim().min(1).max(10_000)).min(1).max(20),
	})
	.strict();
const updatePlanArgsSchema = z
	.object({
		plan: z
			.array(
				z
					.object({
						step: z.string().trim().min(1).max(10_000),
						status: z.enum(["pending", "in_progress", "completed"]),
					})
					.strict(),
			)
			.min(1)
			.max(50),
		explanation: z.string().trim().min(1).max(10_000).optional(),
	})
	.strict()
	.superRefine((value, context) => {
		const inProgressCount = value.plan.filter(
			(entry) => entry.status === "in_progress",
		).length;
		if (inProgressCount > 1) {
			context.addIssue({
				code: "custom",
				path: ["plan"],
				message: "A plan may have at most one in_progress step",
			});
		}
	});
const openMergeRequestArgsSchema = z.object({}).strict();
const askUserArgsSchema = z
	.object({
		questions: z
			.array(
				z
					.object({
						question: z.string().trim().min(1).max(10_000),
						header: z.string().trim().min(1).max(100),
						options: z
							.array(
								z
									.object({
										label: z.string().trim().min(1).max(500),
										description: z.string().trim().max(2_000).optional(),
									})
									.strict(),
							)
							.min(1)
							.max(20),
						multiSelect: z.boolean().default(false),
						allowCustomResponse: z.boolean().default(true),
					})
					.strict(),
			)
			.min(1)
			.max(4),
	})
	.strict();

export type AskUserArguments = z.infer<typeof askUserArgsSchema>;
export interface AskUserAnswer {
	question: string;
	selectedLabels: string[];
	customResponse?: string;
}
export type AskUserResult =
	| { action: "answered"; answers: AskUserAnswer[] }
	| { action: "cancelled"; answers: AskUserAnswer[] };

export const supersetToolRequestSchema = z.discriminatedUnion("name", [
	z.object({
		sourceSessionId: sessionIdSchema,
		name: z.literal("get_context"),
		arguments: getContextArgsSchema,
	}),
	z.object({
		sourceSessionId: sessionIdSchema,
		name: z.literal("list_sessions"),
		arguments: listSessionsArgsSchema,
	}),
	z.object({
		sourceSessionId: sessionIdSchema,
		name: z.literal("get_session_status"),
		arguments: getSessionStatusArgsSchema,
	}),
	z.object({
		sourceSessionId: sessionIdSchema,
		name: z.literal("open_session"),
		arguments: openSessionArgsSchema,
	}),
	z.object({
		sourceSessionId: sessionIdSchema,
		name: z.literal("get_session_messages"),
		arguments: getSessionMessagesArgsSchema,
	}),
	z.object({
		sourceSessionId: sessionIdSchema,
		name: z.literal("send_message"),
		arguments: sendMessageArgsSchema,
	}),
	z.object({
		sourceSessionId: sessionIdSchema,
		name: z.literal("continue_in_new_session"),
		arguments: continueInNewSessionArgsSchema,
	}),
	z.object({
		sourceSessionId: sessionIdSchema,
		name: z.literal("delegate"),
		arguments: delegateArgsSchema,
	}),
	z.object({
		sourceSessionId: sessionIdSchema,
		name: z.literal("wait_delegation"),
		arguments: waitDelegationArgsSchema,
	}),
	z.object({
		sourceSessionId: sessionIdSchema,
		name: z.literal("report_delegation_result"),
		arguments: z
			.object({
				delegationRunId: z.string().trim().min(1).max(256),
				result: delegationResultSchema,
			})
			.strict(),
	}),
	z.object({
		sourceSessionId: sessionIdSchema,
		name: z.literal("remember_project_memory"),
		arguments: rememberProjectMemoryArgsSchema,
	}),
	z.object({
		sourceSessionId: sessionIdSchema,
		name: z.literal("search_project_memories"),
		arguments: searchProjectMemoriesArgsSchema,
	}),
	z.object({
		sourceSessionId: sessionIdSchema,
		name: z.literal("set_project_run_command"),
		arguments: setProjectRunCommandArgsSchema,
	}),
	z.object({
		sourceSessionId: sessionIdSchema,
		name: z.literal("update_plan"),
		arguments: updatePlanArgsSchema,
	}),
	z.object({
		sourceSessionId: sessionIdSchema,
		name: z.literal("open_merge_request"),
		arguments: openMergeRequestArgsSchema,
	}),
	z.object({
		sourceSessionId: sessionIdSchema,
		name: z.literal("ask_user"),
		arguments: askUserArgsSchema,
	}),
]);

export type SupersetAgent = z.infer<typeof supersetAgentSchema>;
export type UpdatePlanArguments = z.infer<typeof updatePlanArgsSchema>;
export type SupersetToolRequest = z.infer<typeof supersetToolRequestSchema>;
export type DelegationContextSnapshot = z.infer<
	typeof delegationContextSnapshotSchema
>;
export type DelegationResult = z.infer<typeof delegationResultSchema>;

/** Persisted role of an ACP session in Superset's coordinator boundary. */
export const SUPERSET_ROOT_COORDINATOR_ROLE = "root-coordinator" as const;
export const SUPERSET_DELEGATED_EXECUTOR_ROLE = "delegated-executor" as const;
export type SupersetSessionRole =
	| typeof SUPERSET_ROOT_COORDINATOR_ROLE
	| typeof SUPERSET_DELEGATED_EXECUTOR_ROLE;

/**
 * Model-facing guidance for Superset's user-visible execution plan.
 *
 * Keep this separate from delegation guidance so every coordinator session
 * receives it, including workspaces where delegation is disabled. The
 * session manager composes it with the role-specific instructions below.
 */
export const SUPERSET_PLAN_INSTRUCTIONS =
	"Use Superset's `update_plan` tool for user-visible planning. For multi-step or complex tasks, before implementation or tool execution, publish the complete current plan. Simple tasks do not require a plan. Submit every step on each update, keeping at most one step `in_progress`; immediately call `update_plan` again whenever a step starts or completes, or whenever the plan changes. Before the final response, update the plan so it accurately reflects the final state, including any incomplete work. Do not use provider-specific or private todo/task tools for user-visible plans.";

export interface ProjectMemoryInstructionItem {
	title: string;
	category: string;
}

export function formatProjectMemoryInstructions(
	memories: readonly ProjectMemoryInstructionItem[],
): string {
	const prelude =
		"Project memory is shared across conversations and worktrees. When the user asks you to remember or record something, call `remember_project_memory`. Also record durable, verified knowledge that would prevent future repeated investigation, such as non-obvious debugging chains, stable architecture constraints, environment setup, and recurring workflows. Do not record temporary task progress, readily discoverable code facts, unverified guesses, credentials, tokens, cookies, secrets, transient ports, or process IDs. The automatically injected list is only a compact title index; call `search_project_memories` to retrieve full details before relying on a relevant memory, repeating expensive investigation, or creating a likely duplicate.";
	if (memories.length === 0) return prelude;
	const rendered = memories.map(
		(memory) => `- ${memory.title} (${memory.category})`,
	);
	return `${prelude}\n\nProject memory index:\n${rendered.join("\n")}`;
}

/** Compose non-empty model-facing instruction sections without extra spacing. */
export function composeSupersetModelFacingInstructions(
	instructions: readonly (string | undefined)[],
): string | undefined {
	const sections = instructions
		.map((instruction) => instruction?.trim())
		.filter((instruction): instruction is string => Boolean(instruction));
	return sections.length > 0 ? sections.join("\n\n") : undefined;
}

/** The model-facing subset of a configurable delegation profile. */
export interface SupersetDelegationProfileSummary {
	id: string;
	name: string;
	description: string;
	enabled: boolean;
	valid: boolean;
	agent?: SupersetAgent;
	model?: string | null;
}

export function formatSupersetDelegationInstructions(
	profiles: readonly SupersetDelegationProfileSummary[] = [],
): string {
	const availableProfiles = profiles.filter(
		(profile) => profile.enabled && profile.valid,
	);
	const profileText =
		availableProfiles.length === 0
			? ""
			: ` Available profiles (provide profileId when calling Superset delegate; it is required for persisted profiles): ${availableProfiles
					.map(
						(profile) =>
							`id=${profile.id}, name=${profile.name}, when to use=${profile.description}`,
					)
					.join("; ")}.`;
	return `${SUPERSET_DELEGATION_INSTRUCTIONS}${profileText}`;
}

/** `_meta` key used to carry Superset-only model instructions through ACP. */
export const SUPERSET_DELEGATION_META_KEY =
	"sh.superset/delegationInstructions" as const;

/**
 * Instructions exposed when the Superset delegate tool is available.
 *
 * Keep this explicit about the boundary with native harness subagents. The
 * current ACP session is the parent/coordinator: native subagent tools belong
 * to the provider, while `delegate` is the Superset handoff that creates and
 * tracks a child ACP session. These instructions are copied into each
 * harness's highest-priority supported prompt field as well as MCP metadata.
 */
export const SUPERSET_DELEGATION_INSTRUCTIONS =
	"Superset delegated execution is enabled for this workspace. You are the parent/coordinator Agent: execute work directly by default. Use the Superset `delegate` tool only when a task is clearly independent, tightly bounded, and delegation is worth the overhead; usually use 1–3 children, each with a distinct, non-overlapping responsibility. Do not delegate dependent tasks. When delegating, provide a self-contained objective, a finite structured contextSnapshot containing only facts relevant to that child, constraints, relevant files, and acceptance checks. The Superset delegate is distinct from native harness subagent tools (such as Claude Task or Codex spawn_agent): for tracked implementation work, use Superset `delegate` instead of those native tools. If repository or project instructions require delegating implementation to a subagent, satisfy that requirement with Superset `delegate`; do not additionally create a provider-native subagent. After `delegate` returns a `delegationRunId`, use `wait_delegation` to wait for that child run to reach a terminal state instead of polling list_sessions or get_session_status; then inspect its actual changes and validation, continue coordinating or fix gaps yourself, and only then accept the result and reply to the user. Only follow this instruction when the Superset `delegate` tool is present in the available tools.";

/**
 * High-priority instructions for a child created by Superset `delegate`.
 * Deliberately contains no coordinator/delegation guidance: a delegated child
 * is an executor and must finish the handed-off task itself.
 */
export const SUPERSET_DELEGATED_EXECUTOR_INSTRUCTIONS =
	"You are a delegated executor Agent running inside a Superset child session. Directly execute the current delegated task in the workspace, including inspecting files, making the requested changes, and running the relevant validation. You receive only a finite context snapshot relevant to this task; verify decision-critical facts in the workspace and do not infer or require context from sibling tasks. Do not use any delegation or subagent mechanism: do not call Superset `delegate`, and do not use provider-native tools such as Codex `spawn_agent` or Claude `Task`. Perform the work yourself and do not hand it back for further delegation. Before finishing, call Superset `report_delegation_result` with the provided delegationRunId and a concise structured summary of work, changed files, validation, and notes.";

/** JSON Schemas advertised by the bundled Superset MCP server. */
export const SUPERSET_TOOL_DEFINITIONS = [
	{
		name: "ask_user",
		description:
			"Ask the user one or more structured questions and wait for their answers. Use this instead of asking questions in plain text. Each question may allow one choice, multiple choices, or a custom response.",
		inputSchema: {
			type: "object",
			properties: {
				questions: {
					type: "array",
					minItems: 1,
					maxItems: 4,
					items: {
						type: "object",
						properties: {
							question: { type: "string", minLength: 1, maxLength: 10_000 },
							header: { type: "string", minLength: 1, maxLength: 100 },
							options: {
								type: "array",
								minItems: 1,
								maxItems: 20,
								items: {
									type: "object",
									properties: {
										label: {
											type: "string",
											minLength: 1,
											maxLength: 500,
										},
										description: { type: "string", maxLength: 2_000 },
									},
									required: ["label"],
									additionalProperties: false,
								},
							},
							multiSelect: { type: "boolean", default: false },
							allowCustomResponse: { type: "boolean", default: true },
						},
						required: ["question", "header", "options"],
						additionalProperties: false,
					},
				},
			},
			required: ["questions"],
			additionalProperties: false,
		},
	},
	{
		name: "get_context",
		description:
			"Get the current Superset ACP session, workspace, and sibling session summaries. Call this before coordinating other sessions.",
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
	{
		name: "list_sessions",
		description:
			"List ACP sessions in the current workspace. Sessions outside the current workspace are never exposed.",
		inputSchema: {
			type: "object",
			properties: {
				limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
			},
			additionalProperties: false,
		},
	},
	{
		name: "get_session_status",
		description: "Get details for an ACP session in the current workspace.",
		inputSchema: {
			type: "object",
			properties: {
				sessionId: { type: "string", minLength: 1, maxLength: 256 },
			},
			required: ["sessionId"],
			additionalProperties: false,
		},
	},
	{
		name: "open_session",
		description:
			"Open or focus an existing ACP conversation in the current workspace. If its tab is missing, Superset restores it. The sessionId must belong to the current workspace; Desktop opening is best-effort and does not restart the session.",
		inputSchema: {
			type: "object",
			properties: {
				sessionId: { type: "string", minLength: 1, maxLength: 256 },
			},
			required: ["sessionId"],
			additionalProperties: false,
		},
	},
	{
		name: "get_session_messages",
		description:
			"Read persisted user, agent, and thought messages for an ACP session in the current workspace. Large content is truncated and raw tool payloads are omitted. Results are newest-first; pass nextCursor as cursor to fetch older messages.",
		inputSchema: {
			type: "object",
			properties: {
				sessionId: { type: "string", minLength: 1, maxLength: 256 },
				cursor: {
					type: "string",
					pattern: "^s[1-9][0-9]*$",
				},
				limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
			},
			required: ["sessionId"],
			additionalProperties: false,
		},
	},
	{
		name: "send_message",
		description:
			"Send or queue a message to another ACP session in the current workspace.",
		inputSchema: {
			type: "object",
			properties: {
				sessionId: { type: "string", minLength: 1, maxLength: 256 },
				message: { type: "string", minLength: 1, maxLength: 100_000 },
			},
			required: ["sessionId", "message"],
			additionalProperties: false,
		},
	},
	{
		name: "continue_in_new_session",
		description:
			"Continue work in a fresh ACP conversation. This tool is only for handing off continuation context or opening a new conversation; do not use it to delegate independent work or run parallel background tasks. When provider-native subagent tools (such as pi-subagents) are available, use them for scoped subagent work; otherwise use Superset `delegate` for tracked independent execution. Provide a self-contained handoff with goal, completed work, decisions, changed files, and next steps. Defaults to a Pi session unless agent is explicitly specified. Optionally pass workspaceId, projectId, or projectPath to start the conversation in another workspace/project. Superset can open the child session in a new tab.",
		inputSchema: {
			type: "object",
			properties: {
				reason: {
					type: "string",
					enum: ["context_limit", "fresh_start"],
					default: "context_limit",
				},
				handoff: { type: "string", minLength: 1, maxLength: 100_000 },
				workspaceId: { type: "string", minLength: 1, maxLength: 256 },
				projectId: { type: "string", minLength: 1, maxLength: 256 },
				projectPath: { type: "string", minLength: 1, maxLength: 2_000 },
				agent: {
					type: "string",
					enum: ["claude", "codex", "pi", "myflicker", "deepseek"],
				},
				focus: { type: "boolean", default: true },
				idempotencyKey: { type: "string", minLength: 1, maxLength: 128 },
			},
			required: ["handoff"],
			additionalProperties: false,
		},
	},
	{
		name: "delegate",
		description:
			"Delegate only a clearly independent, tightly bounded task when it is worth the overhead; usually use 1–3 children with distinct, non-overlapping responsibilities. Execute directly by default and do not delegate dependent tasks. When delegating, provide a finite structured contextSnapshot containing only facts relevant to this child; each snapshot is structurally bounded and serialized to at most 32 KiB. With persisted profiles configured, profileId is required; generated defaults and the legacy single target may omit it. Optionally pass workspaceId, projectId, or projectPath to start the child in another workspace/project. The child runs independently; after this tool returns a delegationRunId, use wait_delegation for event-driven completion rather than polling list_sessions/get_session_status, then inspect the child's actual changes and validation before accepting the work.",
		inputSchema: {
			type: "object",
			properties: {
				task: { type: "string", minLength: 1, maxLength: 100_000 },
				workspaceId: { type: "string", minLength: 1, maxLength: 256 },
				projectId: { type: "string", minLength: 1, maxLength: 256 },
				projectPath: { type: "string", minLength: 1, maxLength: 2_000 },
				profileId: { type: "string", minLength: 1, maxLength: 128 },
				contextSnapshot: {
					type: "object",
					properties: {
						summary: { type: "string", minLength: 1, maxLength: 4_000 },
						relevantFacts: {
							type: "array",
							items: { type: "string", minLength: 1, maxLength: 1_000 },
							maxItems: 20,
						},
						relevantFiles: {
							type: "array",
							items: { type: "string", minLength: 1, maxLength: 1_000 },
							maxItems: 30,
						},
						constraints: {
							type: "array",
							items: { type: "string", minLength: 1, maxLength: 1_000 },
							maxItems: 20,
						},
						acceptanceChecks: {
							type: "array",
							items: { type: "string", minLength: 1, maxLength: 1_000 },
							maxItems: 20,
						},
					},
					additionalProperties: false,
				},
				focus: { type: "boolean", default: false },
				idempotencyKey: { type: "string", minLength: 1, maxLength: 128 },
			},
			required: ["task"],
			additionalProperties: false,
		},
	},
	{
		name: "wait_delegation",
		description:
			"Wait for a delegated child run to complete, be cancelled/interrupted, or fail. This wait is event-driven and may remain pending for a long time; use it once with the delegationRunId returned by delegate instead of repeatedly polling list_sessions or get_session_status. The result includes the terminal status, any failure message, and the child's structured result when reported.",
		inputSchema: {
			type: "object",
			properties: {
				delegationRunId: { type: "string", minLength: 1, maxLength: 256 },
			},
			required: ["delegationRunId"],
			additionalProperties: false,
		},
	},
	{
		name: "report_delegation_result",
		description:
			"Child-only tool: report the finite structured result for the current delegated run before finishing. Include a concise summary, changed files, validation commands/statuses, and notes; the serialized result is at most 32 KiB. The host validates and persists the result; it does not merge sibling context.",
		inputSchema: {
			type: "object",
			properties: {
				delegationRunId: { type: "string", minLength: 1, maxLength: 256 },
				result: {
					type: "object",
					properties: {
						summary: { type: "string", minLength: 1, maxLength: 4_000 },
						filesChanged: {
							type: "array",
							items: { type: "string", minLength: 1, maxLength: 1_000 },
							maxItems: 100,
						},
						validation: {
							type: "array",
							items: {
								type: "object",
								properties: {
									command: { type: "string", minLength: 1, maxLength: 1_000 },
									status: {
										type: "string",
										enum: ["passed", "failed", "not_run"],
									},
									details: { type: "string", maxLength: 2_000 },
								},
								required: ["command", "status"],
								additionalProperties: false,
							},
							maxItems: 50,
						},
						notes: {
							type: "array",
							items: { type: "string", minLength: 1, maxLength: 1_000 },
							maxItems: 50,
						},
					},
					required: ["summary"],
					additionalProperties: false,
				},
			},
			required: ["delegationRunId", "result"],
			additionalProperties: false,
		},
	},
	{
		name: "remember_project_memory",
		description:
			"Store durable, verified knowledge for the current project so future conversations and worktrees can reuse it. Use when the user asks to remember/record something or after discovering a non-obvious reusable debugging chain, constraint, environment fact, or workflow. Never store secrets or temporary task progress.",
		inputSchema: {
			type: "object",
			properties: {
				title: { type: "string", minLength: 1, maxLength: 200 },
				content: { type: "string", minLength: 1, maxLength: 20_000 },
				category: {
					type: "string",
					enum: [
						"debugging",
						"architecture",
						"workflow",
						"environment",
						"preference",
						"other",
					],
					default: "other",
				},
				pinned: { type: "boolean", default: false },
			},
			required: ["title", "content"],
			additionalProperties: false,
		},
	},
	{
		name: "search_project_memories",
		description:
			"Search enabled memory for the current project before repeating expensive investigation. An empty query returns the highest-priority recent memories.",
		inputSchema: {
			type: "object",
			properties: {
				query: { type: "string", maxLength: 500, default: "" },
				limit: { type: "integer", minimum: 1, maximum: 50, default: 10 },
			},
			additionalProperties: false,
		},
	},
	{
		name: "set_project_run_command",
		description:
			"Set the current project's workspace run command after inspecting its manifests, package-manager lockfile, documentation, and monorepo structure. Use only when no run command is configured; Superset will refuse to overwrite an existing command. The project is derived from the current ACP session and cannot be selected by the caller.",
		inputSchema: {
			type: "object",
			properties: {
				commands: {
					type: "array",
					items: { type: "string", minLength: 1, maxLength: 10_000 },
					minItems: 1,
					maxItems: 20,
				},
			},
			required: ["commands"],
			additionalProperties: false,
		},
	},
	{
		name: "update_plan",
		description:
			"Publish the complete current execution plan for this session in Superset's ACP timeline. Use this Superset tool before implementation or tool execution for multi-step or complex tasks; simple tasks do not require a plan. Update it immediately when a step starts or completes, or when the plan changes. Submit every step on each call; each step must be pending, in_progress, or completed, with at most one in_progress step. Update the plan before the final response so it reflects the final state. Do not rely on provider-specific or private task/todo tools for user-visible plans.",
		inputSchema: {
			type: "object",
			properties: {
				plan: {
					type: "array",
					minItems: 1,
					maxItems: 50,
					items: {
						type: "object",
						properties: {
							step: { type: "string", minLength: 1, maxLength: 10_000 },
							status: {
								type: "string",
								enum: ["pending", "in_progress", "completed"],
							},
						},
						required: ["step", "status"],
						additionalProperties: false,
					},
				},
				explanation: { type: "string", minLength: 1, maxLength: 10_000 },
			},
			required: ["plan"],
			additionalProperties: false,
		},
	},
	{
		name: "open_merge_request",
		description:
			"Open the KDev create merge request page for the current session's checked-out branch. The repository and branch are derived from the session; this tool never pushes commits or creates a merge request.",
		inputSchema: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	},
] as const;

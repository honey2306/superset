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
const continueInNewSessionArgsSchema = z
	.object({
		reason: z
			.enum(["context_limit", "parallel_task", "fresh_start"])
			.default("context_limit"),
		handoff: messageSchema,
		agent: supersetAgentSchema.optional(),
		focus: z.boolean().default(true),
		idempotencyKey: z.string().min(1).max(128).optional(),
	})
	.strict();
const delegateArgsSchema = z
	.object({
		task: messageSchema,
		focus: z.boolean().default(false),
		idempotencyKey: z.string().min(1).max(128).optional(),
	})
	.strict();
const setProjectRunCommandArgsSchema = z
	.object({
		commands: z.array(z.string().trim().min(1).max(10_000)).min(1).max(20),
	})
	.strict();
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
		name: z.literal("set_project_run_command"),
		arguments: setProjectRunCommandArgsSchema,
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
export type SupersetToolRequest = z.infer<typeof supersetToolRequestSchema>;

/**
 * Instructions exposed by the Superset MCP server when its universal
 * delegated-execution target is available. Keep this adapter-agnostic: ACP
 * clients may surface MCP `initialize.instructions`, tool descriptions, or
 * both to their model.
 */
export const SUPERSET_DELEGATION_INSTRUCTIONS =
	"Delegated execution is enabled for this workspace. Proactively use the Superset delegate tool for substantial implementation work (for example, multi-file changes, non-trivial bug fixes, features, or work that needs investigation and tests); do not wait for the user to request delegation. Call delegate before making those changes, with a self-contained objective, approach, constraints, relevant files, and acceptance checks. After the child finishes, inspect its changes and validation before accepting the result. The delegate uses the globally configured executor for this workspace.";

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
		name: "get_session_messages",
		description:
			"Read persisted timeline messages for an ACP session in the current workspace. Results are newest-first; pass nextCursor as cursor to fetch older messages.",
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
			"Continue work in a fresh ACP conversation. Provide a self-contained handoff with goal, completed work, decisions, changed files, and next steps. Superset can open the child session in a new tab.",
		inputSchema: {
			type: "object",
			properties: {
				reason: {
					type: "string",
					enum: ["context_limit", "parallel_task", "fresh_start"],
					default: "context_limit",
				},
				handoff: { type: "string", minLength: 1, maxLength: 100_000 },
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
			"Proactively delegate substantial implementation work to the globally configured executor in the current workspace. Do not wait for the user to ask. Call this before making multi-file changes, non-trivial bug fixes, features, or work that needs investigation and tests. Provide a self-contained handoff with the objective, decided approach, constraints, relevant files, and acceptance checks. The child runs independently; monitor it with list_sessions/get_session_status and inspect its actual changes and validation before accepting the work.",
		inputSchema: {
			type: "object",
			properties: {
				task: { type: "string", minLength: 1, maxLength: 100_000 },
				focus: { type: "boolean", default: false },
				idempotencyKey: { type: "string", minLength: 1, maxLength: 128 },
			},
			required: ["task"],
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

import { z } from "zod";

export const supersetAgentSchema = z.enum([
	"claude",
	"codex",
	"pi",
	"myflicker",
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
		agent: supersetAgentSchema.optional(),
		focus: z.boolean().default(false),
		idempotencyKey: z.string().min(1).max(128).optional(),
	})
	.strict();

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
]);

export type SupersetAgent = z.infer<typeof supersetAgentSchema>;
export type SupersetToolRequest = z.infer<typeof supersetToolRequestSchema>;

/** JSON Schemas advertised by the bundled Superset MCP server. */
export const SUPERSET_TOOL_DEFINITIONS = [
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
					enum: ["claude", "codex", "pi", "myflicker"],
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
			"Start another ACP session in the current workspace and give it a task. The child runs independently; use list_sessions/get_session_status to monitor it.",
		inputSchema: {
			type: "object",
			properties: {
				task: { type: "string", minLength: 1, maxLength: 100_000 },
				agent: {
					type: "string",
					enum: ["claude", "codex", "pi", "myflicker"],
				},
				focus: { type: "boolean", default: false },
				idempotencyKey: { type: "string", minLength: 1, maxLength: 128 },
			},
			required: ["task"],
			additionalProperties: false,
		},
	},
] as const;

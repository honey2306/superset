import { z } from "zod";

export const AGENT_BROWSER_TOOL_NAMES = [
	"browser_navigate",
	"browser_get_state",
	"browser_click",
	"browser_type",
	"browser_scroll",
	"browser_go_back",
	"browser_tabs",
	"browser_close",
	"browser_keep_open",
] as const;

export type AgentBrowserToolName = (typeof AGENT_BROWSER_TOOL_NAMES)[number];

interface AgentBrowserToolDefinition {
	name: AgentBrowserToolName;
	description: string;
	inputSchema: {
		type: "object";
		properties: Record<string, unknown>;
		required?: string[];
	};
}

export const AGENT_BROWSER_TOOL_DEFINITIONS = [
	{
		name: "browser_navigate",
		description:
			"Navigate the active page in this conversation's embedded local browser.",
		inputSchema: {
			type: "object",
			properties: { url: { type: "string" } },
			required: ["url"],
		},
	},
	{
		name: "browser_get_state",
		description:
			"Get Browser Use's cleaned DOM state and interactive element indices for the active embedded page. Call before index-based actions.",
		inputSchema: { type: "object", properties: {} },
	},
	{
		name: "browser_click",
		description:
			"Click an element by its index from browser_get_state on the active embedded page.",
		inputSchema: {
			type: "object",
			properties: { index: { type: "integer", minimum: 0 } },
			required: ["index"],
		},
	},
	{
		name: "browser_type",
		description:
			"Type into an element by its Browser Use index on the active embedded page.",
		inputSchema: {
			type: "object",
			properties: {
				index: { type: "integer", minimum: 0 },
				text: { type: "string" },
				clear: { type: "boolean", default: true },
			},
			required: ["index", "text"],
		},
	},
	{
		name: "browser_scroll",
		description: "Scroll the active embedded page.",
		inputSchema: {
			type: "object",
			properties: {
				direction: {
					type: "string",
					enum: ["up", "down", "left", "right"],
				},
				amount: { type: "integer", minimum: 1, maximum: 10_000 },
			},
			required: ["direction"],
		},
	},
	{
		name: "browser_go_back",
		description: "Navigate the active embedded page back.",
		inputSchema: { type: "object", properties: {} },
	},
	{
		name: "browser_tabs",
		description:
			"List, create, switch, or close pages. Lifecycle is owned by Superset Electron, never by CDP Target.createTarget.",
		inputSchema: {
			type: "object",
			properties: {
				action: {
					type: "string",
					enum: ["list", "new", "switch", "close"],
				},
				pageId: { type: "string" },
				index: { type: "integer", minimum: 0 },
				url: { type: "string" },
			},
			required: ["action"],
		},
	},
	{
		name: "browser_close",
		description:
			"Close temporary agent pages by default. Pass pageIds to explicitly close retained agent pages after handoff is complete. Never closes user-created pages.",
		inputSchema: {
			type: "object",
			properties: {
				pageIds: { type: "array", minItems: 1, items: { type: "string" } },
			},
		},
	},
	{
		name: "browser_keep_open",
		description:
			"Keep selected pages open across turns for user action, review, or an explicit user request. Obtain pageIds with browser_tabs list. Give the user a concrete next step in message and in your final response. Other temporary pages close automatically.",
		inputSchema: {
			type: "object",
			properties: {
				pageIds: { type: "array", minItems: 1, items: { type: "string" } },
				reason: {
					type: "string",
					enum: ["user_action", "review", "user_request"],
				},
				message: { type: "string", minLength: 1, maxLength: 500 },
			},
			required: ["pageIds", "reason", "message"],
		},
	},
] as const satisfies readonly AgentBrowserToolDefinition[];

export const agentBrowserToolInput = z.object({
	sessionId: z.string().min(1),
	name: z.enum(AGENT_BROWSER_TOOL_NAMES),
	arguments: z.unknown(),
});

export type AgentBrowserToolInput = z.infer<typeof agentBrowserToolInput>;

export const agentBrowserViewInput = z.object({
	sessionId: z.string().min(1),
	// Retained for protocol compatibility. Native WebContentsView presentation
	// never requests or returns screenshots.
	includeScreenshot: z.boolean().optional().default(false),
});

export const agentBrowserViewportInput = z.object({
	sessionId: z.string().min(1),
	width: z.number().int().min(320).max(3_840),
	height: z.number().int().min(240).max(3_840),
});

export type AgentBrowserViewportInput = z.infer<
	typeof agentBrowserViewportInput
>;

export interface AgentBrowserPageView {
	handoff?: AgentBrowserHandoff;
	id?: string;
	index: number;
	url: string;
	title?: string;
	active: boolean;
}

export interface AgentBrowserView {
	enabled: boolean;
	active: boolean;
	pages: AgentBrowserPageView[];
	activePageIndex: number | null;
	error?: string;
}

export const agentBrowserHandoffSchema = z.object({
	reason: z.enum(["user_action", "review", "user_request"]),
	message: z.string().trim().min(1).max(500),
});
export type AgentBrowserHandoff = z.infer<typeof agentBrowserHandoffSchema>;
export const agentBrowserKeepOpenSchema = agentBrowserHandoffSchema.extend({
	pageIds: z.array(z.string().min(1)).min(1),
});
export const agentBrowserCloseSchema = z.object({
	pageIds: z.array(z.string().min(1)).min(1).optional(),
});

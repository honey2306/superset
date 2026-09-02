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
			"Close this conversation's embedded browser session and all pages.",
		inputSchema: { type: "object", properties: {} },
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

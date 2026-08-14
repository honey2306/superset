import { z } from "zod";
import { BUILTIN_AGENT_IDS, BUILTIN_AGENT_LABELS } from "./agent-catalog";
import { buildAgentFileCommand, type TaskInput } from "./agent-command";
import {
	DEFAULT_TERMINAL_TASK_PROMPT_TEMPLATE,
	renderTaskPromptTemplate,
} from "./agent-prompt-template";

export const STARTABLE_AGENT_TYPES = BUILTIN_AGENT_IDS;

export type StartableAgentType = (typeof STARTABLE_AGENT_TYPES)[number];

export const STARTABLE_AGENT_LABELS = BUILTIN_AGENT_LABELS;

export const AGENT_LAUNCH_STATUS = [
	"queued",
	"launching",
	"running",
	"failed",
] as const;

export type AgentLaunchStatus = (typeof AGENT_LAUNCH_STATUS)[number];

export const AGENT_LAUNCH_SOURCE = [
	"new-workspace",
	"open-in-workspace",
	"workspace-init",
	"command-watcher",
	"mcp",
	"unknown",
] as const;

export type AgentLaunchSource = (typeof AGENT_LAUNCH_SOURCE)[number];

const launchSourceSchema = z.enum(AGENT_LAUNCH_SOURCE);

const baseAgentLaunchSchema = z.object({
	workspaceId: z.string().min(1),
	idempotencyKey: z.string().min(1).optional(),
	agentType: z.string().min(1).optional(),
	source: launchSourceSchema.optional(),
});

export const terminalLaunchConfigSchema = z.object({
	command: z.string().min(1),
	hostAgent: z
		.object({
			agent: z.string().min(1),
			prompt: z.string(),
			model: z.string().min(1).optional(),
			effort: z.string().min(1).optional(),
		})
		.optional(),
	name: z.string().min(1).optional(),
	paneId: z.string().min(1).optional(),
	taskPromptContent: z.string().min(1).optional(),
	taskPromptFileName: z.string().min(1).optional(),
	autoExecute: z.boolean().optional(),
	initialFiles: z
		.array(
			z.object({
				data: z.string(),
				mediaType: z.string(),
				filename: z.string().optional(),
			}),
		)
		.optional(),
});

export const terminalAgentLaunchRequestSchema = baseAgentLaunchSchema.extend({
	kind: z.literal("terminal"),
	terminal: terminalLaunchConfigSchema,
});

export const agentLaunchRequestSchema = terminalAgentLaunchRequestSchema;

export type AgentLaunchRequest = z.infer<typeof agentLaunchRequestSchema>;

export function normalizeAgentLaunchRequest(
	request: unknown,
): AgentLaunchRequest {
	return agentLaunchRequestSchema.parse(request);
}

export const agentLaunchResultSchema = z.object({
	workspaceId: z.string().min(1),
	tabId: z.string().min(1).nullable().optional(),
	paneId: z.string().min(1).nullable().optional(),
	sessionId: z.string().uuid().nullable().optional(),
	status: z.enum(AGENT_LAUNCH_STATUS),
	error: z.string().nullable().optional(),
});

export type AgentLaunchResult = z.infer<typeof agentLaunchResultSchema>;

/**
 * Builds an AgentLaunchRequest for a task, used when creating workspaces
 * from the issues tab, task sidebar, or batch run popover.
 */
export function buildTaskLaunchRequest({
	task,
	workspaceId,
	agentType,
	source,
	autoExecute,
}: {
	task: TaskInput;
	workspaceId: string;
	agentType: StartableAgentType;
	source: AgentLaunchSource;
	autoExecute?: boolean;
}): AgentLaunchRequest {
	const prompt = renderTaskPromptTemplate(
		DEFAULT_TERMINAL_TASK_PROMPT_TEMPLATE,
		task,
	);
	const taskPromptFileName = `task-${task.slug}.md`;
	return {
		kind: "terminal",
		workspaceId,
		agentType,
		source,
		terminal: {
			command: buildAgentFileCommand({
				filePath: `.superset/${taskPromptFileName}`,
				agent: agentType,
			}),
			name: task.slug,
			taskPromptContent: prompt,
			taskPromptFileName,
			autoExecute,
		},
	};
}

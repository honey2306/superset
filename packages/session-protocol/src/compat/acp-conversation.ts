import type { SessionUpdate, ToolCallUpdate } from "../acp";
import type { ConversationEvent, PermissionInteraction } from "../conversation";
import type { PendingPermission } from "../state";
import {
	extractPlanEntries,
	parentToolCallId,
	terminalStreamPatches,
} from "./acp-metadata";

/** Shared by live Host ingress and the read-only legacy journal adapter. */
export function normalizeAcpUpdate(
	update: SessionUpdate,
	harness?: string,
): ConversationEvent {
	const version = 1;
	switch (update.sessionUpdate) {
		case "user_message_chunk":
			return {
				version,
				kind: "message",
				role: "user",
				content: update.content,
				merge: "delta",
			};
		case "agent_thought_chunk":
			return {
				version,
				kind: "message",
				role: "thought",
				content: update.content,
				merge: "delta",
			};
		case "agent_message_chunk":
			return {
				version,
				kind: "message",
				role: "agent",
				content: update.content,
				merge: ["myflicker-acp", "codex-app-server", "pi-acp"].includes(
					harness ?? "",
				)
					? "snapshot-or-delta"
					: "delta",
			};
		case "tool_call":
		case "tool_call_update":
			return {
				version,
				kind: "tool",
				patch: update,
				parentId: parentToolCallId(update),
				terminals: terminalStreamPatches(update),
			};
		case "plan":
			return { version, kind: "plan", entries: update.entries, removed: false };
		case "plan_update":
			return {
				version,
				kind: "plan",
				entries: extractPlanEntries(update.plan),
				removed: false,
			};
		case "plan_removed":
			return { version, kind: "plan", entries: null, removed: true };
		case "session_info_update":
			return update.title !== undefined
				? { version, kind: "title", title: update.title }
				: { version, kind: "unrecognized" };
		case "usage_update":
			return { version, kind: "usage", usage: update };
		case "current_mode_update":
			return { version, kind: "mode", modeId: update.currentModeId };
		case "config_option_update":
			return { version, kind: "configuration", options: update.configOptions };
		case "available_commands_update":
			return { version, kind: "commands", commands: update.availableCommands };
		default:
			return { version, kind: "unrecognized" };
	}
}
function record(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}
export function permissionInteraction(
	permission: { isElicitation?: boolean; interaction?: PermissionInteraction },
	toolCall?: ToolCallUpdate,
): PermissionInteraction {
	if (permission.interaction) return permission.interaction;
	const toolName = record(record(toolCall?._meta)?.claudeCode)?.toolName;
	if (permission.isElicitation || toolName === "AskUserQuestion")
		return { kind: "question" };
	const input = record(toolCall?.rawInput);
	const plan = input?.plan;
	if (
		typeof plan === "string" &&
		plan.trim() &&
		(toolName === "ExitPlanMode" || (input && "planFilePath" in input))
	)
		return { kind: "plan", markdown: plan };
	return { kind: "approval" };
}
export function normalizePermission(
	pending: PendingPermission,
): PendingPermission {
	return {
		...pending,
		interaction: permissionInteraction(pending, pending.toolCall),
	};
}
export function approvalPlan(
	toolCall: ToolCallUpdate | undefined,
): string | null {
	const interaction = permissionInteraction({}, toolCall);
	return interaction.kind === "plan" ? interaction.markdown : null;
}

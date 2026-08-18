import type { HarnessKind, ToolCallUpdate } from "@superset/session-protocol";

export interface PiExtensionUiPermissionPresentation {
	isElicitation: true;
	allowsCustomResponse?: true;
}

function record(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

/**
 * pi-acp represents extension UI prompts as synthetic permission tool calls.
 * Classify only that adapter-owned shape so ordinary Pi tool permissions keep
 * their normal approval treatment.
 */
export function piExtensionUiPermissionPresentation(
	harness: HarnessKind,
	toolCall: ToolCallUpdate,
): PiExtensionUiPermissionPresentation | null {
	if (harness !== "pi-acp" || !toolCall.toolCallId.startsWith("pi-ui-")) {
		return null;
	}
	const method = record(toolCall.rawInput)?.method;
	if (method === "input" || method === "editor") {
		return { isElicitation: true, allowsCustomResponse: true };
	}
	if (method === "select" || method === "confirm") {
		return { isElicitation: true };
	}
	return null;
}

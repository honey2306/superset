import type {
	AvailableCommand,
	ContentBlock,
	PlanEntry,
	SessionConfigOption,
	ToolCall,
	UsageUpdate,
} from "./acp";
export interface ToolCallPatch {
	toolCallId: string;
	title?: string | null;
	kind?: ToolCall["kind"] | null;
	status?: ToolCall["status"] | null;
	content?: ToolCall["content"] | null;
	locations?: ToolCall["locations"] | null;
	rawInput?: unknown;
	rawOutput?: unknown;
	_meta?: ToolCall["_meta"];
}

export type TerminalStreamPatch = {
	terminalId: string;
	cwd?: string;
	outputDelta?: string;
	exitCode?: number;
	signal?: string | null;
};

/** Superset's versioned presentation events. ACP discriminators, provider
 * metadata and stream heuristics are interpreted only by the ingress adapter.
 * The original ACP frame remains alongside this event for diagnostics/replay. */
export type ConversationEvent = { version: 1 } & (
	| {
			kind: "message";
			role: "user" | "agent" | "thought";
			content: ContentBlock;
			merge: "delta" | "snapshot-or-delta";
	  }
	| {
			kind: "tool";
			patch: ToolCallPatch;
			parentId: string | null;
			terminals: TerminalStreamPatch[];
	  }
	| { kind: "plan"; entries: PlanEntry[] | null; removed: boolean }
	| { kind: "title"; title: string | null }
	| { kind: "usage"; usage: UsageUpdate }
	| { kind: "mode"; modeId: string }
	| { kind: "configuration"; options: SessionConfigOption[] }
	| { kind: "commands"; commands: AvailableCommand[] }
	| { kind: "unrecognized" }
);
export type PermissionInteraction =
	| { kind: "question" }
	| { kind: "plan"; markdown: string }
	| { kind: "approval" };

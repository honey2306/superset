/**
 * Turning ACP content blocks and journal frames into printable text.
 *
 * The wire protocol carries a rich content union (images, audio, resource
 * links) that a terminal cannot show. Non-text blocks are reduced to a short
 * bracketed placeholder rather than dropped, so a transcript never silently
 * loses a step.
 */

import type {
	ContentBlock,
	SessionUpdate,
	SessionUpdateEnvelope,
	SessionUpdateFrame,
} from "@superset/session-protocol";

/** Render one content block as plain text. */
export function contentBlockToText(block: ContentBlock): string {
	switch (block.type) {
		case "text":
			return block.text;
		case "image":
			return "[image]";
		case "audio":
			return "[audio]";
		case "resource_link":
			return `[link: ${block.uri}]`;
		case "resource": {
			const resource = block.resource;
			if ("text" in resource) return resource.text;
			return `[resource: ${resource.uri}]`;
		}
		default:
			return "";
	}
}

export function contentBlocksToText(
	blocks: readonly ContentBlock[] | null | undefined,
): string {
	if (!blocks || blocks.length === 0) return "";
	return blocks.map(contentBlockToText).join("");
}

/** A frame reduced to something the CLI can print or stream. */
export type RenderedFrame =
	| { type: "user"; text: string }
	| { type: "agent"; text: string }
	| { type: "thought"; text: string }
	| { type: "tool"; title: string; status: string; toolCallId: string }
	| { type: "plan"; text: string }
	| { type: "permission"; requestId: string; title: string }
	| { type: "permission_resolved"; requestId: string; outcome: string }
	| { type: "rejected"; reason: string }
	| { type: "title"; title: string }
	| { type: "state"; status: string; stopReason: string | null }
	| { type: "reset"; reason: string };

/**
 * Reduce a journal frame to a printable event, or null when the frame is
 * transport metadata with nothing to show (queue bookkeeping, usage deltas).
 */
export function renderFrame(frame: SessionUpdateFrame): RenderedFrame | null {
	switch (frame.kind) {
		case "update":
			return renderUpdate(frame.update);
		case "permission_requested":
			return {
				type: "permission",
				requestId: frame.pending.requestId,
				title: frame.pending.toolCall.title ?? "(untitled request)",
			};
		case "permission_resolved":
			return {
				type: "permission_resolved",
				requestId: frame.requestId,
				outcome: frame.outcome.outcome,
			};
		case "prompt_rejected":
			return { type: "rejected", reason: frame.reason };
		case "state":
			return {
				type: "state",
				status: frame.state.status,
				stopReason: frame.state.lastStopReason,
			};
		case "reset":
			return { type: "reset", reason: frame.reason };
		default:
			return null;
	}
}

function renderUpdate(update: SessionUpdate): RenderedFrame | null {
	switch (update.sessionUpdate) {
		case "user_message_chunk":
			return { type: "user", text: contentBlockToText(update.content) };
		case "agent_message_chunk":
			return { type: "agent", text: contentBlockToText(update.content) };
		case "agent_thought_chunk":
			return { type: "thought", text: contentBlockToText(update.content) };
		case "tool_call":
			return {
				type: "tool",
				title: update.title,
				status: update.status ?? "pending",
				toolCallId: update.toolCallId,
			};
		case "tool_call_update":
			return {
				type: "tool",
				title: update.title ?? "",
				status: update.status ?? "",
				toolCallId: update.toolCallId,
			};
		case "plan":
			return {
				type: "plan",
				text: update.entries.map((entry) => entry.content).join("\n"),
			};
		case "session_info_update":
			return update.title ? { type: "title", title: update.title } : null;
		default:
			return null;
	}
}

/**
 * Concatenate the agent's message chunks across a range of envelopes into one
 * Markdown document. Chunks arrive as fragments and must be joined before
 * rendering, or block structure (fences, lists) breaks apart.
 */
export function collectAgentText(
	envelopes: readonly SessionUpdateEnvelope[],
): string {
	let text = "";
	for (const envelope of envelopes) {
		if (envelope.frame.kind !== "update") continue;
		const update = envelope.frame.update;
		if (update.sessionUpdate === "agent_message_chunk") {
			text += contentBlockToText(update.content);
		}
	}
	return text;
}

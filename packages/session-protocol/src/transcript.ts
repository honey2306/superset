import type { ContentBlock } from "./acp";
import type { SessionUpdateEnvelope } from "./envelope";

/**
 * A semantic transcript turn starts at a user message and ends immediately
 * before the next user message.  The wire journal is deliberately not exposed
 * as the pagination unit: one turn can contain hundreds of ACP envelopes.
 */
export interface TranscriptTurnSummary {
	turnNumber: number;
	startSeq: number;
	endSeq: number;
	userPreview: string;
	agentPreview: string | null;
	isComplete: boolean;
}

export interface TranscriptTurn extends TranscriptTurnSummary {
	items: SessionUpdateEnvelope[];
}

const MAX_PREVIEW_LENGTH = 240;

function isTranscriptFrame(envelope: SessionUpdateEnvelope): boolean {
	return (
		envelope.frame.kind === "update" ||
		envelope.frame.kind === "permission_requested" ||
		envelope.frame.kind === "permission_resolved" ||
		envelope.frame.kind === "prompt_rejected"
	);
}

function blockText(block: ContentBlock): string {
	return block.type === "text" ? block.text : "";
}

function preview(text: string, fallback: string): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (!normalized) return fallback;
	if (normalized.length <= MAX_PREVIEW_LENGTH) return normalized;
	return `${normalized.slice(0, MAX_PREVIEW_LENGTH - 1).trimEnd()}…`;
}

function updateKind(
	envelope: SessionUpdateEnvelope,
): "user" | "agent" | "other" | null {
	if (envelope.frame.kind !== "update") return null;
	const kind = envelope.frame.update.sessionUpdate;
	if (kind === "user_message_chunk") return "user";
	if (kind === "agent_message_chunk") return "agent";
	return "other";
}

/**
 * Groups retained journal envelopes into complete semantic turns. Entries
 * before the first user message are ignored because they are adapter/session
 * bootstrap, not a user-visible conversation turn. Adjacent user chunks stay
 * together (a single prompt may contain text plus image/audio blocks).
 */
export function groupTranscriptTurns(
	entries: readonly SessionUpdateEnvelope[],
): TranscriptTurn[] {
	const ordered = entries
		.filter(isTranscriptFrame)
		.slice()
		.sort((a, b) => a.seq - b.seq);
	const turns: TranscriptTurn[] = [];
	let current: SessionUpdateEnvelope[] | null = null;
	let previousKind: "user" | "agent" | "other" | null = null;

	const finish = () => {
		if (!current || current.length === 0) return;
		const first = current[0];
		const last = current.at(-1);
		if (!first || !last) return;
		let userText = "";
		let agentText = "";
		let hasAgentMessage = false;
		for (const envelope of current) {
			if (envelope.frame.kind !== "update") continue;
			const kind = envelope.frame.update.sessionUpdate;
			if (kind === "user_message_chunk") {
				userText += blockText(envelope.frame.update.content);
			} else if (kind === "agent_message_chunk") {
				hasAgentMessage = true;
				agentText += blockText(envelope.frame.update.content);
			}
		}
		const turnNumber = turns.length + 1;
		turns.push({
			turnNumber,
			startSeq: first.seq,
			endSeq: last.seq,
			userPreview: preview(userText, "Message"),
			agentPreview: hasAgentMessage
				? preview(agentText, "No text response")
				: null,
			isComplete: hasAgentMessage,
			items: current,
		});
	};

	for (const envelope of ordered) {
		const kind = updateKind(envelope);
		if (kind === "user" && previousKind !== "user") {
			finish();
			current = [envelope];
		} else if (current) {
			current.push(envelope);
		}
		if (kind !== null) previousKind = kind;
	}
	finish();
	return turns;
}

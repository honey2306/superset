import type { SessionStatus, TimelineItem } from "@superset/session-protocol";

export type ContextCompactionPhase = "compacting" | "completed" | "failed";

function messageText(item: Extract<TimelineItem, { kind: "message" }>): string {
	return item.blocks
		.flatMap((block) => (block.type === "text" ? [block.text] : []))
		.join("\n")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * ACP has no provider-neutral context-compaction update. Claude and Pi expose
 * lifecycle text, Codex is normalized to the same text by our bridge, and
 * other adapters can expose a manual `/compact` prompt. Keep the recognition
 * deliberately narrow so ordinary discussion about compaction is not treated
 * as session state.
 */
export function contextCompactionPhaseFromText(
	text: string,
): ContextCompactionPhase | null {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (!/compact/i.test(normalized)) return null;

	if (/\b(?:compact(?:ing|ion)?)[^.!?]{0,80}\bfailed\b/i.test(normalized)) {
		return "failed";
	}
	if (
		/\b(?:compact(?:ing|ion)?)[^.!?]{0,120}\b(?:completed|finished)\b/i.test(
			normalized,
		) ||
		/\bcontext compacted\b/i.test(normalized) ||
		/\bcompaction[^.!?]{0,120}\bsummarized\b/i.test(normalized)
	) {
		return "completed";
	}
	if (
		/^compacting(?: (?:context|conversation|history))?(?:\.{3}|…)?$/i.test(
			normalized,
		) ||
		/\b(?:context|conversation|history)[^.!?]{0,80}\bcompacting\b/i.test(
			normalized,
		) ||
		/\b(?:running|starting) (?:automatic )?(?:context )?compaction\b/i.test(
			normalized,
		) ||
		/\b(?:auto(?:matic)?[_ -]?)compaction (?:started|in progress)\b/i.test(
			normalized,
		)
	) {
		return "compacting";
	}
	return null;
}

/** Return true only while the latest recognized compaction lifecycle is live. */
export function isContextCompacting(
	items: readonly TimelineItem[],
	status?: SessionStatus,
): boolean {
	if (status !== "starting" && status !== "running") return false;

	for (let index = items.length - 1; index >= 0; index -= 1) {
		const item = items[index];
		if (!item || item.kind !== "message") continue;
		const text = messageText(item);
		if (item.role === "user") {
			// A user message starts a new turn. Never let an unmatched compaction
			// notice from an older turn reactivate when this turn starts running.
			return /^\/compact(?:\s|$)/i.test(text);
		}
		if (item.role !== "agent") continue;
		const phase = contextCompactionPhaseFromText(text);
		if (phase) return phase === "compacting";
	}
	return false;
}

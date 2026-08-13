export type TerminalFailureCategory = "connection-failed" | "unknown";

export interface TerminalFailureClassification {
	category: TerminalFailureCategory;
	/** Short, user-facing reason for the terminal not connecting. */
	message: string;
}

/** Generic diagnosis for a direct host WebSocket after repeated failures. */
export function classifyTerminalFailure(): TerminalFailureClassification {
	return {
		category: "connection-failed",
		message: "Couldn't reach this host. Check that it is online and reachable.",
	};
}

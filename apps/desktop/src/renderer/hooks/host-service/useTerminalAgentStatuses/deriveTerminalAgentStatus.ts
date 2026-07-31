import {
	type ActivePaneStatus,
	getHighestPriorityStatus,
	type PaneStatus,
} from "shared/tabs-types";

interface TerminalAgentStatusBinding {
	terminalId: string;
	lastEventType: string;
	lastEventAt: number;
}

/**
 * Derive a terminal agent's UI status from its host binding. `permission` is
 * deliberately not seen-gated — it's a live blocking state that must show
 * until the agent resolves it.
 */
export function deriveTerminalAgentStatus({
	lastEventType,
	lastEventAt,
	lastSeenAt,
}: {
	lastEventType: string;
	lastEventAt: number;
	lastSeenAt: number | undefined;
}): PaneStatus {
	if (lastEventType === "Start") return "working";
	if (lastEventType === "PermissionRequest") return "permission";
	if (lastEventType === "Failed") return "failed";
	if (lastEventType === "Stop") {
		return lastEventAt > (lastSeenAt ?? 0) ? "review" : "idle";
	}
	return "idle";
}

export function deriveTerminalAgentStatuses(
	bindings: Iterable<readonly [string, TerminalAgentStatusBinding]>,
	terminalSeenAt: Readonly<Record<string, number>>,
): Map<string, PaneStatus> {
	const statuses = new Map<string, PaneStatus>();
	for (const [terminalId, binding] of bindings) {
		statuses.set(
			terminalId,
			deriveTerminalAgentStatus({
				lastEventType: binding.lastEventType,
				lastEventAt: binding.lastEventAt,
				lastSeenAt: terminalSeenAt[binding.terminalId],
			}),
		);
	}
	return statuses;
}

export function getHighestTerminalAgentStatus(
	bindings: Iterable<readonly [string, TerminalAgentStatusBinding]>,
	terminalSeenAt: Readonly<Record<string, number>>,
): ActivePaneStatus | null {
	return getHighestPriorityStatus(
		deriveTerminalAgentStatuses(bindings, terminalSeenAt).values(),
	);
}

export function markTerminalAgentBindingsSeen(
	bindings: Iterable<readonly [string, TerminalAgentStatusBinding]>,
	markTerminalSeen: (terminalId: string, at: number) => void,
): void {
	for (const binding of bindings) {
		markTerminalSeen(binding[1].terminalId, binding[1].lastEventAt);
	}
}

export async function settleClearedTerminalAgentBindings({
	bindings,
	markTerminalSeen,
	refresh,
	readRefreshedBindings,
}: {
	bindings: Iterable<readonly [string, TerminalAgentStatusBinding]>;
	markTerminalSeen: (terminalId: string, at: number) => void;
	refresh: () => Promise<unknown>;
	readRefreshedBindings: () => Iterable<
		readonly [string, TerminalAgentStatusBinding]
	>;
}): Promise<void> {
	markTerminalAgentBindingsSeen(bindings, markTerminalSeen);
	await refresh();
	markTerminalAgentBindingsSeen(readRefreshedBindings(), markTerminalSeen);
}

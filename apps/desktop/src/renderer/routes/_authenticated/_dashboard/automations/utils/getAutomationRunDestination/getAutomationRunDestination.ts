type AutomationRunSession = {
	v2WorkspaceId: string | null;
	sessionKind: string | null;
	terminalSessionId: string | null;
};

/**
 * A terminal run is opened through the workspace route's terminal deep-link.
 * Other durable run states deliberately return a reason so UI callers never
 * turn a click into a silent no-op.
 */
export function getAutomationRunDestination(
	run: AutomationRunSession,
): { workspaceId: string; terminalId: string } | { reason: string } {
	if (!run.v2WorkspaceId) {
		return { reason: "This run no longer has an available workspace." };
	}
	if (run.sessionKind === "terminal" && run.terminalSessionId) {
		return {
			workspaceId: run.v2WorkspaceId,
			terminalId: run.terminalSessionId,
		};
	}
	if (run.sessionKind === "chat") {
		return {
			reason: "This automation chat session cannot be opened here yet.",
		};
	}
	return { reason: "This run did not create an openable session." };
}

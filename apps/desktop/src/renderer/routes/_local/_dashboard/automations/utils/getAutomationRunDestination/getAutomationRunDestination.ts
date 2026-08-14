type AutomationRunSession = {
	workspaceId: string | null;
	sessionKind: string | null;
	terminalSessionId: string | null;
	acpSessionId?: string | null;
};

/**
 * A terminal run is opened through the workspace route's terminal deep-link.
 * Other durable run states deliberately return a reason so UI callers never
 * turn a click into a silent no-op.
 */
export function getAutomationRunDestination(
	run: AutomationRunSession,
):
	| { workspaceId: string; terminalId: string }
	| { workspaceId: string; acpSessionId: string }
	| { reason: string } {
	if (!run.workspaceId) {
		return { reason: "This run no longer has an available workspace." };
	}
	if (run.sessionKind === "terminal" && run.terminalSessionId) {
		return {
			workspaceId: run.workspaceId,
			terminalId: run.terminalSessionId,
		};
	}
	if (run.sessionKind === "acp" && run.acpSessionId) {
		return { workspaceId: run.workspaceId, acpSessionId: run.acpSessionId };
	}
	return { reason: "This run did not create an openable session." };
}

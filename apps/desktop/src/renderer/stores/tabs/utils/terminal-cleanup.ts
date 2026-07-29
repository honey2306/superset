import { rejectTerminalSessionReady } from "../../../lib/terminal/session-readiness";
import { electronTrpcClient } from "../../../lib/trpc-client";

type TerminalCleanup = () => void | Promise<void>;

const terminalCleanupByPaneId = new Map<string, TerminalCleanup>();

export const registerTerminalCleanup = (
	paneId: string,
	cleanup: TerminalCleanup,
): (() => void) => {
	terminalCleanupByPaneId.set(paneId, cleanup);
	return () => {
		if (terminalCleanupByPaneId.get(paneId) === cleanup) {
			terminalCleanupByPaneId.delete(paneId);
		}
	};
};

/**
 * Uses standalone tRPC client to avoid React hook dependencies
 */
export const killTerminalForPane = (paneId: string): void => {
	rejectTerminalSessionReady(
		paneId,
		new Error("Terminal pane was closed before the session became ready"),
	);

	const registeredCleanup = terminalCleanupByPaneId.get(paneId);
	if (registeredCleanup) {
		terminalCleanupByPaneId.delete(paneId);
		Promise.resolve()
			.then(registeredCleanup)
			.catch((error) => {
				console.warn(`Failed to clean up terminal for pane ${paneId}:`, error);
			});
		return;
	}

	electronTrpcClient.terminal.kill.mutate({ paneId }).catch((error) => {
		console.warn(`Failed to kill terminal for pane ${paneId}:`, error);
	});
};

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

export const killTerminalForPane = (paneId: string): boolean => {
	const registeredCleanup = terminalCleanupByPaneId.get(paneId);
	if (!registeredCleanup) return false;

	terminalCleanupByPaneId.delete(paneId);
	Promise.resolve()
		.then(registeredCleanup)
		.catch((error) => {
			console.warn(`Failed to clean up terminal for pane ${paneId}:`, error);
		});
	return true;
};

export const killTerminalForPaneOrSession = (
	paneId: string,
	terminalId: string,
	killSession: (terminalId: string) => void,
): void => {
	if (!killTerminalForPane(paneId)) killSession(terminalId);
};

export type WorkspaceRunPaneState =
	| "running"
	| "stopped-by-user"
	| "stopped-by-exit";

export interface ExistingWorkspaceRunPane {
	paneId: string;
	state: WorkspaceRunPaneState;
}

export type WorkspaceRunStartPlan =
	| {
			kind: "new-pane";
			initialCommand: string;
			initialCwd?: string;
	  }
	| {
			kind: "write-existing";
			paneId: string;
			data: string;
	  };

/**
 * Selects the only safe launch path for a workspace run.
 *
 * A newly-created pane owns session creation: its initial command is passed
 * through pane data to HostServiceTerminalPane.createOrAttach. A pane whose
 * command was interrupted by Ctrl-C still owns a live shell, so it can be
 * reused by writing the next command. Exited sessions must not be adopted for
 * another run because host-service queues an initial command at most once.
 */
export function createWorkspaceRunStartPlan({
	command,
	initialCwd,
	existingPane,
}: {
	command: string;
	initialCwd?: string;
	existingPane?: ExistingWorkspaceRunPane | null;
}): WorkspaceRunStartPlan {
	if (existingPane?.state === "stopped-by-user") {
		return {
			kind: "write-existing",
			paneId: existingPane.paneId,
			data: command.endsWith("\n") ? command : `${command}\n`,
		};
	}

	return {
		kind: "new-pane",
		initialCommand: command,
		initialCwd,
	};
}

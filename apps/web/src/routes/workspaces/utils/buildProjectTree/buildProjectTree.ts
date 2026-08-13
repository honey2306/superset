export type ProjectRecord = {
	id: string;
	name: string | null;
	repoPath: string;
};

export type WorkspaceRecord = {
	id: string;
	projectId: string;
	name: string | null;
	branch: string;
};

export type AcpSessionRecord = {
	sessionId: string;
	title?: string | null;
	status: string;
	updatedAt: number;
};

export type TerminalAgentRecord = {
	terminalId: string;
	agentId: string;
	lastEventAt: number;
	lastEventType: string;
};

export type WorkspaceContents = {
	acpEnabled: boolean;
	sessions: AcpSessionRecord[];
	terminalAgents: TerminalAgentRecord[];
};

export type TreeLeaf =
	| {
			kind: "acp";
			id: string;
			title: string;
			updatedAt: number;
			running: boolean;
	  }
	| {
			kind: "terminal";
			id: string;
			title: string;
			updatedAt: number;
			running: boolean;
	  };

export type TreeWorkspace = {
	id: string;
	title: string;
	branch: string;
	leaves: TreeLeaf[];
};

export type TreeProject = {
	id: string;
	title: string;
	workspaces: TreeWorkspace[];
};

function isTerminalRunning(lastEventType: string): boolean {
	return lastEventType === "Start" || lastEventType === "PermissionRequest";
}

/**
 * Joins the catalog hierarchy with independently loaded ACP and terminal tabs.
 * Keeping this pure makes the mobile tree's mixed-tab behavior testable without
 * depending on a host connection.
 */
export function buildProjectTree({
	projects,
	workspaces,
	contentsByWorkspaceId,
	agentLabel,
}: {
	projects?: ProjectRecord[];
	workspaces?: WorkspaceRecord[];
	contentsByWorkspaceId: ReadonlyMap<string, WorkspaceContents>;
	agentLabel: (agentId: string) => string;
}): TreeProject[] {
	const safeProjects = Array.isArray(projects) ? projects : [];
	const safeWorkspaces = Array.isArray(workspaces) ? workspaces : [];
	const workspacesByProjectId = new Map<string, WorkspaceRecord[]>();
	for (const workspace of safeWorkspaces) {
		const projectWorkspaces = workspacesByProjectId.get(workspace.projectId);
		if (projectWorkspaces) projectWorkspaces.push(workspace);
		else workspacesByProjectId.set(workspace.projectId, [workspace]);
	}

	return safeProjects.map((project) => ({
		id: project.id,
		title: project.name || project.repoPath,
		workspaces: (workspacesByProjectId.get(project.id) ?? []).map(
			(workspace) => {
				const contents = contentsByWorkspaceId.get(workspace.id);
				const sessions = contents?.acpEnabled ? contents.sessions : [];
				const acpLeaves: TreeLeaf[] = sessions.map((session) => ({
					kind: "acp",
					id: session.sessionId,
					title: session.title || "Untitled session",
					updatedAt: session.updatedAt,
					running: session.status === "running",
				}));
				const terminalLeaves: TreeLeaf[] = (contents?.terminalAgents ?? []).map(
					(agent) => ({
						kind: "terminal",
						id: agent.terminalId,
						title: agentLabel(agent.agentId),
						updatedAt: agent.lastEventAt,
						running: isTerminalRunning(agent.lastEventType),
					}),
				);

				return {
					id: workspace.id,
					title: workspace.name || workspace.branch,
					branch: workspace.branch,
					leaves: [...acpLeaves, ...terminalLeaves].sort(
						(left, right) => right.updatedAt - left.updatedAt,
					),
				};
			},
		),
	}));
}

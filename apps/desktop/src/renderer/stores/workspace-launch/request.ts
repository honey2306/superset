import type {
	InitialSessionIntent,
	ProvisionWorkspaceRequest,
} from "@superset/workspace-client";
export interface WorkspacesCreateInput {
	projectId: string;
	name?: string;
	branch?: string;
	pr?: number;
	baseBranch?: string;
	taskId?: string;
	agents?: Array<{
		agent: string;
		prompt: string;
		attachmentIds?: string[];
		model?: string;
		effort?: string;
	}>;
	command?: string;
	namingPrompt?: string;
	id?: string;
	worktreePath?: string;
}

export type WorkspaceCreateSnapshot = WorkspacesCreateInput & {
	prompt?: string;
	branchName?: string;
	compareBaseBranch?: string;
};

export function toProvisionWorkspaceRequest(
	snapshot: WorkspaceCreateSnapshot,
): ProvisionWorkspaceRequest {
	const initialSessions: InitialSessionIntent[] = [
		...(snapshot.agents ?? []).map((agent, index) => ({
			key: `agent:${index}:${agent.agent}`,
			kind: "agent" as const,
			agent: agent.agent,
			prompt: agent.prompt,
			...(agent.attachmentIds ? { attachmentIds: agent.attachmentIds } : {}),
			...(agent.model ? { model: agent.model } : {}),
			...(agent.effort ? { effort: agent.effort } : {}),
			requirement: "best-effort" as const,
		})),
		...(snapshot.command
			? [
					{
						key: "command",
						kind: "command" as const,
						command: snapshot.command,
						requirement: "best-effort" as const,
					},
				]
			: []),
	];

	const branch = snapshot.branch ?? snapshot.branchName;
	const baseBranch = snapshot.baseBranch ?? snapshot.compareBaseBranch;
	const source = snapshot.pr
		? ({
				kind: "pull-request" as const,
				provider: "github" as const,
				number: snapshot.pr,
			} satisfies ProvisionWorkspaceRequest["source"])
		: snapshot.worktreePath
			? ({
					kind: "worktree" as const,
					path: snapshot.worktreePath,
					expectedBranch: branch,
				} satisfies ProvisionWorkspaceRequest["source"])
			: ({
					kind: "branch" as const,
					name: branch
						? { kind: "explicit" as const, value: branch }
						: {
								kind: "generated" as const,
								...((snapshot.namingPrompt ?? snapshot.prompt)
									? {
											prompt: snapshot.namingPrompt ?? snapshot.prompt,
										}
									: {}),
							},
					from: baseBranch
						? { kind: "ref" as const, value: baseBranch }
						: { kind: "default" as const },
				} satisfies ProvisionWorkspaceRequest["source"]);

	return {
		idempotencyKey: `workspace-create:${snapshot.id}`,
		project: { kind: "existing", projectId: snapshot.projectId },
		source,
		display: {
			...(snapshot.name ? { name: snapshot.name } : {}),
			...(snapshot.taskId ? { taskId: snapshot.taskId } : {}),
		},
		...(initialSessions.length > 0 ? { initialSessions } : {}),
	};
}

export function launchesToPaneLayoutInputs(operation: {
	launches: Array<{
		kind: "terminal" | "chat";
		sessionId: string;
		label?: string;
	}>;
}) {
	return {
		terminals: operation.launches
			.filter((launch) => launch.kind === "terminal")
			.map((launch) => ({ terminalId: launch.sessionId, label: launch.label })),
		agents: [],
	};
}

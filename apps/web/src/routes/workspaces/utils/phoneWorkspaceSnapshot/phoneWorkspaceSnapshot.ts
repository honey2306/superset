import type {
	AcpSessionRecord,
	WorkspaceContents,
} from "../buildProjectTree/buildProjectTree";

type PhoneSession = {
	sessionId: string;
	workspaceId: string;
	title: string | null;
	status: AcpSessionRecord["status"];
	updatedAt: number;
};

/**
 * Turn the host's one global phone ACP page into the per-workspace shape the
 * existing tree/cache consumes. Workspace detail pages keep their own query;
 * this helper is only for the phone home aggregate.
 */
export function buildPhoneWorkspaceContents({
	enabled,
	sessions,
	workspaceIds,
}: {
	enabled: boolean;
	sessions: readonly PhoneSession[];
	workspaceIds: readonly string[];
}): ReadonlyMap<string, WorkspaceContents> {
	const sessionsByWorkspaceId = new Map<string, AcpSessionRecord[]>();
	if (enabled) {
		for (const session of sessions) {
			const workspaceSessions = sessionsByWorkspaceId.get(session.workspaceId);
			const sessionRecord = {
				sessionId: session.sessionId,
				title: session.title,
				status: session.status,
				updatedAt: session.updatedAt,
			};
			if (workspaceSessions) workspaceSessions.push(sessionRecord);
			else sessionsByWorkspaceId.set(session.workspaceId, [sessionRecord]);
		}
	}

	return new Map(
		workspaceIds.map((workspaceId) => [
			workspaceId,
			{
				acpEnabled: enabled,
				sessions: sessionsByWorkspaceId.get(workspaceId) ?? [],
				terminalSessions: [],
				terminalAgents: [],
			},
		]),
	);
}

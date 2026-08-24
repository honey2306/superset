import type {
	AcpSessionRecord,
	TerminalAgentRecord,
	TerminalSessionRecord,
	WorkspaceContents,
} from "../buildProjectTree/buildProjectTree";

type AcpSource<TSession extends AcpSessionRecord> = {
	enabled: boolean;
	items: TSession[];
};

type TerminalSessionsSource = {
	sessions: TerminalSessionRecord[];
};

export type WorkspaceContentsSources<
	TSession extends AcpSessionRecord = AcpSessionRecord,
> = {
	acp: Promise<AcpSource<TSession>>;
	terminalSessions: Promise<TerminalSessionsSource>;
	terminalAgents: Promise<TerminalAgentRecord[]>;
};

export type ResolvedWorkspaceContents<
	TSession extends AcpSessionRecord = AcpSessionRecord,
> = {
	contents: Omit<WorkspaceContents, "sessions"> & { sessions: TSession[] };
	warnings: string[];
};

const SOURCE_WARNINGS = {
	acp: "ACP sessions are temporarily unavailable.",
	terminalSessions: "Terminal tabs are temporarily unavailable.",
	terminalAgents: "Terminal agent status is temporarily unavailable.",
} as const;

/**
 * Resolve independent workspace tab sources without letting one unavailable
 * capability hide the others. A completely unavailable workspace still
 * rejects so the caller can show its existing retry state.
 */
export async function resolveWorkspaceContents<
	TSession extends AcpSessionRecord = AcpSessionRecord,
>({
	acp,
	terminalSessions,
	terminalAgents,
}: WorkspaceContentsSources<TSession>): Promise<
	ResolvedWorkspaceContents<TSession>
> {
	const [acpResult, terminalSessionsResult, terminalAgentsResult] =
		await Promise.allSettled([acp, terminalSessions, terminalAgents]);

	if (
		acpResult.status === "rejected" &&
		terminalSessionsResult.status === "rejected" &&
		terminalAgentsResult.status === "rejected"
	) {
		throw acpResult.reason;
	}

	const warnings: string[] = [];
	if (acpResult.status === "rejected") warnings.push(SOURCE_WARNINGS.acp);
	if (terminalSessionsResult.status === "rejected") {
		warnings.push(SOURCE_WARNINGS.terminalSessions);
	}
	if (terminalAgentsResult.status === "rejected") {
		warnings.push(SOURCE_WARNINGS.terminalAgents);
	}

	return {
		contents: {
			acpEnabled:
				acpResult.status === "fulfilled" ? acpResult.value.enabled : false,
			sessions: acpResult.status === "fulfilled" ? acpResult.value.items : [],
			terminalSessions:
				terminalSessionsResult.status === "fulfilled"
					? terminalSessionsResult.value.sessions
					: [],
			terminalAgents:
				terminalAgentsResult.status === "fulfilled"
					? terminalAgentsResult.value
					: [],
			warnings,
		},
		warnings,
	};
}

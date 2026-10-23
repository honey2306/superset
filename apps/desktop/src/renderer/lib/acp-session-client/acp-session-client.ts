import { createAcpSessionsApi, sessionStreamUrl } from "@superset/host-client";
import type {
	AcpSessionsApi,
	HarnessKind,
	SessionScopedState,
	SessionsPage,
} from "@superset/session-protocol";
import { getHostServiceWsToken } from "renderer/lib/host-service-auth";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export interface DesktopAcpSessionClient {
	api: AcpSessionsApi;
	create(input: {
		sessionId: string;
		workspaceId: string;
		harness: HarnessKind;
		model?: string;
	}): Promise<SessionScopedState>;
	list(input: {
		workspaceId?: string;
		cursor?: string;
		limit?: number;
		excludeEmpty?: boolean;
	}): Promise<SessionsPage>;
	streamUrl(sessionId: string): () => string;
	searchFiles?(input: {
		workspaceId: string;
		cwd: string;
		query: string;
	}): Promise<{ id: string; name: string; relativePath: string }[]>;
}

export function createDesktopAcpSessionClient(
	hostUrl: string,
): DesktopAcpSessionClient {
	function trpc() {
		return getHostServiceClientByUrl(hostUrl).acpSessions;
	}

	const api = createAcpSessionsApi(() => getHostServiceClientByUrl(hostUrl));

	return {
		api,

		create: (input) => trpc().create.mutate(input),

		list: (input) => trpc().list.query(input),

		streamUrl: (sessionId) => () =>
			sessionStreamUrl(hostUrl, sessionId, {
				token: getHostServiceWsToken(hostUrl),
			}),

		searchFiles: async ({ workspaceId, cwd, query }) => {
			if (query.trim()) {
				const { matches } = await getHostServiceClientByUrl(
					hostUrl,
				).filesystem.searchFiles.query({
					workspaceId,
					query,
					includeHidden: false,
					limit: 20,
				});
				return matches.map((match) => ({
					id: match.absolutePath,
					name: match.name,
					relativePath: match.relativePath,
				}));
			}
			const { entries } = await getHostServiceClientByUrl(
				hostUrl,
			).filesystem.listDirectory.query({
				workspaceId,
				absolutePath: cwd,
			});
			return entries
				.filter((entry) => entry.kind === "file" && !entry.name.startsWith("."))
				.sort((a, b) => a.name.localeCompare(b.name))
				.slice(0, 20)
				.map((entry) => ({
					id: entry.absolutePath,
					name: entry.name,
					relativePath: entry.name,
				}));
		},
	};
}

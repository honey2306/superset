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

	const api: AcpSessionsApi = {
		get: (input) => trpc().get.query(input),
		getMessages: (input) => trpc().getMessages.query(input),
		getTranscript: (input) => trpc().getTranscript.query(input),
		prompt: (input) => trpc().prompt.mutate(input),
		respondToPermission: (input) => trpc().respondToPermission.mutate(input),
		cancel: (input) => trpc().cancel.mutate(input),
		close: (input) => trpc().close.mutate(input),
		setMode: (input) => trpc().setMode.mutate(input),
		setConfigOption: (input) => trpc().setConfigOption.mutate(input),
		// Follow-up queue: composer's streaming-mode Enter path calls enqueue,
		// so `apiRef.current.enqueuePrompt is not a function` fires the moment
		// the user types while a turn is in flight when these are omitted.
		enqueuePrompt: (input) => trpc().enqueuePrompt.mutate(input),
		sendNow: (input) => trpc().sendNow.mutate(input),
		removeQueuedPrompt: (input) => trpc().removeQueuedPrompt.mutate(input),
		reorderQueue: (input) => trpc().reorderQueue.mutate(input),
		editQueuedPrompt: (input) => trpc().editQueuedPrompt.mutate(input),
		clearQueue: (input) => trpc().clearQueue.mutate(input),
	};

	return {
		api,

		create: (input) => trpc().create.mutate(input),

		list: (input) => trpc().list.query(input),

		streamUrl: (sessionId) => () => {
			const base = hostUrl
				.replace(/^https:\/\//, "wss://")
				.replace(/^http:\/\//, "ws://")
				.replace(/\/$/, "");
			const encoded = encodeURIComponent(sessionId);
			const path = `/acp-sessions/${encoded}/stream`;
			const token = getHostServiceWsToken(hostUrl);
			if (!token) return `${base}${path}`;
			const params = new URLSearchParams({ token });
			return `${base}${path}?${params.toString()}`;
		},

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

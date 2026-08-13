import type {
	AcpSessionsApi,
	HarnessKind,
	SessionScopedState,
	SessionsPage,
} from "@superset/session-protocol";
import { getStoredToken } from "./auth-store";
import { getPhoneTransport } from "./transport";
import { getTrpc } from "./trpc-client";

export interface PhoneAcpClient {
	api: AcpSessionsApi;
	create(input: {
		sessionId: string;
		workspaceId: string;
		harness?: HarnessKind;
	}): Promise<SessionScopedState>;
	list(input: {
		workspaceId: string;
		cursor?: string;
		limit?: number;
	}): Promise<SessionsPage>;
	streamUrl(sessionId: string): () => string;
	createWebSocket(
		url: string,
	): import("@superset/session-protocol/client").WebSocketLike;
}

/**
 * Browser-side implementation of `AcpSessionsApi` layered on top of the
 * same-origin tRPC client. `streamUrl` embeds the phone-session bearer as
 * `?token=` since the browser `WebSocket` constructor cannot set headers.
 */
export function createPhoneAcpClient(): PhoneAcpClient {
	const trpc = () => getTrpc().acpSessions;
	const api: AcpSessionsApi = {
		get: (input) => trpc().get.query(input),
		getMessages: (input) => trpc().getMessages.query(input),
		prompt: (input) => trpc().prompt.mutate(input),
		respondToPermission: (input) => trpc().respondToPermission.mutate(input),
		cancel: (input) => trpc().cancel.mutate(input),
		close: (input) => trpc().close.mutate(input),
		setMode: (input) => trpc().setMode.mutate(input),
		setConfigOption: (input) => trpc().setConfigOption.mutate(input),
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
			const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
			const host = window.location.host;
			const encoded = encodeURIComponent(sessionId);
			const token = getStoredToken();
			const suffix = token
				? `?${new URLSearchParams({ token }).toString()}`
				: "";
			return `${proto}//${host}/acp-sessions/${encoded}/stream${suffix}`;
		},
		createWebSocket: (url) => getPhoneTransport().createWebSocket(url),
	};
}

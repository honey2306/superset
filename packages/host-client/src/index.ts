import type { AppRouter } from "@superset/host-contract";
import type { AcpSessionsApi } from "@superset/session-protocol";
import {
	createTRPCClient,
	httpBatchStreamLink,
	httpLink,
	type TRPCClient,
} from "@trpc/client";
import superjson from "superjson";

export type HostClient = TRPCClient<AppRouter>;
type HttpOptions = Parameters<typeof httpLink<AppRouter>>[0];
export interface HostClientOptions {
	/** Empty for a same-origin browser client. */
	endpoint: string;
	headers?:
		| Record<string, string | undefined>
		| (() =>
				| Record<string, string | undefined>
				| Promise<Record<string, string | undefined>>);
	fetch?: HttpOptions["fetch"];
	transport?: "single" | "batch-stream";
}

/** Each request reads current credentials; the SDK does not own credential storage. */
export function createHostLinks(options: HostClientOptions) {
	const config = {
		url: `${options.endpoint.replace(/\/+$/, "")}/trpc`,
		transformer: superjson,
		headers: options.headers,
		fetch: options.fetch,
	};
	return [
		options.transport === "batch-stream"
			? httpBatchStreamLink<AppRouter>(config)
			: httpLink<AppRouter>(config),
	];
}

export function createHostClient(options: HostClientOptions): HostClient {
	return createTRPCClient<AppRouter>({ links: createHostLinks(options) });
}

/** Reconnect callers invoke this again to read the latest token/cursor. */
export function sessionStreamUrl(
	endpoint: string,
	sessionId: string,
	options: {
		token?: string | null;
		since?: number;
		epoch?: string;
	} = {},
): string {
	const url = new URL(
		`${endpoint.replace(/\/+$/, "")}/acp-sessions/${encodeURIComponent(sessionId)}/stream`,
	);
	url.protocol =
		url.protocol === "https:" || url.protocol === "wss:" ? "wss:" : "ws:";
	if (options.token) url.searchParams.set("token", options.token);
	if (options.since !== undefined)
		url.searchParams.set("since", String(options.since));
	if (options.epoch) url.searchParams.set("epoch", options.epoch);
	return url.toString();
}

/** The common controller API for Desktop, phone and CLI. Platform outboxes may
 * decorate individual commands without maintaining another procedure map. */
export function createAcpSessionsApi(
	getClient: () => Pick<HostClient, "acpSessions">,
): AcpSessionsApi {
	const acp = () => getClient().acpSessions;
	return {
		get: (input) => acp().get.query(input),
		getMessages: (input) => acp().getMessages.query(input),
		getTranscript: (input) => acp().getTranscript.query(input),
		prompt: (input) => acp().prompt.mutate(input),
		respondToPermission: (input) => acp().respondToPermission.mutate(input),
		cancel: (input) => acp().cancel.mutate(input),
		close: (input) => acp().close.mutate(input),
		setMode: (input) => acp().setMode.mutate(input),
		setConfigOption: (input) => acp().setConfigOption.mutate(input),
		enqueuePrompt: (input) => acp().enqueuePrompt.mutate(input),
		sendNow: (input) => acp().sendNow.mutate(input),
		steerPrompt: (input) => acp().steerPrompt.mutate(input),
		removeQueuedPrompt: (input) => acp().removeQueuedPrompt.mutate(input),
		reorderQueue: (input) => acp().reorderQueue.mutate(input),
		editQueuedPrompt: (input) => acp().editQueuedPrompt.mutate(input),
		clearQueue: (input) => acp().clearQueue.mutate(input),
	};
}

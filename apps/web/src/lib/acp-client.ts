import type {
	AcpSessionsApi,
	ContentBlock,
	EnqueuePromptResult,
	HarnessKind,
	PromptAccepted,
	SessionScopedState,
	SessionsPage,
} from "@superset/session-protocol";
import {
	type AcpCommandOperation,
	AcpCommandOutbox,
	type PendingAcpCommand,
} from "./acp-command-outbox";
import { getStoredSession, getStoredToken } from "./auth-store";
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
function getPhoneHostKey(): string {
	const session = getStoredSession();
	const origin = typeof location === "undefined" ? "unknown" : location.origin;
	// Never include the bearer token in the outbox key. hostId + relay mailbox
	// still keep commands from two pairings/hosts from colliding.
	return [session?.hostId ?? origin, session?.relayMailboxId ?? "direct"].join(
		":",
	);
}

function toPendingCommand(
	operation: AcpCommandOperation,
	input: { sessionId: string; commandId?: string; prompt: ContentBlock[] },
): PendingAcpCommand {
	return {
		commandId: input.commandId ?? AcpCommandOutbox.createCommandId(),
		sessionId: input.sessionId,
		operation,
		prompt: [...input.prompt],
		createdAt: Date.now(),
	};
}

export function createPhoneAcpClient(sessionId?: string): PhoneAcpClient {
	const trpc = () => getTrpc().acpSessions;
	const hostKey = getPhoneHostKey();
	const outboxes = new Map<string, AcpCommandOutbox>();
	const outboxFor = (id: string) => {
		const existing = outboxes.get(id);
		if (existing) return existing;
		const created = new AcpCommandOutbox(hostKey, id);
		outboxes.set(id, created);
		return created;
	};
	const invokePending = async (
		command: PendingAcpCommand,
	): Promise<PromptAccepted | EnqueuePromptResult> => {
		const input = {
			sessionId: command.sessionId,
			commandId: command.commandId,
			prompt: command.prompt,
		};
		switch (command.operation) {
			case "prompt":
				return trpc().prompt.mutate(input);
			case "enqueuePrompt":
				return trpc().enqueuePrompt.mutate(input);
			case "sendNow":
				return trpc().sendNow.mutate(input);
		}
	};
	const sendCommand = <T extends PromptAccepted | EnqueuePromptResult>(
		operation: AcpCommandOperation,
		input: { sessionId: string; commandId?: string; prompt: ContentBlock[] },
	): Promise<T> => {
		const command = toPendingCommand(operation, input);
		return outboxFor(input.sessionId).send(
			command,
			invokePending,
		) as Promise<T>;
	};
	const api: AcpSessionsApi = {
		get: (input) => {
			// Initial load and every foreground snapshot are retry opportunities.
			// Do not await the outbox: a poison/application error must not hide the
			// authoritative session snapshot from the user.
			void outboxFor(input.sessionId).drain(invokePending);
			return trpc().get.query(input);
		},
		getMessages: (input) => trpc().getMessages.query(input),
		getTranscript: (input) => trpc().getTranscript.query(input),
		prompt: (input) => sendCommand<PromptAccepted>("prompt", input),
		respondToPermission: (input) => trpc().respondToPermission.mutate(input),
		cancel: (input) => trpc().cancel.mutate(input),
		close: (input) => trpc().close.mutate(input),
		setMode: (input) => trpc().setMode.mutate(input),
		setConfigOption: (input) => trpc().setConfigOption.mutate(input),
		enqueuePrompt: (input) =>
			sendCommand<EnqueuePromptResult>("enqueuePrompt", input),
		sendNow: (input) => sendCommand<PromptAccepted>("sendNow", input),
		removeQueuedPrompt: (input) => trpc().removeQueuedPrompt.mutate(input),
		reorderQueue: (input) => trpc().reorderQueue.mutate(input),
		editQueuedPrompt: (input) => trpc().editQueuedPrompt.mutate(input),
		clearQueue: (input) => trpc().clearQueue.mutate(input),
	};
	if (sessionId) {
		// Drain only this session's durable commands. The outbox's scoped lock
		// serializes a recreated client with any still-mounted old client.
		void outboxFor(sessionId).drain(invokePending);
	}
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

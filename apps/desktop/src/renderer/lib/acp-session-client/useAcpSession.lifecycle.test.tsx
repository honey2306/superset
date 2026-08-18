import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import type {
	SessionScopedState,
	SessionUpdateEnvelope,
} from "@superset/session-protocol";
import type { WebSocketLike } from "@superset/session-protocol/client";
import { useAcpSession } from "@superset/session-protocol/react";
import { ensureHappyDom } from "test-utils/happy-dom-env";

let act: typeof import("@testing-library/react/pure").act;
let cleanup: typeof import("@testing-library/react/pure").cleanup;
let renderHook: typeof import("@testing-library/react/pure").renderHook;

beforeAll(async () => {
	await ensureHappyDom();
	({ act, cleanup, renderHook } = await import("@testing-library/react/pure"));
});

afterEach(() => {
	cleanup();
});

const state: SessionScopedState = {
	sessionId: "lifecycle-session",
	epoch: "lifecycle-epoch",
	workspaceId: "workspace-1",
	harness: "pi-acp",
	status: "idle",
	title: null,
	currentMode: null,
	configOptions: [],
	availableCommands: [],
	pendingPermissions: [],
	queuedPrompts: [],
	cwd: "/repo",
	lastSeq: 1,
	lastStopReason: "end_turn",
	lastError: null,
	createdAt: 1,
	updatedAt: 1,
};

const history: SessionUpdateEnvelope[] = [
	{
		seq: 1,
		epoch: state.epoch,
		sessionId: state.sessionId,
		ts: 1,
		frame: {
			kind: "update",
			update: {
				sessionUpdate: "agent_message_chunk",
				content: { type: "text", text: "preserved history" },
			},
		},
	},
];

function idleSocket(): WebSocketLike {
	return {
		onopen: null,
		onmessage: null,
		onclose: null,
		onerror: null,
		close() {},
	};
}

function messageEnvelope(text: string, seq: number): SessionUpdateEnvelope {
	return {
		seq,
		epoch: state.epoch,
		sessionId: state.sessionId,
		ts: seq,
		frame: {
			kind: "update",
			update: {
				sessionUpdate: "agent_message_chunk",
				content: { type: "text", text },
			},
		},
	};
}

async function waitFor(predicate: () => boolean, timeoutMs = 3_000) {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (Date.now() > deadline) throw new Error("timed out waiting for hook");
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
		});
	}
}

describe("useAcpSession lifecycle recovery", () => {
	test("does not subscribe while hidden and fully resyncs when visible again", async () => {
		let getCalls = 0;
		let getMessagesCalls = 0;
		let closeCalls = 0;
		const sockets: ReturnType<typeof idleSocket>[] = [];
		const api = {
			get: async () => {
				getCalls += 1;
				return state;
			},
			getMessages: async () => {
				getMessagesCalls += 1;
				return { items: history, nextCursor: null };
			},
			prompt: async () => ({ accepted: true as const }),
			cancel: async () => {},
			close: async () => {},
			respondToPermission: async () => ({ status: "resolved" as const }),
			setMode: async () => {},
			setConfigOption: async () => {},
			enqueuePrompt: async () => ({ queueId: "q-1" }),
			sendNow: async () => ({ accepted: true as const }),
			removeQueuedPrompt: async () => {},
			reorderQueue: async () => {},
			editQueuedPrompt: async () => {},
			clearQueue: async () => {},
		};
		const createWebSocket = () => {
			const socket = idleSocket();
			const close = socket.close;
			socket.close = () => {
				closeCalls += 1;
				close();
			};
			sockets.push(socket);
			return socket;
		};
		const { result, rerender } = renderHook(
			({ enabled }: { enabled: boolean }) =>
				useAcpSession({
					sessionId: state.sessionId,
					api,
					streamUrl: "ws://test",
					createWebSocket,
					enabled,
				}),
			{ initialProps: { enabled: false } },
		);

		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(getCalls).toBe(0);
		expect(sockets).toHaveLength(0);

		rerender({ enabled: true });
		await waitFor(() => result.current.isLoading === false);
		await waitFor(() => sockets.length === 1);
		expect(getCalls).toBe(1);
		expect(getMessagesCalls).toBe(1);

		rerender({ enabled: false });
		expect(closeCalls).toBe(1);
		expect(result.current.timeline.items).toHaveLength(1);

		rerender({ enabled: true });
		await waitFor(() => getCalls === 2 && getMessagesCalls === 2);
		await waitFor(() => sockets.length === 2);
	});

	test("publishes same-frame live envelopes as one timeline update", async () => {
		const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
		const previousCancelAnimationFrame = globalThis.cancelAnimationFrame;
		const frames = new Map<number, FrameRequestCallback>();
		let nextFrame = 1;
		globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
			const frame = nextFrame;
			nextFrame += 1;
			frames.set(frame, callback);
			return frame;
		}) as typeof requestAnimationFrame;
		globalThis.cancelAnimationFrame = ((frame: number) => {
			frames.delete(frame);
		}) as typeof cancelAnimationFrame;

		try {
			const sockets: ReturnType<typeof idleSocket>[] = [];
			const { result } = renderHook(() =>
				useAcpSession({
					sessionId: state.sessionId,
					api: {
						get: async () => state,
						getMessages: async () => ({ items: [], nextCursor: null }),
						prompt: async () => ({ accepted: true as const }),
						cancel: async () => {},
						close: async () => {},
						respondToPermission: async () => ({ status: "resolved" as const }),
						setMode: async () => {},
						setConfigOption: async () => {},
						enqueuePrompt: async () => ({ queueId: "q-1" }),
						sendNow: async () => ({ accepted: true as const }),
						removeQueuedPrompt: async () => {},
						reorderQueue: async () => {},
						editQueuedPrompt: async () => {},
						clearQueue: async () => {},
					},
					streamUrl: "ws://test",
					createWebSocket: () => {
						const socket = idleSocket();
						sockets.push(socket);
						return socket;
					},
				}),
			);
			await waitFor(() => result.current.isLoading === false);
			await waitFor(() => sockets.length === 1);

			await act(async () => {
				sockets[0]?.onmessage?.({
					data: JSON.stringify(messageEnvelope("first", 2)),
				});
				sockets[0]?.onmessage?.({
					data: JSON.stringify(messageEnvelope(" second", 3)),
				});
			});
			expect(frames).toHaveLength(1);
			expect(result.current.timeline.items).toHaveLength(0);

			await act(async () => {
				const callback = frames.values().next().value;
				if (!callback) throw new Error("expected animation frame");
				callback(0);
			});
			const item = result.current.timeline.items[0];
			if (item?.kind !== "message") throw new Error("expected message");
			expect(item.blocks).toEqual([{ type: "text", text: "first second" }]);
		} finally {
			globalThis.requestAnimationFrame = previousRequestAnimationFrame;
			globalThis.cancelAnimationFrame = previousCancelAnimationFrame;
		}
	});

	test("loads only the latest page initially, then prepends an older page without losing live frames", async () => {
		const calls: Array<string | undefined> = [];
		const sockets: ReturnType<typeof idleSocket>[] = [];
		const newer = messageEnvelope("newer", 3);
		const older = messageEnvelope("older", 1);
		const { result } = renderHook(() =>
			useAcpSession({
				sessionId: state.sessionId,
				pageSize: 1,
				api: {
					get: async () => ({ ...state, lastSeq: 3 }),
					getMessages: async ({ cursor }) => {
						calls.push(cursor);
						return cursor === undefined
							? { items: [newer], nextCursor: "older-page" }
							: { items: [older], nextCursor: null };
					},
					prompt: async () => ({ accepted: true as const }),
					cancel: async () => {},
					close: async () => {},
					respondToPermission: async () => ({ status: "resolved" as const }),
					setMode: async () => {},
					setConfigOption: async () => {},
					enqueuePrompt: async () => ({ queueId: "q-1" }),
					sendNow: async () => ({ accepted: true as const }),
					removeQueuedPrompt: async () => {},
					reorderQueue: async () => {},
					editQueuedPrompt: async () => {},
					clearQueue: async () => {},
				},
				streamUrl: "ws://test",
				createWebSocket: () => {
					const socket = idleSocket();
					sockets.push(socket);
					return socket;
				},
			}),
		);

		await waitFor(() => result.current.isLoading === false);
		expect(calls).toEqual([undefined]);
		expect(result.current.timeline.lastSeq).toBe(3);
		expect(result.current.hasOlder).toBe(true);

		await act(async () => {
			sockets[0]?.onmessage?.({
				data: JSON.stringify(messageEnvelope(" live", 4)),
			});
			await new Promise((resolve) => setTimeout(resolve, 0));
			await result.current.loadOlder();
		});

		expect(calls).toEqual([undefined, "older-page"]);
		const item = result.current.timeline.items[0];
		if (item?.kind !== "message") throw new Error("expected message");
		expect(item.blocks).toEqual([{ type: "text", text: "oldernewer live" }]);
	});

	test("keeps cached history disabled through a transient failure, then restores admission", async () => {
		let fail = false;
		const api = {
			get: async () => {
				if (fail) throw new Error("host restarting");
				return state;
			},
			getMessages: async () => ({ items: history, nextCursor: null }),
			prompt: async () => ({ accepted: true as const }),
			cancel: async () => {},
			close: async () => {},
			respondToPermission: async () => ({ status: "resolved" as const }),
			setMode: async () => {},
			setConfigOption: async () => {},
			enqueuePrompt: async () => ({ queueId: "q-1" }),
			sendNow: async () => ({ accepted: true as const }),
			removeQueuedPrompt: async () => {},
			reorderQueue: async () => {},
			editQueuedPrompt: async () => {},
			clearQueue: async () => {},
		};
		const { result } = renderHook(() =>
			useAcpSession({
				sessionId: state.sessionId,
				api,
				streamUrl: "ws://test",
				createWebSocket: idleSocket,
			}),
		);
		await waitFor(() => result.current.isLoading === false);
		expect(result.current.timeline.items).toHaveLength(1);

		fail = true;
		await act(async () => {
			await result.current.actions.refresh();
		});
		await waitFor(() => result.current.error !== null);
		expect(result.current.state?.status).toBe("idle");
		expect(result.current.timeline.items).toHaveLength(1);
		expect(result.current.availability).toBe("retrying");

		fail = false;
		await waitFor(
			() =>
				result.current.error === null &&
				result.current.availability === "live" &&
				result.current.isLoading === false,
		);
		expect(result.current.timeline.items).toHaveLength(1);
	});

	test("stops retrying after the bounded attempt budget and leaves Retry available", async () => {
		let fail = false;
		let getCalls = 0;
		const api = {
			get: async () => {
				getCalls += 1;
				if (fail) throw new Error("host still down");
				return state;
			},
			getMessages: async () => ({ items: history, nextCursor: null }),
			prompt: async () => ({ accepted: true as const }),
			cancel: async () => {},
			close: async () => {},
			respondToPermission: async () => ({ status: "resolved" as const }),
			setMode: async () => {},
			setConfigOption: async () => {},
			enqueuePrompt: async () => ({ queueId: "q-1" }),
			sendNow: async () => ({ accepted: true as const }),
			removeQueuedPrompt: async () => {},
			reorderQueue: async () => {},
			editQueuedPrompt: async () => {},
			clearQueue: async () => {},
		};
		const { result } = renderHook(() =>
			useAcpSession({
				sessionId: state.sessionId,
				api,
				streamUrl: "ws://test",
				createWebSocket: idleSocket,
			}),
		);
		await waitFor(() => result.current.isLoading === false);
		fail = true;
		await act(async () => {
			await result.current.actions.refresh();
		});
		await waitFor(() => result.current.availability === "unavailable");
		expect(result.current.error?.message).toBe("host still down");
		expect(getCalls).toBe(5); // initial success + initial failure + 3 retries
		expect(result.current.timeline.items).toHaveLength(1);
	});

	test("replaces an exhausted transport with a new host while preserving history", async () => {
		let oldHostAvailable = true;
		const oldApi = {
			get: async () => {
				if (!oldHostAvailable) throw new Error("old host is gone");
				return state;
			},
			getMessages: async () => ({ items: history, nextCursor: null }),
			prompt: async () => ({ accepted: true as const }),
			cancel: async () => {},
			close: async () => {},
			respondToPermission: async () => ({ status: "resolved" as const }),
			setMode: async () => {},
			setConfigOption: async () => {},
			enqueuePrompt: async () => ({ queueId: "q-1" }),
			sendNow: async () => ({ accepted: true as const }),
			removeQueuedPrompt: async () => {},
			reorderQueue: async () => {},
			editQueuedPrompt: async () => {},
			clearQueue: async () => {},
		};
		const newApi = {
			...oldApi,
			get: async () => state,
		};
		const { result, rerender } = renderHook(
			({ api, connectionKey }: { api: typeof oldApi; connectionKey: string }) =>
				useAcpSession({
					sessionId: state.sessionId,
					connectionKey,
					api,
					streamUrl: "ws://test",
					createWebSocket: idleSocket,
				}),
			{
				initialProps: { api: oldApi, connectionKey: "http://old-host" },
			},
		);
		await waitFor(() => result.current.isLoading === false);
		expect(result.current.timeline.items).toHaveLength(1);

		oldHostAvailable = false;
		await act(async () => {
			await result.current.actions.refresh();
		});
		await waitFor(() => result.current.availability === "unavailable");
		expect(result.current.timeline.items).toHaveLength(1);

		rerender({ api: newApi, connectionKey: "http://new-host" });
		// The new transport's fetch is in flight, but the old durable timeline
		// remains renderable rather than flashing to an empty unavailable pane.
		expect(result.current.timeline.items).toHaveLength(1);
		await waitFor(
			() =>
				result.current.availability === "live" &&
				result.current.error === null &&
				result.current.isLoading === false,
		);
		expect(result.current.timeline.items).toHaveLength(1);
	});
});

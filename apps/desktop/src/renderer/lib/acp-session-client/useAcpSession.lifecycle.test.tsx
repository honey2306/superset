import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import type {
	SessionScopedState,
	SessionUpdateEnvelope,
} from "@superset/session-protocol";
import type { WebSocketLike } from "@superset/session-protocol/client";
import {
	clearAcpSessionSnapshotCache,
	type UseAcpSessionResult,
	useAcpSession,
} from "@superset/session-protocol/react";
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
	clearAcpSessionSnapshotCache();
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
	test("restores an unexpired session snapshot without mixing sessions", async () => {
		const sessionA: SessionScopedState = {
			...state,
			sessionId: "snapshot-session-a",
			epoch: "snapshot-epoch-a",
			status: "awaiting_permission",
			pendingPermissions: [
				{
					requestId: "stale-permission",
					toolCall: { toolCallId: "tool-a", status: "pending" },
					options: [
						{ optionId: "allow", name: "Allow", kind: "allow_once" },
						{ optionId: "reject", name: "Reject", kind: "reject_once" },
					],
					requestedAt: 1,
				},
			],
		};
		const sessionB: SessionScopedState = {
			...state,
			sessionId: "snapshot-session-b",
			epoch: "snapshot-epoch-b",
		};
		const historyFor = (session: SessionScopedState, text: string) => [
			{
				...history[0],
				epoch: session.epoch,
				sessionId: session.sessionId,
				frame: {
					kind: "update" as const,
					update: {
						sessionUpdate: "agent_message_chunk" as const,
						content: { type: "text" as const, text },
					},
				},
			},
		];
		const api = {
			get: async ({ sessionId }: { sessionId: string }) =>
				sessionId === sessionA.sessionId ? sessionA : sessionB,
			getMessages: async ({ sessionId }: { sessionId: string }) => ({
				items: historyFor(
					sessionId === sessionA.sessionId ? sessionA : sessionB,
					sessionId === sessionA.sessionId ? "history A" : "history B",
				),
				nextCursor: null,
			}),
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
		const renders: Array<{
			sessionId: string;
			state: SessionScopedState | null;
			timelineText: string | undefined;
			isLoading: boolean;
		}> = [];
		const { result, rerender, unmount } = renderHook(
			({ sessionId }: { sessionId: string }) => {
				const snapshot = useAcpSession({
					sessionId,
					api,
					streamUrl: "ws://test",
					createWebSocket: idleSocket,
				});
				renders.push({
					sessionId,
					state: snapshot.state,
					timelineText:
						snapshot.timeline.items[0]?.kind === "message"
							? snapshot.timeline.items[0].blocks[0]?.type === "text"
								? snapshot.timeline.items[0].blocks[0].text
								: undefined
							: undefined,
					isLoading: snapshot.isLoading,
				});
				return snapshot;
			},
			{ initialProps: { sessionId: sessionA.sessionId } },
		);

		await waitFor(() => result.current.isLoading === false);
		expect(result.current.timeline.items[0]).toMatchObject({
			kind: "message",
			blocks: [{ type: "text", text: "history A" }],
		});

		rerender({ sessionId: sessionB.sessionId });
		expect(result.current.state).toBeNull();
		expect(result.current.timeline.items).toHaveLength(0);
		expect(result.current.isLoading).toBe(true);
		await waitFor(() => result.current.isLoading === false);
		expect(result.current.timeline.items[0]).toMatchObject({
			kind: "message",
			blocks: [{ type: "text", text: "history B" }],
		});

		const rendersBeforeA = renders.length;
		rerender({ sessionId: sessionA.sessionId });
		// The first render after switching is the A snapshot, never B's state.
		const firstA = renders
			.slice(rendersBeforeA)
			.find((render) => render.sessionId === sessionA.sessionId);
		expect(firstA).toMatchObject({
			sessionId: sessionA.sessionId,
			timelineText: "history A",
			isLoading: false,
		});
		expect(firstA?.state?.sessionId).toBe(sessionA.sessionId);
		expect(firstA?.state?.status).toBe("starting");
		expect(firstA?.state?.pendingPermissions).toHaveLength(0);
		expect(result.current.state?.sessionId).toBe(sessionA.sessionId);
		expect(result.current.timeline.items[0]).toMatchObject({
			kind: "message",
			blocks: [{ type: "text", text: "history A" }],
		});

		// The pane key can remount this hook. The process cache still restores A.
		unmount();
		const remounts: UseAcpSessionResult[] = [];
		const remounted = renderHook(() => {
			const snapshot = useAcpSession({
				sessionId: sessionA.sessionId,
				api,
				streamUrl: "ws://test",
				createWebSocket: idleSocket,
			});
			remounts.push(snapshot);
			return snapshot;
		});
		expect(remounts[0]?.isLoading).toBe(false);
		expect(remounted.result.current.state?.sessionId).toBe(sessionA.sessionId);
		expect(remounted.result.current.timeline.items[0]).toMatchObject({
			kind: "message",
			blocks: [{ type: "text", text: "history A" }],
		});
	});

	test("does not use an expired session snapshot", async () => {
		const originalNow = Date.now;
		let now = originalNow();
		Date.now = () => now;
		try {
			const api = {
				get: async () => state,
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
			const first = renderHook(() =>
				useAcpSession({
					sessionId: state.sessionId,
					api,
					streamUrl: "ws://test",
					createWebSocket: idleSocket,
				}),
			);
			await waitFor(() => first.result.current.isLoading === false);
			first.unmount();

			now += 24 * 60 * 60 * 1_000 + 1;
			const expired = renderHook(() =>
				useAcpSession({
					sessionId: state.sessionId,
					api,
					streamUrl: "ws://test",
					createWebSocket: idleSocket,
				}),
			);
			expect(expired.result.current.state).toBeNull();
			expect(expired.result.current.timeline.items).toHaveLength(0);
			expect(expired.result.current.isLoading).toBe(true);
		} finally {
			Date.now = originalNow;
		}
	});

	test("does not render the previous session while switching ids", async () => {
		const oldSession: SessionScopedState = {
			...state,
			sessionId: "old-offline-session",
			status: "offline",
			createdAt: 1,
			updatedAt: 1,
		};
		const newSession: SessionScopedState = {
			...state,
			sessionId: "new-idle-session",
			status: "idle",
		};
		const renders: Array<{
			sessionId: string;
			state: SessionScopedState | null;
			timelineItems: number;
			error: Error | null;
			isLoading: boolean;
		}> = [];
		const api = {
			get: async ({ sessionId }: { sessionId: string }) =>
				sessionId === oldSession.sessionId ? oldSession : newSession,
			getMessages: async ({ sessionId }: { sessionId: string }) => ({
				items: history.map((envelope) => ({
					...envelope,
					sessionId,
				})),
				nextCursor: null,
			}),
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
		const { result, rerender } = renderHook(
			({ sessionId }: { sessionId: string }) => {
				const snapshot = useAcpSession({
					sessionId,
					api,
					streamUrl: "ws://test",
					createWebSocket: idleSocket,
				});
				renders.push({
					sessionId,
					state: snapshot.state,
					timelineItems: snapshot.timeline.items.length,
					error: snapshot.error,
					isLoading: snapshot.isLoading,
				});
				return snapshot;
			},
			{ initialProps: { sessionId: oldSession.sessionId } },
		);

		await waitFor(() => result.current.state?.status === "offline");
		const rendersBeforeSwitch = renders.length;
		rerender({ sessionId: newSession.sessionId });
		const firstNewRender = renders
			.slice(rendersBeforeSwitch)
			.find(({ sessionId }) => sessionId === newSession.sessionId);

		expect(firstNewRender).toMatchObject({
			state: null,
			timelineItems: 0,
			error: null,
			isLoading: true,
		});
	});

	test("resyncs when adapter creation finishes after an offline registry read", async () => {
		let getCalls = 0;
		const api = {
			get: async () => {
				getCalls += 1;
				return {
					...state,
					status: getCalls < 5 ? ("offline" as const) : ("idle" as const),
				};
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
		const { result, rerender } = renderHook(
			({ initiallyLaunching }: { initiallyLaunching: boolean }) =>
				useAcpSession({
					sessionId: state.sessionId,
					api,
					streamUrl: "ws://test",
					createWebSocket: idleSocket,
					initiallyLaunching,
				}),
			{ initialProps: { initiallyLaunching: true } },
		);

		await waitFor(
			() => getCalls === 5 && result.current.state?.status === "idle",
			6_000,
		);
		expect(result.current.state?.status).toBe("idle");
		rerender({ initiallyLaunching: false });
		expect(getCalls).toBeGreaterThanOrEqual(2);
	});

	test("retries a newly created offline row after launch state remounts", async () => {
		let getCalls = 0;
		const api = {
			get: async () => {
				getCalls += 1;
				return {
					...state,
					createdAt: Date.now(),
					status: getCalls === 1 ? ("offline" as const) : ("idle" as const),
				};
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

		await waitFor(
			() => getCalls === 2 && result.current.state?.status === "idle",
		);
		expect(result.current.error).toBeNull();
	});

	test("publishes refreshed state before reopened transcript history finishes loading", async () => {
		let currentStatus: SessionScopedState["status"] = "running";
		let transcriptCalls = 0;
		let releaseReopenedTranscript: (() => void) | undefined;
		const reopenedTranscriptGate = new Promise<void>((resolve) => {
			releaseReopenedTranscript = resolve;
		});
		const transcriptTurn = {
			turnNumber: 1,
			startSeq: 1,
			endSeq: 1,
			userPreview: "Existing prompt",
			agentPreview: "preserved history",
			isComplete: true,
			items: history,
		};
		const api = {
			get: async () => ({ ...state, status: currentStatus }),
			getMessages: async () => ({ items: [], nextCursor: null }),
			getTranscript: async () => {
				transcriptCalls += 1;
				if (transcriptCalls === 2) await reopenedTranscriptGate;
				return {
					turns: [transcriptTurn],
					index: [transcriptTurn],
					totalTurns: 1,
					nextCursor: null,
				};
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
		const { result, rerender } = renderHook(
			({ enabled }: { enabled: boolean }) =>
				useAcpSession({
					sessionId: state.sessionId,
					api,
					streamUrl: "ws://test",
					createWebSocket: idleSocket,
					enabled,
				}),
			{ initialProps: { enabled: true } },
		);

		await waitFor(() => result.current.isLoading === false);
		expect(result.current.state?.status).toBe("running");
		expect(result.current.timeline.items).toHaveLength(1);

		rerender({ enabled: false });
		currentStatus = "idle";
		rerender({ enabled: true });
		await waitFor(() => transcriptCalls === 2);

		expect(result.current.isLoading).toBe(true);
		expect(result.current.state?.status).toBe("idle");
		expect(result.current.timeline.items).toHaveLength(1);

		releaseReopenedTranscript?.();
		await waitFor(() => result.current.isLoading === false);
	});

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

	test("uses the semantic index for total turns, dedupes older loads, and loads a target turn", async () => {
		const calls: Array<{
			cursor?: string;
			targetTurn?: number;
			limit?: number;
		}> = [];
		const sockets: ReturnType<typeof idleSocket>[] = [];
		const user = (seq: number, text: string): SessionUpdateEnvelope => ({
			seq,
			epoch: state.epoch,
			sessionId: state.sessionId,
			ts: seq,
			frame: {
				kind: "update",
				update: {
					sessionUpdate: "user_message_chunk",
					content: { type: "text", text },
				},
			},
		});
		const turnOne = [user(1, "old question"), messageEnvelope("old answer", 2)];
		const turnTwo = [
			user(3, "new question"),
			messageEnvelope("part one", 4),
			messageEnvelope("part two", 5),
			messageEnvelope("new answer", 6),
		];
		let releaseOlder: (() => void) | undefined;
		const olderGate = new Promise<void>((resolve) => {
			releaseOlder = resolve;
		});
		const api = {
			get: async () => ({ ...state, lastSeq: 6 }),
			getMessages: async () => ({ items: [], nextCursor: null }),
			getTranscript: async (input: {
				cursor?: string;
				targetTurn?: number;
				limit?: number;
			}) => {
				calls.push(input);
				if (input.targetTurn === 1) {
					return {
						turns: [
							{
								turnNumber: 1,
								startSeq: 1,
								endSeq: 2,
								userPreview: "old question",
								agentPreview: "old answer",
								isComplete: true,
								items: turnOne,
							},
						],
						index: [
							{
								turnNumber: 1,
								startSeq: 1,
								endSeq: 2,
								userPreview: "old question",
								agentPreview: "old answer",
								isComplete: true,
							},
							{
								turnNumber: 2,
								startSeq: 3,
								endSeq: 6,
								userPreview: "new question",
								agentPreview: "new answer",
								isComplete: true,
							},
						],
						totalTurns: 2,
						nextCursor: null,
					};
				}
				if (input.cursor === undefined) {
					return {
						turns: [
							{
								turnNumber: 2,
								startSeq: 3,
								endSeq: 6,
								userPreview: "new question",
								agentPreview: "new answer",
								isComplete: true,
								items: turnTwo,
							},
						],
						index: [
							{
								turnNumber: 1,
								startSeq: 1,
								endSeq: 2,
								userPreview: "old question",
								agentPreview: "old answer",
								isComplete: true,
							},
							{
								turnNumber: 2,
								startSeq: 3,
								endSeq: 6,
								userPreview: "new question",
								agentPreview: "new answer",
								isComplete: true,
							},
						],
						totalTurns: 2,
						nextCursor: "t2",
					};
				}
				await olderGate;
				return {
					turns: [
						{
							turnNumber: 1,
							startSeq: 1,
							endSeq: 2,
							userPreview: "old question",
							agentPreview: "old answer",
							isComplete: true,
							items: turnOne,
						},
					],
					index: [],
					totalTurns: 2,
					nextCursor: null,
				};
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
		const { result } = renderHook(() =>
			useAcpSession({
				sessionId: state.sessionId,
				pageSize: 1,
				api,
				streamUrl: "ws://test",
				createWebSocket: () => {
					const socket = idleSocket();
					sockets.push(socket);
					return socket;
				},
			}),
		);
		await waitFor(() => result.current.isLoading === false);
		expect(calls[0]?.limit).toBe(8);
		expect(result.current.totalTurns).toBe(2);
		expect(result.current.loadedTurnNumbers).toEqual([2]);
		await act(async () => {
			await result.current.loadTurn(1);
		});
		expect(calls.filter(({ targetTurn }) => targetTurn === 1)).toHaveLength(1);
		expect(result.current.loadedTurnNumbers).toEqual([1, 2]);

		await act(async () => {
			sockets[0]?.onmessage?.({
				data: JSON.stringify(user(7, "live question")),
			});
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(result.current.totalTurns).toBe(3);
		expect(result.current.loadedTurnNumbers).toEqual([1, 2, 3]);

		const firstOlder = result.current.loadOlder();
		const secondOlder = result.current.loadOlder();
		expect(calls.filter(({ cursor }) => cursor === "t2")).toHaveLength(1);
		expect(calls.find(({ cursor }) => cursor === "t2")?.limit).toBe(1);
		releaseOlder?.();
		await act(async () => {
			await Promise.all([firstOlder, secondOlder]);
		});
		expect(result.current.loadedTurnNumbers).toEqual([1, 2]);
		// A target request for an already loaded turn is a no-op.
		await result.current.loadTurn(1);
		expect(calls.filter(({ targetTurn }) => targetTurn === 1)).toHaveLength(1);
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

import { describe, expect, test } from "bun:test";
import type {
	AcpSessionsApi,
	SessionScopedState,
	SessionUpdateEnvelope,
} from "..";
import { AcpSessionController } from "./AcpSessionController";

class FakeSocket {
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onclose: (() => void) | null = null;
	onerror: ((event: unknown) => void) | null = null;
	closed = false;

	close(): void {
		this.closed = true;
	}

	open(): void {
		this.onopen?.();
	}

	message(envelope: SessionUpdateEnvelope): void {
		this.onmessage?.({ data: JSON.stringify(envelope) });
	}
}

const state: SessionScopedState = {
	sessionId: "s1",
	epoch: "epoch-1",
	workspaceId: "w1",
	harness: "pi-acp",
	status: "idle",
	title: "Test",
	currentMode: null,
	configOptions: [],
	availableCommands: null,
	pendingPermissions: [],
	queuedPrompts: [],
	cwd: "/tmp",
	lastSeq: 0,
	lastStopReason: null,
	lastError: null,
	createdAt: 1,
	updatedAt: 1,
};

function envelope(
	seq: number,
	role: "user" | "agent",
	text: string,
): SessionUpdateEnvelope {
	return {
		sessionId: "s1",
		epoch: "epoch-1",
		seq,
		ts: seq,
		frame: {
			kind: "update",
			update: {
				sessionUpdate:
					role === "user" ? "user_message_chunk" : "agent_message_chunk",
				content: { type: "text", text },
			},
		},
	};
}

function api(overrides: Partial<AcpSessionsApi> = {}): AcpSessionsApi {
	return {
		get: async () => state,
		getMessages: async () => ({ items: [], nextCursor: null }),
		prompt: async () => ({ accepted: true }),
		respondToPermission: async () => ({ state }),
		cancel: async () => {},
		close: async () => {},
		setMode: async () => {},
		setConfigOption: async () => {},
		enqueuePrompt: async () => ({ queueId: "q1" }),
		sendNow: async () => ({ accepted: true }),
		removeQueuedPrompt: async () => {},
		reorderQueue: async () => {},
		editQueuedPrompt: async () => {},
		clearQueue: async () => {},
		...overrides,
	};
}

async function settle(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

describe("AcpSessionController", () => {
	test("seeds history and folds multiple live turns through shared ACP state", async () => {
		const socket = new FakeSocket();
		const controller = new AcpSessionController({
			sessionId: "s1",
			api: api({
				getMessages: async () => ({
					items: [envelope(1, "user", "one"), envelope(2, "agent", "ONE")],
					nextCursor: null,
				}),
			}),
			streamUrl: "ws://test",
			createWebSocket: () => socket,
		});
		controller.start();
		await settle();
		socket.open();
		socket.message(envelope(3, "user", "two"));
		socket.message(envelope(4, "agent", "TWO"));
		await new Promise((resolve) => setTimeout(resolve, 0));

		const messages = controller
			.getSnapshot()
			.timeline.items.filter((item) => item.kind === "message");
		expect(messages).toHaveLength(4);
		expect(
			messages.at(-1)?.kind === "message" && messages.at(-1)?.blocks,
		).toEqual([{ type: "text", text: "TWO" }]);
		controller.stop();
	});

	test("resyncs authoritative history when the shared stream reports reset", async () => {
		const sockets: FakeSocket[] = [];
		let reads = 0;
		const controller = new AcpSessionController({
			sessionId: "s1",
			api: api({
				get: async () => ({ ...state, lastSeq: reads++ }),
			}),
			streamUrl: "ws://test",
			createWebSocket: () => {
				const socket = new FakeSocket();
				sockets.push(socket);
				return socket;
			},
		});
		controller.start();
		await settle();
		sockets[0]?.open();
		sockets[0]?.message({
			sessionId: "s1",
			epoch: "epoch-1",
			seq: 1,
			ts: 1,
			frame: { kind: "reset", reason: "sequence_gap" },
		});
		await settle();
		expect(reads).toBe(2);
		expect(sockets).toHaveLength(2);
		controller.stop();
	});

	test("continues flushing live envelopes after reset cancels a pending old-epoch batch", async () => {
		const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
		const previousCancelAnimationFrame = globalThis.cancelAnimationFrame;
		const callbacks = new Map<number, FrameRequestCallback>();
		let nextFrame = 1;
		globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
			const id = nextFrame++;
			callbacks.set(id, callback);
			return id;
		};
		globalThis.cancelAnimationFrame = (id: number) => {
			callbacks.delete(id);
		};

		try {
			const sockets: FakeSocket[] = [];
			let reads = 0;
			const controller = new AcpSessionController({
				sessionId: "s1",
				api: api({
					get: async () => ({
						...state,
						epoch: reads++ === 0 ? "epoch-1" : "epoch-2",
					}),
				}),
				streamUrl: "ws://test",
				createWebSocket: () => {
					const socket = new FakeSocket();
					sockets.push(socket);
					return socket;
				},
			});
			await controller.start();
			sockets[0]?.open();
			sockets[0]?.message(envelope(1, "agent", "stale"));
			expect(callbacks).toHaveLength(1);

			sockets[0]?.message({
				sessionId: "s1",
				epoch: "epoch-1",
				seq: 2,
				ts: 2,
				frame: { kind: "reset", reason: "turn_compacted" },
			});
			await settle();
			expect(callbacks).toHaveLength(0);
			sockets[1]?.open();
			sockets[1]?.message({
				...envelope(1, "agent", "fresh"),
				epoch: "epoch-2",
			});
			expect(callbacks).toHaveLength(1);
			callbacks.values().next().value?.(0);

			const latest = controller.getSnapshot().timeline.items.at(-1);
			expect(latest).toMatchObject({
				kind: "message",
				role: "agent",
				blocks: [{ type: "text", text: "fresh" }],
			});
			controller.stop();
		} finally {
			globalThis.requestAnimationFrame = previousRequestAnimationFrame;
			globalThis.cancelAnimationFrame = previousCancelAnimationFrame;
		}
	});

	test("folds permission state from the authoritative ACP stream", async () => {
		const socket = new FakeSocket();
		const controller = new AcpSessionController({
			sessionId: "s1",
			api: api(),
			streamUrl: "ws://test",
			createWebSocket: () => socket,
		});
		await controller.start();
		socket.open();
		socket.message({
			sessionId: "s1",
			epoch: "epoch-1",
			seq: 1,
			ts: 1,
			frame: {
				kind: "state",
				state: {
					...state,
					status: "awaiting_permission",
					lastSeq: 1,
					pendingPermissions: [
						{
							requestId: "permission-1",
							requestedAt: 1,
							toolCall: { toolCallId: "tool-1", title: "Run command" },
							options: [
								{ optionId: "allow", name: "Allow", kind: "allow_once" },
							],
						},
					],
				},
			},
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(
			controller.getSnapshot().state?.pendingPermissions[0]?.requestId,
		).toBe("permission-1");
		controller.stop();
	});

	test("forwards queue actions through the shared API", async () => {
		const calls: string[] = [];
		const controller = new AcpSessionController({
			sessionId: "s1",
			api: api({
				enqueuePrompt: async () => {
					calls.push("enqueue");
					return { queueId: "q1" };
				},
				clearQueue: async () => {
					calls.push("clear");
				},
			}),
			streamUrl: "ws://test",
			createWebSocket: () => new FakeSocket(),
		});
		await controller.actions.enqueue([{ type: "text", text: "later" }]);
		await controller.actions.clearQueue();
		expect(calls).toEqual(["enqueue", "clear"]);
	});
});

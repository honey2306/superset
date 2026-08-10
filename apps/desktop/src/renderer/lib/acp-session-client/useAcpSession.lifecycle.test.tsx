import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import type {
	SessionScopedState,
	SessionUpdateEnvelope,
} from "@superset/session-protocol";
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

function idleSocket() {
	return {
		onopen: null,
		onmessage: null,
		onclose: null,
		onerror: null,
		close() {},
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
});

import { expect, test } from "bun:test";
import type { SessionUpdateEnvelope } from "../../envelope";
import { emptyTimeline, foldEnvelopes } from "../../fold";
import type { SessionScopedState } from "../../state";
import {
	fetchCompleteMessageHistory,
	observeSessionVisibility,
	overlayAuthoritativeState,
	shouldRetryInitialLaunchNotFound,
} from "./useAcpSession";

const currentState: SessionScopedState = {
	sessionId: "session-1",
	workspaceId: "workspace-1",
	harness: "claude-agent-acp",
	status: "idle",
	title: null,
	currentMode: null,
	configOptions: [],
	availableCommands: [{ name: "current", description: "Current catalog" }],
	pendingPermissions: [],
	queuedPrompts: [],
	cwd: "/repo",
	lastSeq: 3,
	lastStopReason: null,
	lastError: null,
	createdAt: 1,
	updatedAt: 2,
};

test("historical refolds retain the current command catalog over old pages", () => {
	const oldPage: SessionUpdateEnvelope[] = [
		{
			seq: 1,
			sessionId: "session-1",
			ts: 1,
			frame: {
				kind: "update",
				update: {
					sessionUpdate: "available_commands_update",
					availableCommands: [{ name: "stale", description: "Old catalog" }],
				},
			},
		},
	];

	const refolded = overlayAuthoritativeState(
		foldEnvelopes(emptyTimeline(), oldPage),
		currentState,
	);
	expect(refolded.meta.availableCommands).toEqual(
		currentState.availableCommands,
	);
	expect(refolded.state).toBe(currentState);
});

test("authoritative state restores mode choices and refreshed config values", () => {
	const timeline = overlayAuthoritativeState(
		foldEnvelopes(emptyTimeline(), [
			{
				seq: 1,
				sessionId: "session-1",
				ts: 1,
				frame: {
					kind: "update",
					update: {
						sessionUpdate: "current_mode_update",
						currentModeId: "default",
					},
				},
			},
		]),
		{
			...currentState,
			currentMode: {
				currentModeId: "default",
				availableModes: [{ id: "default", name: "Auto" }],
			},
			configOptions: [
				{
					id: "model",
					name: "Model",
					options: [
						{ value: "default", name: "Default" },
						{ value: "haiku", name: "Haiku" },
					],
					currentValue: "haiku",
				},
			],
		},
	);

	expect(timeline.meta.currentMode?.availableModes).toEqual([
		{ id: "default", name: "Auto" },
	]);
	expect(timeline.meta.configOptions?.[0]?.currentValue).toBe("haiku");
});

test("historical refolds use the fetched harness when the journal has no state frame", () => {
	const myFlickerState: SessionScopedState = {
		...currentState,
		harness: "myflicker-acp",
	};
	const snapshots: SessionUpdateEnvelope[] = ["PONG", "PONG", "PONG"].map(
		(text, index) => ({
			seq: index + 1,
			sessionId: "session-1",
			ts: index + 1,
			frame: {
				kind: "update",
				update: {
					sessionUpdate: "agent_message_chunk",
					content: { type: "text", text },
				},
			},
		}),
	);

	const refolded = overlayAuthoritativeState(
		foldEnvelopes(
			overlayAuthoritativeState(emptyTimeline(), myFlickerState),
			snapshots,
		),
		myFlickerState,
	);
	const item = refolded.items[0];
	if (item?.kind !== "message") throw new Error("expected message");
	expect(item.blocks).toEqual([{ type: "text", text: "PONG" }]);
});

test("fetchCompleteMessageHistory loads every page in chronological order", async () => {
	const envelopes = [1, 2, 3].map(
		(seq): SessionUpdateEnvelope => ({
			seq,
			sessionId: "session-1",
			ts: seq,
			frame: { kind: "state", state: { ...currentState, lastSeq: seq } },
		}),
	);
	const calls: Array<{ cursor?: string; limit?: number }> = [];
	const api = {
		getMessages: async (input: {
			sessionId: string;
			cursor?: string;
			limit?: number;
		}) => {
			calls.push(input);
			if (input.cursor === undefined) {
				return { items: [envelopes[2]], nextCursor: "s3" };
			}
			return { items: envelopes.slice(0, 2), nextCursor: null };
		},
	};

	const result = await fetchCompleteMessageHistory(api, "session-1", 100);

	expect(result.map(({ seq }) => seq)).toEqual([1, 2, 3]);
	expect(calls).toEqual([
		{ sessionId: "session-1", cursor: undefined, limit: 100 },
		{ sessionId: "session-1", cursor: "s3", limit: 100 },
	]);
});

test("keeps retrying a launching session after the normal retry window", () => {
	// The ordinary 250 + 500 + 1000ms retry budget has elapsed, but an ACP
	// adapter cold start is still allowed to take up to the launch window.
	expect(
		shouldRetryInitialLaunchNotFound({
			initiallyLaunching: true,
			cause: new Error("Session not found"),
			elapsedMs: 10_000,
		}),
	).toBe(true);
	expect(
		shouldRetryInitialLaunchNotFound({
			initiallyLaunching: true,
			cause: new Error("Unknown ACP session: pending-session"),
			elapsedMs: 10_000,
		}),
	).toBe(true);
	expect(
		shouldRetryInitialLaunchNotFound({
			initiallyLaunching: false,
			cause: new Error("Session not found"),
			elapsedMs: 10_000,
		}),
	).toBe(false);
});

test("resyncs once on hidden to visible and removes the listener", () => {
	let visibilityState: "hidden" | "visible" = "hidden";
	const listeners = new Set<() => void>();
	const documentLike = {
		get visibilityState() {
			return visibilityState;
		},
		addEventListener: (_type: string, listener: () => void) => {
			listeners.add(listener);
		},
		removeEventListener: (_type: string, listener: () => void) => {
			listeners.delete(listener);
		},
	};
	let resumes = 0;
	const remove = observeSessionVisibility(documentLike, () => {
		resumes += 1;
	});

	for (const listener of listeners) listener();
	expect(resumes).toBe(0);
	visibilityState = "visible";
	for (const listener of listeners) listener();
	expect(resumes).toBe(1);
	for (const listener of listeners) listener();
	expect(resumes).toBe(1);
	remove();
	expect(listeners).toHaveLength(0);
	visibilityState = "hidden";
	visibilityState = "visible";
	for (const listener of listeners) listener();
	expect(resumes).toBe(1);
});

test("is SSR-safe when no document is available", () => {
	const remove = observeSessionVisibility(undefined, () => {
		throw new Error("must not resume without a document");
	});
	expect(() => remove()).not.toThrow();
});

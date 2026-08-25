import { describe, expect, test } from "bun:test";
import type {
	RemoteCommandFrame,
	SessionUpdateEnvelope,
	SessionUpdateFrame,
} from "@superset/session-protocol";
import {
	orderReplayedRemoteQueue,
	replayRemoteCommands,
	SessionJournal,
} from "./journal";

function stateFrame(): SessionUpdateFrame {
	return {
		kind: "state",
		state: {
			sessionId: "s",
			epoch: "legacy",
			workspaceId: "w",
			harness: "claude-agent-acp",
			status: "idle",
			title: null,
			currentMode: null,
			configOptions: [],
			availableCommands: null,
			pendingPermissions: [],
			queuedPrompts: [],
			cwd: "/tmp",
			lastSeq: 0,
			lastStopReason: null,
			lastError: null,
			createdAt: 0,
			updatedAt: 0,
		},
	};
}

function updateFrame(text: string): SessionUpdateFrame {
	return {
		kind: "update",
		update: {
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text },
		},
	};
}

function commandFrame(
	seq: number,
	commandId: string,
	status: RemoteCommandFrame["status"],
	operation: RemoteCommandFrame["operation"] = "enqueuePrompt",
	text = commandId,
): SessionUpdateEnvelope {
	return {
		sessionId: "s",
		epoch: "legacy",
		seq,
		ts: seq,
		frame: {
			kind: "remote_command",
			commandId,
			operation,
			status,
			prompt: [{ type: "text", text }],
			queueId: commandId,
			enqueuedAt: seq,
		},
	};
}

function commandUserUpdate(
	seq: number,
	commandId: string,
	text = commandId,
): SessionUpdateEnvelope {
	return {
		sessionId: "s",
		epoch: "legacy",
		seq,
		ts: seq,
		frame: {
			kind: "update",
			commandId,
			update: {
				sessionUpdate: "user_message_chunk",
				content: { type: "text", text },
			},
		},
	};
}

describe("SessionJournal", () => {
	test("assigns gapless seqs from 1 and tracks latest/oldest", () => {
		const journal = new SessionJournal(10);
		expect(journal.latestSeq).toBe(0);
		expect(journal.oldestSeq).toBe(0);
		const first = journal.append("s", updateFrame("a"));
		const second = journal.append("s", updateFrame("b"));
		expect(first.seq).toBe(1);
		expect(second.seq).toBe(2);
		expect(first.sessionId).toBe("s");
		expect(journal.latestSeq).toBe(2);
		expect(journal.oldestSeq).toBe(1);
	});

	test("after() replays exactly (since, latest]", () => {
		const journal = new SessionJournal(10);
		for (let i = 0; i < 5; i += 1) journal.append("s", updateFrame(`${i}`));
		expect(journal.after(0)?.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
		expect(journal.after(3)?.map((e) => e.seq)).toEqual([4, 5]);
		expect(journal.after(5)).toEqual([]);
	});

	test("after() reports a cursor ahead of the journal as unservable", () => {
		const journal = new SessionJournal(10);
		expect(journal.after(0)).toEqual([]);
		expect(journal.after(99)).toBeNull();
		journal.append("s", updateFrame("a"));
		expect(journal.after(1)).toEqual([]);
		expect(journal.after(2)).toBeNull();
	});

	test("restores a durable epoch-scoped tail and continues its sequence", () => {
		const first = new SessionJournal({ epoch: "epoch-a", capacity: 10 });
		first.append("s", updateFrame("one"));
		first.append("s", updateFrame("two"));
		const restored = new SessionJournal({
			epoch: "epoch-a",
			capacity: 10,
			entries: first.after(0) ?? [],
		});
		expect(restored.latestSeq).toBe(2);
		expect(restored.append("s", updateFrame("three"))).toMatchObject({
			epoch: "epoch-a",
			seq: 3,
		});
	});

	test("rejects a durable gap or duplicate instead of reusing a sequence", () => {
		const seed = new SessionJournal({ epoch: "epoch-a", capacity: 10 });
		const one = seed.append("s", updateFrame("one"));
		const two = seed.append("s", updateFrame("two"));
		expect(
			() =>
				new SessionJournal({
					epoch: "epoch-a",
					entries: [one, { ...two, seq: 3 }],
				}),
		).toThrow("expected 2");
		expect(
			() => new SessionJournal({ epoch: "epoch-a", entries: [one, two, two] }),
		).toThrow("expected 3");
	});

	test("evicts beyond capacity and reports unservable cursors as null", () => {
		const journal = new SessionJournal(3);
		for (let i = 0; i < 5; i += 1) journal.append("s", updateFrame(`${i}`));
		// seqs 1..5 appended, ring keeps [3, 4, 5]
		expect(journal.oldestSeq).toBe(3);
		expect(journal.latestSeq).toBe(5);
		expect(journal.after(2)?.map((e) => e.seq)).toEqual([3, 4, 5]);
		expect(journal.after(1)).toBeNull();
		expect(journal.after(0)).toBeNull();
	});

	test("preserves logical order after repeatedly wrapping the ring", () => {
		const journal = new SessionJournal(3);
		for (let i = 1; i <= 100; i += 1) {
			journal.append("s", updateFrame(`${i}`));
		}
		expect(journal.oldestSeq).toBe(98);
		expect(journal.after(97)?.map((entry) => entry.seq)).toEqual([98, 99, 100]);
		expect(
			journal
				.page({
					limit: 3,
					matches: (envelope) => envelope.frame.kind === "update",
				})
				.items.map((entry) => entry.seq),
		).toEqual([98, 99, 100]);
	});

	test("page() walks backwards, filters, and returns ascending items", () => {
		const journal = new SessionJournal(20);
		// alternate update and state frames: updates get seqs 1,3,5,7,9
		for (let i = 0; i < 5; i += 1) {
			journal.append("s", updateFrame(`${i}`));
			journal.append("s", stateFrame());
		}
		const isUpdate = (envelope: { frame: SessionUpdateFrame }) =>
			envelope.frame.kind === "update";

		const newest = journal.page({ limit: 2, matches: isUpdate });
		expect(newest.items.map((e) => e.seq)).toEqual([7, 9]);
		expect(newest.nextBeforeSeq).toBe(7);

		const older = journal.page({
			beforeSeq: newest.nextBeforeSeq ?? undefined,
			limit: 2,
			matches: isUpdate,
		});
		expect(older.items.map((e) => e.seq)).toEqual([3, 5]);
		expect(older.nextBeforeSeq).toBe(3);

		const oldest = journal.page({
			beforeSeq: older.nextBeforeSeq ?? undefined,
			limit: 2,
			matches: isUpdate,
		});
		expect(oldest.items.map((e) => e.seq)).toEqual([1]);
		expect(oldest.nextBeforeSeq).toBeNull();
	});

	test("page() reports exhaustion when no older matching frame remains", () => {
		const journal = new SessionJournal(20);
		journal.append("s", stateFrame()); // seq 1 — never matches
		journal.append("s", updateFrame("only")); // seq 2
		const page = journal.page({
			limit: 1,
			matches: (envelope) => envelope.frame.kind === "update",
		});
		expect(page.items.map((e) => e.seq)).toEqual([2]);
		// A state frame remains below, but no *matching* frame → exhausted.
		expect(page.nextBeforeSeq).toBeNull();
	});

	test("page() bounds serialized bytes while preserving cursors and one large item", () => {
		const journal = new SessionJournal(10);
		for (let index = 1; index <= 5; index += 1) {
			journal.append("s", updateFrame("x".repeat(4 * 1024 * 1024)));
		}
		const measure = (envelope: unknown) =>
			Buffer.byteLength(JSON.stringify(envelope));
		const newest = journal.page({
			limit: 200,
			matches: (envelope) => envelope.frame.kind === "update",
			maxBytes: 8 * 1024 * 1024,
			measure,
		});
		expect(newest.items.map((entry) => entry.seq)).toEqual([5]);
		expect(measure(newest.items)).toBeLessThan(8.5 * 1024 * 1024);
		expect(newest.nextBeforeSeq).toBe(5);

		const allSeqs: number[] = [];
		let beforeSeq: number | undefined;
		for (;;) {
			const page = journal.page({
				beforeSeq,
				limit: 200,
				matches: (envelope) => envelope.frame.kind === "update",
				maxBytes: 8 * 1024 * 1024,
				measure,
			});
			allSeqs.unshift(...page.items.map((entry) => entry.seq));
			if (page.nextBeforeSeq === null) break;
			beforeSeq = page.nextBeforeSeq;
		}
		expect(allSeqs).toEqual([1, 2, 3, 4, 5]);

		const singleOversized = journal.page({
			limit: 200,
			matches: (envelope) => envelope.frame.kind === "update",
			maxBytes: 1,
			measure,
		});
		expect(singleOversized.items.map((entry) => entry.seq)).toEqual([5]);
	});

	test("replays queued commands in FIFO order", () => {
		const replayed = replayRemoteCommands([
			commandFrame(1, "first", "queued", "enqueuePrompt", "alpha"),
			commandFrame(2, "second", "queued", "enqueuePrompt", "beta"),
		]);
		expect(replayed.queued.map((command) => command.commandId)).toEqual([
			"first",
			"second",
		]);
		expect(replayed.queued.map((command) => command.prompt)).toEqual([
			[{ type: "text", text: "alpha" }],
			[{ type: "text", text: "beta" }],
		]);
	});

	test("does not restore finished or removed commands", () => {
		const replayed = replayRemoteCommands([
			commandFrame(1, "finished", "queued"),
			commandFrame(2, "finished", "finished"),
			commandFrame(3, "removed", "queued"),
			commandFrame(4, "removed", "finished"),
		]);
		expect(replayed).toEqual({ queued: [], sendNow: [] });
	});

	test("restores started command only when its user update is missing", () => {
		const replayed = replayRemoteCommands([
			commandFrame(1, "missing-user", "queued"),
			commandFrame(2, "missing-user", "started"),
			commandFrame(3, "admitted", "queued"),
			commandFrame(4, "admitted", "started"),
			commandUserUpdate(5, "admitted"),
		]);
		expect(replayed.queued.map((command) => command.commandId)).toEqual([
			"missing-user",
		]);
	});

	test("keeps direct and sendNow prompts ahead of the ordered queue", () => {
		const replayed = replayRemoteCommands([
			commandFrame(1, "tail", "queued", "enqueuePrompt"),
			commandFrame(2, "direct", "queued", "prompt"),
			commandFrame(3, "cut-in", "queued", "sendNow"),
		]);
		expect(replayed.sendNow.map((command) => command.commandId)).toEqual([
			"direct",
			"cut-in",
		]);
		expect(replayed.queued.map((command) => command.commandId)).toEqual([
			"tail",
		]);
	});

	test("applies queue edits from the latest state snapshot", () => {
		const state: SessionUpdateFrame = {
			kind: "state",
			state: {
				sessionId: "s",
				epoch: "legacy",
				workspaceId: "w",
				harness: "claude-agent-acp",
				status: "running",
				title: null,
				currentMode: null,
				configOptions: [],
				availableCommands: null,
				pendingPermissions: [],
				queuedPrompts: [
					{
						queueId: "second",
						prompt: [{ type: "text", text: "edited beta" }],
						enqueuedAt: 20,
					},
				],
				cwd: "/tmp",
				lastSeq: 0,
				lastStopReason: null,
				lastError: null,
				createdAt: 0,
				updatedAt: 0,
			},
		};
		const entries = [
			commandFrame(1, "first", "queued", "enqueuePrompt", "alpha"),
			commandFrame(2, "second", "queued", "enqueuePrompt", "beta"),
			{
				...commandFrame(3, "second", "queued", "enqueuePrompt", "beta"),
				frame: state,
			},
		];
		const replayed = replayRemoteCommands(entries);
		const ordered = orderReplayedRemoteQueue(replayed.queued, entries);
		expect(ordered.map((command) => command.commandId)).toEqual([
			"second",
			"first",
		]);
		expect(ordered[0]?.prompt).toEqual([{ type: "text", text: "edited beta" }]);
	});
});

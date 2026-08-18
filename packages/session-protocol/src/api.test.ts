import { describe, expect, test } from "bun:test";
import {
	closeSessionInput,
	createSessionInput,
	decodeMessagesCursor,
	decodeTranscriptCursor,
	encodeMessagesCursor,
	encodeTranscriptCursor,
	getMessagesInput,
	getTranscriptInput,
	listSessionsInput,
	promptInput,
	respondToPermissionInput,
} from "./api";

describe("messages cursor", () => {
	test("round-trips positive seqs", () => {
		for (const seq of [1, 42, 5000, 987654321]) {
			expect(decodeMessagesCursor(encodeMessagesCursor(seq))).toBe(seq);
		}
	});

	test("encode rejects non-positive and non-integer seqs", () => {
		expect(() => encodeMessagesCursor(0)).toThrow();
		expect(() => encodeMessagesCursor(-3)).toThrow();
		expect(() => encodeMessagesCursor(1.5)).toThrow();
	});

	test("decode returns null on malformed cursors", () => {
		for (const bad of ["", "s0", "s-1", "s1.5", "42", "sabc", "s01"]) {
			expect(decodeMessagesCursor(bad)).toBeNull();
		}
	});
});

describe("transcript cursor", () => {
	test("round-trips positive turn numbers", () => {
		for (const turn of [1, 42, 5000]) {
			expect(decodeTranscriptCursor(encodeTranscriptCursor(turn))).toBe(turn);
		}
	});

	test("rejects raw event cursors", () => {
		expect(decodeTranscriptCursor("s42")).toBeNull();
		expect(() => encodeTranscriptCursor(0)).toThrow();
	});
});

describe("router input schemas", () => {
	test("createSessionInput keeps Claude as the omission-compatible default and admits every harness", () => {
		expect(
			createSessionInput.parse({ sessionId: "s1", workspaceId: "w1" }).harness,
		).toBeUndefined();
		for (const harness of [
			"claude-agent-acp",
			"codex-app-server",
			"pi-acp",
			"myflicker-acp",
		] as const) {
			expect(
				createSessionInput.parse({
					sessionId: "s1",
					workspaceId: "w1",
					harness,
				}).harness,
			).toBe(harness);
		}
	});

	test("promptInput requires at least one structurally valid content block", () => {
		expect(
			promptInput.safeParse({
				sessionId: "s1",
				prompt: [{ type: "text", text: "hi" }],
			}).success,
		).toBe(true);
		expect(promptInput.safeParse({ sessionId: "s1", prompt: [] }).success).toBe(
			false,
		);
		expect(
			promptInput.safeParse({ sessionId: "s1", prompt: [{ text: "no type" }] })
				.success,
		).toBe(false);
	});

	test("closeSessionInput requires a non-empty session id", () => {
		expect(closeSessionInput.safeParse({ sessionId: "s1" }).success).toBe(true);
		expect(closeSessionInput.safeParse({ sessionId: "" }).success).toBe(false);
	});

	test("respondToPermissionInput accepts both outcome shapes and rejects junk", () => {
		const base = { sessionId: "s1", requestId: "r1" };
		expect(
			respondToPermissionInput.safeParse({
				...base,
				outcome: { outcome: "cancelled" },
			}).success,
		).toBe(true);
		expect(
			respondToPermissionInput.safeParse({
				...base,
				outcome: { outcome: "selected", optionId: "allow" },
			}).success,
		).toBe(true);
		expect(
			respondToPermissionInput.safeParse({
				...base,
				outcome: { outcome: "selected" },
			}).success,
		).toBe(false);
	});

	test("getMessagesInput defaults limit and bounds it", () => {
		const parsed = getMessagesInput.parse({ sessionId: "s1" });
		expect(parsed.limit).toBe(50);
		expect(
			getMessagesInput.safeParse({ sessionId: "s1", limit: 500 }).success,
		).toBe(false);
	});

	test("getTranscriptInput accepts a turn target and defaults its page size", () => {
		const parsed = getTranscriptInput.parse({ sessionId: "s1" });
		expect(parsed.limit).toBe(8);
		expect(
			getTranscriptInput.safeParse({
				sessionId: "s1",
				targetTurn: 3,
				limit: 2,
			}).success,
		).toBe(true);
	});

	test("listSessionsInput rejects malformed and unsafe numeric cursors", () => {
		expect(
			listSessionsInput.safeParse({ cursor: "1700000000000:session-1" })
				.success,
		).toBe(true);
		for (const cursor of [
			"not-a-cursor",
			"1700000000000:",
			"999999999999999999999999:session-1",
		]) {
			expect(listSessionsInput.safeParse({ cursor }).success).toBe(false);
		}
	});
});

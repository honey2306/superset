import { describe, expect, test } from "bun:test";
import { canonicalizeToolCall } from "./canonical-tool-call";

describe("canonicalizeToolCall", () => {
	test("projects Pi reads to the same required UI shape", () => {
		expect(
			canonicalizeToolCall({
				toolCallId: "read-1",
				title: "read",
				kind: "read",
				locations: [{ path: "/repo/src/index.ts" }],
				rawInput: { path: "/repo/src/index.ts", limit: 80 },
			}),
		).toMatchObject({
			kind: "read",
			status: "pending",
			title: "/repo/src/index.ts",
			locations: [{ path: "/repo/src/index.ts" }],
		});
	});

	test("projects generic execute calls to their command", () => {
		expect(
			canonicalizeToolCall({
				toolCallId: "execute-1",
				title: "Bash",
				kind: "execute",
				status: "completed",
				rawInput: { command: "bun run test" },
			}),
		).toMatchObject({
			kind: "execute",
			status: "completed",
			title: "bun run test",
			locations: [],
		});
	});

	test("preserves meaningful adapter titles", () => {
		expect(
			canonicalizeToolCall({
				toolCallId: "search-1",
				title: "Find ACP consumers",
				kind: "search",
				rawInput: { query: "ToolCallItem" },
			}),
		).toMatchObject({ title: "Find ACP consumers", kind: "search" });
	});

	test("gives unknown tools stable defaults without discarding raw data", () => {
		const rawInput = { providerSpecificOption: true };
		expect(
			canonicalizeToolCall({
				toolCallId: "custom-1",
				title: "",
				rawInput,
			}),
		).toEqual({
			toolCallId: "custom-1",
			title: "Tool",
			kind: "other",
			status: "pending",
			locations: [],
			rawInput,
		});
	});
});

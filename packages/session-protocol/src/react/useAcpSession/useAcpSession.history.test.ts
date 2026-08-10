import { expect, test } from "bun:test";
import type { SessionUpdateEnvelope } from "../../envelope";
import { emptyTimeline, foldEnvelopes } from "../../fold";
import { fetchCompleteMessageHistory } from "./useAcpSession";

function turnHistory(turnCount: number): SessionUpdateEnvelope[] {
	return Array.from({ length: turnCount * 2 }, (_, index) => {
		const turn = Math.floor(index / 2) + 1;
		const isUser = index % 2 === 0;
		return {
			seq: index + 1,
			epoch: "history-epoch",
			sessionId: "long-session",
			ts: index + 1,
			frame: {
				kind: "update",
				update: {
					sessionUpdate: isUser ? "user_message_chunk" : "agent_message_chunk",
					content: {
						type: "text",
						text: `${isUser ? "user" : "agent"} turn ${turn}`,
					},
				},
			},
		};
	});
}

test("refolds 30+ turns from every history page without loss or reordering", async () => {
	const history = turnHistory(32);
	const pageSize = 8;
	const pages = Array.from(
		{ length: Math.ceil(history.length / pageSize) },
		(_, index) => history.slice(index * pageSize, (index + 1) * pageSize),
	);
	const api = {
		getMessages: async (input: { cursor?: string }) => {
			const pageIndex =
				input.cursor === undefined ? pages.length - 1 : Number(input.cursor);
			const page = pages[pageIndex];
			if (!page) throw new Error(`unexpected cursor: ${input.cursor}`);
			return {
				items: page,
				nextCursor: pageIndex === 0 ? null : String(pageIndex - 1),
			};
		},
	};

	const startedAt = performance.now();
	const fetched = await fetchCompleteMessageHistory(
		api,
		"long-session",
		pageSize,
	);
	const timeline = foldEnvelopes(emptyTimeline(), fetched);
	const elapsedMs = performance.now() - startedAt;

	expect(fetched.map(({ seq }) => seq)).toEqual(history.map(({ seq }) => seq));
	expect(timeline.items).toHaveLength(64);
	expect(timeline.items.map((item) => item.id)).toEqual(
		Array.from({ length: 32 }, (_, index) => [
			`user:${index * 2 + 1}`,
			`agent:${index * 2 + 2}`,
		]).flat(),
	);
	expect(elapsedMs).toBeLessThan(100);
});

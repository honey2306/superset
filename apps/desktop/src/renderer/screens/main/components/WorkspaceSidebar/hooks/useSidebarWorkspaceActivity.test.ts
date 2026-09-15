import { describe, expect, it } from "bun:test";
import { latestActivityAt } from "./useSidebarWorkspaceActivity";

describe("latestActivityAt", () => {
	it("uses the latest ACP message instead of the completed turn time", () => {
		expect(
			latestActivityAt([], {
				items: [{ lastMessageAt: 900, lastCompletedAt: 100 }],
			}),
		).toBe(900);
	});

	it("falls back to the completed turn time for older hosts", () => {
		expect(
			latestActivityAt([], {
				items: [{ lastCompletedAt: 500 }],
			}),
		).toBe(500);
	});

	it("returns the latest activity across terminal and ACP sessions", () => {
		expect(
			latestActivityAt([{ lastEventAt: 700 }, { lastEventAt: 300 }], {
				items: [
					{ lastMessageAt: 600, lastCompletedAt: 500 },
					{ lastMessageAt: 800, lastCompletedAt: 750 },
				],
			}),
		).toBe(800);
	});
});

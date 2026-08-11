import { describe, expect, test } from "bun:test";
import { applyChatPermissionMode } from "./chat";

describe("applyChatPermissionMode", () => {
	test("enables MastraCode's typed autonomous mode for full-access dispatch", async () => {
		const states: unknown[] = [];
		await applyChatPermissionMode(
			{ setState: async (state) => void states.push(state) },
			true,
		);
		expect(states).toEqual([{ yolo: true }]);
	});

	test("leaves ordinary chat sessions at their configured permission defaults", async () => {
		let wasCalled = false;
		await applyChatPermissionMode(
			{
				setState: async () => {
					wasCalled = true;
				},
			},
			undefined,
		);
		expect(wasCalled).toBeFalse();
	});
});

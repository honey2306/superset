import { describe, expect, it } from "bun:test";
import { getTodoContentState } from "./todoContentState";

describe("getTodoContentState", () => {
	it("keeps the empty state hidden while the collection has no cached rows and is not ready", () => {
		expect(getTodoContentState(0, false)).toBe("loading");
	});

	it("shows the empty state only after an empty collection is ready", () => {
		expect(getTodoContentState(0, true)).toBe("empty");
	});

	it("renders cached rows before the collection reports ready", () => {
		expect(getTodoContentState(1, false)).toBe("todos");
	});
});

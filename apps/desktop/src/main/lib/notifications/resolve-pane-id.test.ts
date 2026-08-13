import { describe, expect, it } from "bun:test";
import { resolvePaneId } from "./resolve-pane-id";

describe("resolvePaneId", () => {
	it("preserves an explicit legacy pane id", () => {
		expect(resolvePaneId("pane-1", "tab-1", "ws-1")).toBe("pane-1");
	});

	it("does not infer pane ids from retired tabs state identifiers", () => {
		expect(resolvePaneId(undefined, "tab-1", "ws-1")).toBeUndefined();
	});
});

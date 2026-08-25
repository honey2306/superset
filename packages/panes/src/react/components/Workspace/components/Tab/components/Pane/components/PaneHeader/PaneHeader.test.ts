import { describe, expect, it } from "bun:test";
import { getPaneHeaderClassName } from "./PaneHeader";

describe("getPaneHeaderClassName", () => {
	it("keeps the default header at the compact height", () => {
		expect(getPaneHeaderClassName(false, true, false)).toContain("h-7");
	});

	it("lets a custom toolbar determine the header height", () => {
		expect(getPaneHeaderClassName(true, true, false)).not.toContain("h-7");
	});
});

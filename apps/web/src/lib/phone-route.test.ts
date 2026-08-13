import { expect, test } from "bun:test";
import { getPhoneRoute } from "./phone-route";

test("keeps AutoMate links and navigations under the resume prefix", () => {
	const hash = "#/r/opaque-payload";
	expect(getPhoneRoute("/", hash)).toBe("/r/opaque-payload");
	expect(getPhoneRoute("/w/workspace/s/session", hash)).toBe(
		"/r/opaque-payload/w/workspace/s/session",
	);
	expect(getPhoneRoute("/w/workspace", "#/pair")).toBe("/w/workspace");
});

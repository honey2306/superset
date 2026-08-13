import { expect, test } from "bun:test";
import { workspaceTabManagementPath } from "./workspaceTabManagementPath";

test("keeps New tab navigation scoped to the selected workspace", () => {
	expect(workspaceTabManagementPath("workspace/with spaces")).toBe(
		"/w/workspace%2Fwith%20spaces",
	);
});

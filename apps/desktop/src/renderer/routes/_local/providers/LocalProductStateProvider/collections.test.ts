import { expect, test } from "bun:test";
import { LOCAL_PRODUCT_STATE_COLLECTION_NAMES } from "./collections";

test("local product state exposes no cloud-backed collections", () => {
	expect([...LOCAL_PRODUCT_STATE_COLLECTION_NAMES].sort()).toEqual([
		"sidebarProjectGroups",
		"sidebarProjects",
		"sidebarSections",
		"terminalPresets",
		"userPreferences",
		"workspaceLocalState",
	]);
});

import { afterEach, describe, expect, test } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import {
	clearQueuedPaneIntentsForTests,
	getQueuedPaneIntentCountForTests,
	navigatePanes,
} from "./navigation";
import { registerPanesStore } from "./repository";
import type { PanesPaneData } from "./types";

const cleanups: Array<() => void> = [];

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
	clearQueuedPaneIntentsForTests();
});

describe("pane navigation intents", () => {
	test("queues before mount, deduplicates, and drains on registration", () => {
		let applications = 0;
		const first = navigatePanes({
			workspaceId: "workspace-a",
			dedupeKey: "open:file-a",
			apply: () => ++applications,
		});
		const duplicate = navigatePanes({
			workspaceId: "workspace-a",
			dedupeKey: "open:file-a",
			apply: () => ++applications,
		});
		expect(first.status).toBe("queued");
		expect(duplicate).toMatchObject({ status: "queued", deduplicated: true });
		expect(getQueuedPaneIntentCountForTests()).toBe(1);

		const store = createWorkspaceStore<PanesPaneData>();
		cleanups.push(registerPanesStore("workspace-a", store));
		expect(applications).toBe(1);
		expect(getQueuedPaneIntentCountForTests()).toBe(0);
	});

	test("keeps A and B workspace intents isolated across switches", () => {
		const applied: string[] = [];
		navigatePanes({
			workspaceId: "workspace-a",
			dedupeKey: "a",
			apply: () => applied.push("a"),
		});
		navigatePanes({
			workspaceId: "workspace-b",
			dedupeKey: "b",
			apply: () => applied.push("b"),
		});
		cleanups.push(
			registerPanesStore("workspace-b", createWorkspaceStore<PanesPaneData>()),
		);
		expect(applied).toEqual(["b"]);
		cleanups.push(
			registerPanesStore("workspace-a", createWorkspaceStore<PanesPaneData>()),
		);
		expect(applied).toEqual(["b", "a"]);
	});

	test("drops expired intents", () => {
		navigatePanes({
			workspaceId: "workspace-a",
			dedupeKey: "expired",
			ttlMs: -1,
			apply: () => {
				throw new Error("expired intent must not run");
			},
		});
		expect(getQueuedPaneIntentCountForTests()).toBe(0);
	});
});

import { beforeEach, describe, expect, it } from "bun:test";
import type { WorkspaceState } from "@superset/panes";
import { act } from "@testing-library/react/pure";
import type { PanesPaneData } from "renderer/lib/panes";
import {
	hydratePanesRepository,
	resetPanesRepositoryForTests,
} from "renderer/lib/panes";
import { ensureHappyDom } from "test-utils/happy-dom-env";

let renderHook: typeof import("@testing-library/react/pure").renderHook;
let usePanesWorkspacePaneLayout: typeof import("./usePanesWorkspacePaneLayout").usePanesWorkspacePaneLayout;

const workspaceId = "11111111-1111-1111-1111-111111111111";
const emptyLayout: WorkspaceState<PanesPaneData> = {
	version: 1,
	tabs: [],
	activeTabId: null,
};

beforeEach(async () => {
	resetPanesRepositoryForTests();
	await ensureHappyDom();
	({ renderHook } = await import("@testing-library/react/pure"));
	({ usePanesWorkspacePaneLayout } = await import(
		"./usePanesWorkspacePaneLayout"
	));
});

describe("usePanesWorkspacePaneLayout", () => {
	it("waits for a newly created workspace store to hydrate instead of throwing", () => {
		const { result } = renderHook(() =>
			usePanesWorkspacePaneLayout(workspaceId),
		);

		expect(result.current).toEqual({ store: null, isLayoutReady: false });

		act(() => {
			hydratePanesRepository([{ workspaceId, paneLayout: emptyLayout }]);
		});

		expect(result.current.store).not.toBeNull();
		expect(result.current.isLayoutReady).toBe(true);
	});
});

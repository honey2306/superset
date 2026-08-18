import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import type {
	PaneRegistry,
	RendererContext,
	WorkspaceStore,
} from "@superset/panes";
import { createDragDropManager } from "dnd-core";
import { useEffect } from "react";
import type { DndProvider as DndProviderComponent } from "react-dnd";
import { TestBackend } from "react-dnd-test-backend";
import { ensureHappyDom } from "test-utils/happy-dom-env";
import type { StoreApi } from "zustand/vanilla";

interface TestPaneData {
	label: string;
}

let Workspace: typeof import("@superset/panes").Workspace;
let createWorkspaceStore: typeof import("@superset/panes").createWorkspaceStore;
let DndProvider: typeof DndProviderComponent;
let act: typeof import("@testing-library/react/pure").act;
let cleanup: typeof import("@testing-library/react/pure").cleanup;
let render: typeof import("@testing-library/react/pure").render;

beforeAll(async () => {
	await ensureHappyDom();
	({ act, cleanup, render } = await import("@testing-library/react/pure"));
	({ DndProvider } = await import("react-dnd"));
	({ Workspace, createWorkspaceStore } = await import("@superset/panes"));
});

afterEach(() => cleanup());

function createTwoTabStore(): StoreApi<WorkspaceStore<TestPaneData>> {
	const store = createWorkspaceStore<TestPaneData>();
	store.getState().addTab({
		id: "tab-a",
		panes: [{ id: "pane-a", kind: "test", data: { label: "A" } }],
	});
	store.getState().addTab({
		id: "tab-b",
		panes: [{ id: "pane-b", kind: "test", data: { label: "B" } }],
	});
	store.getState().setActiveTab("tab-a");
	return store;
}

describe("Workspace tab keep-alive", () => {
	test("lazily mounts tabs once and keeps inactive tab content mounted", () => {
		const mounts = new Map<string, number>();
		const unmounts = new Map<string, number>();
		const activeStates = new Map<string, boolean>();
		const visibleStates = new Map<string, boolean>();

		function Probe({ context }: { context: RendererContext<TestPaneData> }) {
			const paneId = context.pane.id;
			activeStates.set(paneId, context.isActive);
			visibleStates.set(paneId, context.isVisible);
			useEffect(() => {
				mounts.set(paneId, (mounts.get(paneId) ?? 0) + 1);
				return () => {
					unmounts.set(paneId, (unmounts.get(paneId) ?? 0) + 1);
				};
			}, [paneId]);
			return <div>{context.pane.data.label}</div>;
		}

		const registry: PaneRegistry<TestPaneData> = {
			test: {
				renderPane: (context) => <Probe context={context} />,
			},
		};
		const store = createTwoTabStore();
		const manager = createDragDropManager(TestBackend);
		const result = render(
			<DndProvider manager={manager}>
				<Workspace store={store} registry={registry} />
			</DndProvider>,
		);

		expect(mounts.get("pane-a")).toBe(1);
		expect(mounts.has("pane-b")).toBe(false);

		act(() => store.getState().setActiveTab("tab-b"));
		expect(mounts.get("pane-b")).toBe(1);
		expect(unmounts.has("pane-a")).toBe(false);
		expect(activeStates.get("pane-a")).toBe(false);
		expect(activeStates.get("pane-b")).toBe(true);
		expect(visibleStates.get("pane-a")).toBe(false);
		expect(visibleStates.get("pane-b")).toBe(true);

		act(() => store.getState().setActiveTab("tab-a"));
		expect(mounts.get("pane-a")).toBe(1);
		expect(mounts.get("pane-b")).toBe(1);
		expect(unmounts.size).toBe(0);
		expect(activeStates.get("pane-a")).toBe(true);
		expect(activeStates.get("pane-b")).toBe(false);
		expect(visibleStates.get("pane-a")).toBe(true);
		expect(visibleStates.get("pane-b")).toBe(false);

		const firstTab = result.container.querySelector(
			'[data-pane-tab-content="tab-a"]',
		);
		const secondTab = result.container.querySelector(
			'[data-pane-tab-content="tab-b"]',
		);
		expect(firstTab?.getAttribute("aria-hidden")).toBe("false");
		expect(secondTab?.getAttribute("aria-hidden")).toBe("true");
		expect(secondTab?.classList.contains("hidden")).toBe(true);

		act(() => {
			result.rerender(
				<DndProvider manager={manager}>
					<Workspace store={store} registry={registry} isActive={false} />
				</DndProvider>,
			);
		});
		expect(mounts.get("pane-a")).toBe(1);
		expect(mounts.get("pane-b")).toBe(1);
		expect(unmounts.size).toBe(0);
		expect(activeStates.get("pane-a")).toBe(false);
		expect(activeStates.get("pane-b")).toBe(false);
		expect(visibleStates.get("pane-a")).toBe(false);
		expect(visibleStates.get("pane-b")).toBe(false);
	});
});

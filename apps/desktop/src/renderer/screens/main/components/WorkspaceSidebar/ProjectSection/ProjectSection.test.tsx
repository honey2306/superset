import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { createDragDropManager } from "dnd-core";
import { createElement } from "react";
import type { TestBackendImpl } from "react-dnd-test-backend";
import { TestBackend } from "react-dnd-test-backend";
import { ensureHappyDom } from "test-utils/happy-dom-env";

const reorderProjectsByIndex = mock(
	(_fromIndex: number, _toIndex: number) => {},
);

mock.module("renderer/routes/_local/hooks/useDashboardSidebarState", () => ({
	useDashboardSidebarState: () => ({ reorderProjectsByIndex }),
}));
mock.module("renderer/stores", () => ({
	useWorkspaceSidebarStore: () => ({
		isProjectCollapsed: () => false,
		toggleProjectCollapsed: () => {},
	}),
}));
mock.module("renderer/stores/new-workspace-modal", () => ({
	useOpenNewWorkspaceModal: () => () => {},
}));
mock.module(import.meta.resolve("../hooks"), () => ({
	useSectionDropZone: () => ({
		handlers: {},
		isDropTarget: false,
		isDragOver: false,
	}),
}));
mock.module(import.meta.resolve("../WorkspaceListItem"), () => ({
	WorkspaceListItem: () => null,
}));
mock.module(import.meta.resolve("../WorkspaceSection"), () => ({
	WorkspaceSection: () => null,
}));
mock.module(import.meta.resolve("./ProjectHeader"), () => ({
	ProjectHeader: ({ projectName }: { projectName: string }) => (
		<div>{projectName}</div>
	),
}));

let DndProvider: typeof import("react-dnd").DndProvider;
let ProjectSection: typeof import("./ProjectSection").ProjectSection;
let act: typeof import("@testing-library/react/pure").act;
let cleanup: typeof import("@testing-library/react/pure").cleanup;
let render: typeof import("@testing-library/react/pure").render;

beforeAll(async () => {
	await ensureHappyDom();
	({ act, cleanup, render } = await import("@testing-library/react/pure"));
	({ DndProvider } = await import("react-dnd"));
	({ ProjectSection } = await import("./ProjectSection"));
});

afterEach(() => {
	cleanup();
	reorderProjectsByIndex.mockClear();
});

describe("ProjectSection project ordering drag", () => {
	test("persists the dragged project index after a real DnD hover/drop sequence", () => {
		const manager = createDragDropManager(TestBackend);
		const renderProject = (projectId: string, index: number) =>
			createElement(ProjectSection, {
				projectId,
				projectName: projectId,
				projectColor: "#000",
				githubOwner: null,
				mainRepoPath: "/repo",
				hideImage: false,
				iconUrl: null,
				workspaces: [],
				sections: [],
				topLevelItems: [],
				shortcutBaseIndex: 0,
				index,
			});

		const result = render(
			createElement(
				DndProvider,
				{ manager },
				renderProject("project-a", 0),
				renderProject("project-b", 1),
			),
		);
		const projects = result.container.querySelectorAll<HTMLElement>(
			"[data-dnd-source-id][data-dnd-target-id]",
		);
		const sourceId = projects[0]?.dataset.dndSourceId;
		const targetId = projects[1]?.dataset.dndTargetId;
		if (!sourceId || !targetId) {
			throw new Error("Project DnD handler IDs were not exposed");
		}

		const backend = manager.getBackend() as TestBackendImpl;
		act(() => {
			backend.simulateBeginDrag([sourceId], {});
			backend.simulateHover([targetId], {});
			backend.simulateDrop();
			backend.simulateEndDrag();
		});

		expect(reorderProjectsByIndex).toHaveBeenCalledTimes(1);
		expect(reorderProjectsByIndex).toHaveBeenCalledWith(0, 1);
	});
});

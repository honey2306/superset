import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { createDragDropManager } from "dnd-core";
import { createElement } from "react";
import type { TestBackendImpl } from "react-dnd-test-backend";
import { TestBackend } from "react-dnd-test-backend";
import { ensureHappyDom } from "test-utils/happy-dom-env";

const reorderProjects = mock((_projectIds: string[]) => {});
const moveProjectToGroup = mock(
	(_projectId: string, _projectGroupId: string | null, _index?: number) => {},
);

mock.module("renderer/routes/_local/hooks/useDashboardSidebarState", () => ({
	useDashboardSidebarState: () => ({ moveProjectToGroup, reorderProjects }),
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
	reorderProjects.mockClear();
	moveProjectToGroup.mockClear();
});

describe("ProjectSection project ordering drag", () => {
	test("persists the visible project order as soon as a drag hovers its target", () => {
		const manager = createDragDropManager(TestBackend);
		const orderedProjectIds = ["project-a", "project-b"];
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
				orderedProjectIds,
				projectGroupId: null,
				availableProjectGroups: [],
			});

		const result = render(
			createElement(
				DndProvider,
				{ manager },
				renderProject("project-a", 0),
				renderProject("project-b", 1),
			),
		);
		const sources = result.container.querySelectorAll<HTMLElement>(
			"[data-dnd-source-id]",
		);
		const targets = result.container.querySelectorAll<HTMLElement>(
			"[data-dnd-target-id]",
		);
		const sourceId = sources[0]?.dataset.dndSourceId;
		const targetId = targets[1]?.dataset.dndTargetId;
		if (!sourceId || !targetId) {
			throw new Error("Project DnD handler IDs were not exposed");
		}

		const backend = manager.getBackend() as TestBackendImpl;
		act(() => {
			backend.simulateBeginDrag([sourceId], {});
			backend.simulateHover([targetId], {});
		});

		expect(reorderProjects).toHaveBeenCalledTimes(1);
		expect(reorderProjects).toHaveBeenCalledWith(["project-b", "project-a"]);

		act(() => {
			backend.simulateDrop();
			backend.simulateEndDrag();
		});
		expect(reorderProjects).toHaveBeenCalledTimes(1);
	});

	test("supports a second drag after the first drag rerenders the ordered projects", () => {
		const manager = createDragDropManager(TestBackend);
		let order = ["project-a", "project-b", "project-c"];
		const renderProjects = () =>
			order.map((projectId, index) =>
				createElement(ProjectSection, {
					key: projectId,
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
					orderedProjectIds: order,
					projectGroupId: null,
					availableProjectGroups: [],
				}),
			);
		const result = render(
			createElement(DndProvider, { manager }, ...renderProjects()),
		);
		const backend = manager.getBackend() as TestBackendImpl;
		const getHandlerIds = () => {
			const sources = Array.from(
				result.container.querySelectorAll<HTMLElement>("[data-dnd-source-id]"),
			);
			const targets = Array.from(
				result.container.querySelectorAll<HTMLElement>("[data-dnd-target-id]"),
			);
			return sources.map((node, index) => ({
				name: node.textContent,
				sourceId: node.dataset.dndSourceId,
				targetId: targets[index]?.dataset.dndTargetId,
			}));
		};
		const first = getHandlerIds();
		const firstSource = first.find((item) => item.name === "project-a");
		const firstTarget = first.find((item) => item.name === "project-b");
		const firstSourceId = firstSource?.sourceId;
		const firstTargetId = firstTarget?.targetId;
		if (!firstSourceId || !firstTargetId) {
			throw new Error("Initial project DnD handler IDs were not exposed");
		}

		act(() => {
			backend.simulateBeginDrag([firstSourceId], {});
			backend.simulateHover([firstTargetId], {});
			backend.simulateDrop();
			backend.simulateEndDrag();
		});
		expect(reorderProjects).toHaveBeenNthCalledWith(1, [
			"project-b",
			"project-a",
			"project-c",
		]);
		order = ["project-b", "project-a", "project-c"];
		act(() => {
			result.rerender(
				createElement(DndProvider, { manager }, ...renderProjects()),
			);
		});

		const second = getHandlerIds();
		const secondSource = second.find((item) => item.name === "project-a");
		const secondTarget = second.find((item) => item.name === "project-c");
		const secondSourceId = secondSource?.sourceId;
		const secondTargetId = secondTarget?.targetId;
		if (!secondSourceId || !secondTargetId) {
			throw new Error("Rerendered project DnD handler IDs were not exposed");
		}
		act(() => {
			backend.simulateBeginDrag([secondSourceId], {});
			backend.simulateHover([secondTargetId], {});
			backend.simulateDrop();
			backend.simulateEndDrag();
		});

		expect(reorderProjects).toHaveBeenCalledTimes(2);
		expect(reorderProjects).toHaveBeenNthCalledWith(2, [
			"project-b",
			"project-c",
			"project-a",
		]);
	});

	test("moves a project when dropped onto a project in another group", () => {
		const manager = createDragDropManager(TestBackend);
		const renderProject = (
			projectId: string,
			projectGroupId: string,
			index: number,
		) =>
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
				orderedProjectIds: [projectId],
				projectGroupId,
				availableProjectGroups: [],
			});
		const result = render(
			createElement(
				DndProvider,
				{ manager },
				renderProject("project-a", "group-a", 0),
				renderProject("project-b", "group-b", 0),
			),
		);
		const sources = result.container.querySelectorAll<HTMLElement>(
			"[data-dnd-source-id]",
		);
		const targets = result.container.querySelectorAll<HTMLElement>(
			"[data-dnd-target-id]",
		);
		const sourceId = sources[0]?.dataset.dndSourceId;
		const targetId = targets[1]?.dataset.dndTargetId;
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

		expect(moveProjectToGroup).toHaveBeenCalledWith("project-a", "group-b", 0);
		expect(reorderProjects).not.toHaveBeenCalled();
	});
});

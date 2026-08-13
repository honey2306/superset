import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import type { TerminalPreset } from "@superset/shared/desktop-types";
import type { RenderResult } from "@testing-library/react/pure";
import { createDragDropManager } from "dnd-core";
import type { ComponentProps, ComponentType } from "react";
import type { TestBackendImpl } from "react-dnd-test-backend";
import { TestBackend } from "react-dnd-test-backend";
import { ensureHappyDom } from "test-utils/happy-dom-env";
import type { PanesPresetBarItem as PanesPresetBarItemComponent } from "./PanesPresetBarItem";

type ItemProps = ComponentProps<typeof PanesPresetBarItemComponent>;

let DndProvider: typeof import("react-dnd").DndProvider;
let PanesPresetBarItem: ComponentType<ItemProps>;
let act: typeof import("@testing-library/react/pure").act;
let cleanup: typeof import("@testing-library/react/pure").cleanup;
let fireEvent: typeof import("@testing-library/react/pure").fireEvent;
let render: typeof import("@testing-library/react/pure").render;
let screen: typeof import("@testing-library/react/pure").screen;

beforeAll(async () => {
	// Register a single process-wide Happy DOM (see ensureHappyDom). Never
	// unregister mid-suite: @testing-library/dom binds `screen` to `document.body`
	// at import time, so tearing the DOM down between files would leave later
	// queries pointing at a closed document.
	await ensureHappyDom();
	({ act, cleanup, fireEvent, render, screen } = await import(
		"@testing-library/react/pure"
	));
	({ DndProvider } = await import("react-dnd"));
	({ PanesPresetBarItem } = await import("./PanesPresetBarItem"));
});

afterEach(() => cleanup());

const preset = (id: string): TerminalPreset =>
	({ id, name: id, commands: [], cwd: "" }) as TerminalPreset;

const noopDragStart = () => {};
const noopDragEnd = (_didDrop: boolean) => {};
const noopLocalReorder = (_fromIndex: number, _toIndex: number) => {};

function renderItems({
	onDragStart = noopDragStart,
	onDragEnd = noopDragEnd,
	onLocalReorder = noopLocalReorder,
	onPersistReorder,
}: {
	onDragStart?: () => void;
	onDragEnd?: (didDrop: boolean) => void;
	onLocalReorder?: (fromIndex: number, toIndex: number) => void;
	onPersistReorder: (
		presetId: string,
		originalPinnedIndex: number,
		targetPinnedIndex: number,
	) => boolean;
}) {
	const manager = createDragDropManager(TestBackend);
	const result: RenderResult = render(
		<DndProvider manager={manager}>
			<PanesPresetBarItem
				preset={preset("a")}
				pinnedIndex={0}
				isDark={false}
				canOpenInCurrentPane
				onOpen={() => {}}
				onOpenInNewTab={() => {}}
				onOpenInCurrentPane={() => {}}
				onEdit={() => {}}
				onDragStart={onDragStart}
				onDragEnd={onDragEnd}
				onLocalReorder={onLocalReorder}
				onPersistReorder={onPersistReorder}
			/>
			<PanesPresetBarItem
				preset={preset("b")}
				pinnedIndex={1}
				isDark={false}
				canOpenInCurrentPane
				onOpen={() => {}}
				onOpenInNewTab={() => {}}
				onOpenInCurrentPane={() => {}}
				onEdit={() => {}}
				onDragStart={onDragStart}
				onDragEnd={onDragEnd}
				onLocalReorder={onLocalReorder}
				onPersistReorder={onPersistReorder}
			/>
		</DndProvider>,
	);
	const items = result.container.querySelectorAll<HTMLElement>(
		"[data-dnd-source-id][data-dnd-target-id]",
	);
	const sourceId = items[0]?.dataset.dndSourceId;
	const targetId = items[1]?.dataset.dndTargetId;
	if (!sourceId || !targetId) {
		throw new Error("Panes preset item handler IDs were not exposed");
	}
	return {
		backend: manager.getBackend() as TestBackendImpl,
		sourceId,
		targetId,
	};
}

function renderMenuItem({
	canOpenInCurrentPane = true,
	onOpenInNewTab = () => {},
	onOpenInCurrentPane = () => {},
	onEdit = () => {},
}: {
	canOpenInCurrentPane?: boolean;
	onOpenInNewTab?: (preset: TerminalPreset) => void;
	onOpenInCurrentPane?: (preset: TerminalPreset) => void;
	onEdit?: (preset: TerminalPreset) => void;
}) {
	const manager = createDragDropManager(TestBackend);
	const props: ItemProps = {
		preset: preset("a"),
		pinnedIndex: 0,
		isDark: false,
		canOpenInCurrentPane,
		onOpen: () => {},
		onOpenInNewTab,
		onOpenInCurrentPane,
		onEdit,
		onDragStart: noopDragStart,
		onDragEnd: noopDragEnd,
		onLocalReorder: noopLocalReorder,
		onPersistReorder: () => true,
	};
	return render(
		<DndProvider manager={manager}>
			<PanesPresetBarItem {...props} />
		</DndProvider>,
	);
}

function openContextMenu() {
	fireEvent.contextMenu(screen.getByRole("button", { name: "a" }));
}

describe("PanesPresetBarItem context menu", () => {
	test("routes open actions to their preset callbacks", () => {
		const onOpenInNewTab = mock((_preset: TerminalPreset) => {});
		const onOpenInCurrentPane = mock((_preset: TerminalPreset) => {});
		renderMenuItem({ onOpenInNewTab, onOpenInCurrentPane });

		openContextMenu();
		fireEvent.click(screen.getByText("Open in new tab"));
		expect(onOpenInNewTab).toHaveBeenCalledWith(preset("a"));

		openContextMenu();
		fireEvent.click(screen.getByText("Open in current pane"));
		expect(onOpenInCurrentPane).toHaveBeenCalledWith(preset("a"));
	});

	test("routes Edit preset to its preset callback", () => {
		const onEdit = mock((_preset: TerminalPreset) => {});
		renderMenuItem({ onEdit });

		openContextMenu();
		fireEvent.click(screen.getByText("Edit preset"));

		expect(onEdit).toHaveBeenCalledWith(preset("a"));
	});

	test("disables current-pane action without an active pane", () => {
		const onOpenInCurrentPane = mock((_preset: TerminalPreset) => {});
		renderMenuItem({
			canOpenInCurrentPane: false,
			onOpenInCurrentPane,
		});

		openContextMenu();
		const item = screen.getByText("Open in current pane");
		expect(item.getAttribute("data-disabled")).not.toBeNull();
		fireEvent.click(item);
		expect(onOpenInCurrentPane).toHaveBeenCalledTimes(0);
	});
});

describe("PanesPresetBarItem drag wiring", () => {
	test("persists a normal drop exactly once and ends as dropped", () => {
		const onDragStart = mock(() => {});
		const onDragEnd = mock((_didDrop: boolean) => {});
		const onLocalReorder = mock((_fromIndex: number, _toIndex: number) => {});
		const onPersistReorder = mock(
			(
				_presetId: string,
				_originalPinnedIndex: number,
				_targetPinnedIndex: number,
			) => true,
		);
		const { backend, sourceId, targetId } = renderItems({
			onDragStart,
			onDragEnd,
			onLocalReorder,
			onPersistReorder,
		});

		act(() => {
			backend.simulateBeginDrag([sourceId], {});
			backend.simulateHover([targetId], {});
			backend.simulateDrop();
			backend.simulateEndDrag();
		});

		expect(onDragStart).toHaveBeenCalledTimes(1);
		expect(onLocalReorder).toHaveBeenCalledWith(0, 1);
		expect(onPersistReorder).toHaveBeenCalledTimes(1);
		expect(onPersistReorder).toHaveBeenCalledWith("a", 0, 1);
		expect(onDragEnd).toHaveBeenCalledWith(true);
	});

	test("cancels without persistence", () => {
		const onDragEnd = mock((_didDrop: boolean) => {});
		const onPersistReorder = mock(
			(
				_presetId: string,
				_originalPinnedIndex: number,
				_targetPinnedIndex: number,
			) => true,
		);
		const { backend, sourceId } = renderItems({ onDragEnd, onPersistReorder });

		act(() => {
			backend.simulateBeginDrag([sourceId], {});
			backend.simulateEndDrag();
		});

		expect(onPersistReorder).toHaveBeenCalledTimes(0);
		expect(onDragEnd).toHaveBeenCalledWith(false);
	});

	test("treats rejected persistence as cancel", () => {
		const mutation = mock(() => {});
		const onDragEnd = mock((_didDrop: boolean) => {});
		const onPersistReorder = mock(
			(
				_presetId: string,
				_originalPinnedIndex: number,
				_targetPinnedIndex: number,
			) => false,
		);
		const { backend, sourceId, targetId } = renderItems({
			onDragEnd,
			onPersistReorder: (presetId, originalIndex, targetIndex) => {
				const persisted = onPersistReorder(
					presetId,
					originalIndex,
					targetIndex,
				);
				if (persisted) mutation();
				return persisted;
			},
		});

		act(() => {
			backend.simulateBeginDrag([sourceId], {});
			backend.simulateHover([targetId], {});
			backend.simulateDrop();
			backend.simulateEndDrag();
		});

		expect(onPersistReorder).toHaveBeenCalledTimes(1);
		expect(mutation).toHaveBeenCalledTimes(0);
		expect(onDragEnd).toHaveBeenCalledWith(false);
	});

	test("resets persisted state between consecutive drags", () => {
		const onDragEnd = mock((_didDrop: boolean) => {});
		const onPersistReorder = mock(
			(
				_presetId: string,
				_originalPinnedIndex: number,
				_targetPinnedIndex: number,
			) => true,
		);
		const { backend, sourceId, targetId } = renderItems({
			onDragEnd,
			onPersistReorder,
		});

		act(() => {
			backend.simulateBeginDrag([sourceId], {});
			backend.simulateHover([targetId], {});
			backend.simulateDrop();
			backend.simulateEndDrag();
		});
		act(() => {
			backend.simulateBeginDrag([sourceId], {});
			backend.simulateEndDrag();
		});

		expect(onPersistReorder).toHaveBeenCalledTimes(1);
		expect(onDragEnd.mock.calls).toEqual([[true], [false]]);
	});
});

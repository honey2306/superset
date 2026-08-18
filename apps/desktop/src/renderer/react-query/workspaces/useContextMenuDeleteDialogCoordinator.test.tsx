import { beforeAll, describe, expect, test } from "bun:test";
import { ensureHappyDom } from "test-utils/happy-dom-env";
import { useContextMenuDeleteDialogCoordinator } from "./useWorkspaceDeleteHandler";

let act: typeof import("@testing-library/react/pure").act;
let renderHook: typeof import("@testing-library/react/pure").renderHook;

beforeAll(async () => {
	await ensureHappyDom();
	({ act, renderHook } = await import("@testing-library/react/pure"));
});

describe("useContextMenuDeleteDialogCoordinator", () => {
	test("keeps a pending close request through the menu-closing rerender", () => {
		const firstDelete: () => void = () => {
			throw new Error("The callback from before menu close must not be used");
		};
		let secondDeleteCalls = 0;
		const secondDelete = () => {
			secondDeleteCalls += 1;
		};
		const { result, rerender } = renderHook(
			({ onDelete }) => useContextMenuDeleteDialogCoordinator(onDelete),
			{ initialProps: { onDelete: firstDelete } },
		);

		act(() => {
			// ContextMenuItem.onSelect marks the pending request. Radix then closes
			// the menu and causes this rerender before onCloseAutoFocus fires.
			result.current.requestOpenDeleteDialog();
			rerender({ onDelete: secondDelete });
		});
		act(() => {
			result.current.handleCloseAutoFocus({ preventDefault: () => {} });
		});

		expect(secondDeleteCalls).toBe(1);
	});
});

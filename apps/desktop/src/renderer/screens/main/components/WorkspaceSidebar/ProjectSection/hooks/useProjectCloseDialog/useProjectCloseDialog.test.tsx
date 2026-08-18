import { beforeAll, describe, expect, test } from "bun:test";
import { ensureHappyDom } from "test-utils/happy-dom-env";
import { useProjectCloseDialog } from "./useProjectCloseDialog";

let act: typeof import("@testing-library/react/pure").act;
let renderHook: typeof import("@testing-library/react/pure").renderHook;

beforeAll(async () => {
	await ensureHappyDom();
	({ act, renderHook } = await import("@testing-library/react/pure"));
});

describe("useProjectCloseDialog", () => {
	test("opens after the ContextMenu selection-close-rerender-autofocus sequence", () => {
		const { result, rerender } = renderHook(() => useProjectCloseDialog());
		let preventDefaultCalls = 0;

		act(() => {
			// ContextMenuItem.onSelect requests the dialog, then Radix closes the
			// menu and its parent rerenders before it restores trigger focus.
			result.current.closeDialogCoordinator.requestOpenDeleteDialog();
			rerender();
		});
		expect(result.current.isCloseDialogOpen).toBe(false);

		act(() => {
			result.current.closeDialogCoordinator.handleCloseAutoFocus({
				preventDefault: () => {
					preventDefaultCalls += 1;
				},
			});
		});

		expect(preventDefaultCalls).toBe(1);
		expect(result.current.isCloseDialogOpen).toBe(true);
	});
});

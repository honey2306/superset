import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { ensureHappyDom } from "test-utils/happy-dom-env";

let WorkspaceAheadBehind: typeof import("./WorkspaceAheadBehind").WorkspaceAheadBehind;
let cleanup: typeof import("@testing-library/react/pure").cleanup;
let render: typeof import("@testing-library/react/pure").render;

beforeAll(async () => {
	await ensureHappyDom();
	({ cleanup, render } = await import("@testing-library/react/pure"));
	({ WorkspaceAheadBehind } = await import("./WorkspaceAheadBehind"));
});

afterEach(() => {
	cleanup();
});

describe("WorkspaceAheadBehind", () => {
	test("renders commits pullable from and pushable to the upstream branch", () => {
		const { container } = render(
			createElement(WorkspaceAheadBehind, {
				pullCount: 2,
				pushCount: 3,
				hasUpstream: true,
			}),
		);

		expect(container.textContent).toBe("↓2↑3");
	});

	test("does not render counts when the branch has no upstream", () => {
		const { container } = render(
			createElement(WorkspaceAheadBehind, {
				pullCount: 2,
				pushCount: 3,
				hasUpstream: false,
			}),
		);

		expect(container.firstElementChild).toBeNull();
	});
});

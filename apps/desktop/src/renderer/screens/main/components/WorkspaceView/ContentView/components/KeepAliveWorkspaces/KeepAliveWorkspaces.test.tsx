import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { useEffect } from "react";
import { ensureHappyDom } from "test-utils/happy-dom-env";

let act: typeof import("@testing-library/react/pure").act;
let cleanup: typeof import("@testing-library/react/pure").cleanup;
let render: typeof import("@testing-library/react/pure").render;
let KeepAliveWorkspaces: typeof import("./KeepAliveWorkspaces").KeepAliveWorkspaces;

beforeAll(async () => {
	await ensureHappyDom();
	({ act, cleanup, render } = await import("@testing-library/react/pure"));
	({ KeepAliveWorkspaces } = await import("./KeepAliveWorkspaces"));
});

afterEach(() => cleanup());

describe("KeepAliveWorkspaces", () => {
	test("keeps A mounted through A → B → A and prunes deleted workspaces", () => {
		const mounts = new Map<string, number>();
		const unmounts = new Map<string, number>();
		const activeStates = new Map<string, boolean>();

		function Probe({
			workspaceId,
			isActive,
		}: {
			workspaceId: string;
			isActive: boolean;
		}) {
			activeStates.set(workspaceId, isActive);
			useEffect(() => {
				mounts.set(workspaceId, (mounts.get(workspaceId) ?? 0) + 1);
				return () => {
					unmounts.set(workspaceId, (unmounts.get(workspaceId) ?? 0) + 1);
				};
			}, [workspaceId]);
			return <div>{workspaceId}</div>;
		}

		const child = (id: string, active: boolean) => (
			<Probe workspaceId={id} isActive={active} />
		);
		const result = render(
			<KeepAliveWorkspaces workspaceId="a" renderWorkspace={child} />,
		);
		act(() =>
			result.rerender(
				<KeepAliveWorkspaces workspaceId="b" renderWorkspace={child} />,
			),
		);
		act(() =>
			result.rerender(
				<KeepAliveWorkspaces workspaceId="a" renderWorkspace={child} />,
			),
		);

		expect(mounts.get("a")).toBe(1);
		expect(unmounts.has("a")).toBe(false);
		expect(activeStates.get("a")).toBe(true);
		expect(activeStates.get("b")).toBe(false);
		expect(
			result.container
				.querySelector('[data-workspace-content="b"]')
				?.getAttribute("aria-hidden"),
		).toBe("true");
		expect(
			result.container
				.querySelector('[data-workspace-content="b"]')
				?.classList.contains("hidden"),
		).toBe(true);

		act(() =>
			result.rerender(
				<KeepAliveWorkspaces
					workspaceId="a"
					validWorkspaceIds={new Set(["a"])}
					renderWorkspace={child}
				/>,
			),
		);
		expect(unmounts.get("b")).toBe(1);
		expect(
			result.container.querySelector('[data-workspace-content="b"]'),
		).toBeNull();
	});
});

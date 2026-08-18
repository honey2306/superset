import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { useEffect } from "react";
import { ensureHappyDom } from "test-utils/happy-dom-env";

let cleanup: typeof import("@testing-library/react/pure").cleanup;
let render: typeof import("@testing-library/react/pure").render;
let KeepAliveWorkspaceSurfaces: typeof import("./KeepAliveWorkspaceSurfaces").KeepAliveWorkspaceSurfaces;

beforeAll(async () => {
	await ensureHappyDom();
	({ cleanup, render } = await import("@testing-library/react/pure"));
	({ KeepAliveWorkspaceSurfaces } = await import(
		"./KeepAliveWorkspaceSurfaces"
	));
});

afterEach(() => cleanup());

describe("KeepAliveWorkspaceSurfaces", () => {
	test("keeps content mounted and lazily keeps Changes after its first visit", () => {
		let contentMounts = 0;
		let contentUnmounts = 0;
		let changesMounts = 0;
		let changesUnmounts = 0;

		function Probe({ kind }: { kind: "content" | "changes" }) {
			useEffect(() => {
				if (kind === "content") contentMounts += 1;
				else changesMounts += 1;
				return () => {
					if (kind === "content") contentUnmounts += 1;
					else changesUnmounts += 1;
				};
			}, [kind]);
			return <div>{kind}</div>;
		}

		const tree = (isChangesActive: boolean) => (
			<KeepAliveWorkspaceSurfaces
				isChangesActive={isChangesActive}
				renderContent={() => <Probe kind="content" />}
				renderChanges={() => <Probe kind="changes" />}
			/>
		);
		const result = render(tree(false));
		expect(contentMounts).toBe(1);
		expect(changesMounts).toBe(0);

		result.rerender(tree(true));
		expect(contentMounts).toBe(1);
		expect(changesMounts).toBe(1);
		expect(contentUnmounts).toBe(0);

		result.rerender(tree(false));
		expect(contentUnmounts).toBe(0);
		expect(changesUnmounts).toBe(0);
		expect(
			result.container
				.querySelector('[data-workspace-surface="content"]')
				?.getAttribute("aria-hidden"),
		).toBe("false");
		expect(
			result.container
				.querySelector('[data-workspace-surface="changes"]')
				?.getAttribute("aria-hidden"),
		).toBe("true");
	});
});

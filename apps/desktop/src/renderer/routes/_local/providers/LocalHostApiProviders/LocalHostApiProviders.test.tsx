import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { type ReactNode, useEffect } from "react";
import { ensureHappyDom } from "test-utils/happy-dom-env";

let activeHostUrl: string | null = null;
let workspaceClientHostUrl: string | null = null;

mock.module("../LocalHostServiceProvider", () => ({
	useLocalHostService: () => ({ activeHostUrl }),
}));

mock.module("renderer/providers/HostServiceTRPCProvider", () => ({
	HostServiceTRPCProvider: ({ children }: { children: ReactNode }) => children,
	UNAVAILABLE_HOST_URL: "http://127.0.0.1:1",
}));

mock.module("@superset/workspace-client", () => ({
	WorkspaceClientProvider: ({
		children,
		hostUrl,
	}: {
		children: ReactNode;
		hostUrl: string;
	}) => {
		workspaceClientHostUrl = hostUrl;
		return children;
	},
}));

let cleanup: typeof import("@testing-library/react/pure").cleanup;
let render: typeof import("@testing-library/react/pure").render;
let screen: typeof import("@testing-library/react/pure").screen;
let LocalHostApiProviders: typeof import("./LocalHostApiProviders").LocalHostApiProviders;

describe("LocalHostApiProviders", () => {
	beforeAll(async () => {
		await ensureHappyDom();
		({ cleanup, render, screen } = await import("@testing-library/react/pure"));
		({ LocalHostApiProviders } = await import("./LocalHostApiProviders"));
	});

	afterEach(() => {
		cleanup();
		activeHostUrl = null;
		workspaceClientHostUrl = null;
	});

	test("keeps the local product tree mounted across host reconnects", () => {
		let mountCount = 0;
		let unmountCount = 0;
		function ProductTree() {
			useEffect(() => {
				mountCount += 1;
				return () => {
					unmountCount += 1;
				};
			}, []);
			return <div>local product state</div>;
		}

		activeHostUrl = null;
		const view = render(
			<LocalHostApiProviders>
				<ProductTree />
			</LocalHostApiProviders>,
		);

		expect(screen.getByText("local product state")).toBeTruthy();
		expect(workspaceClientHostUrl).toBe("http://127.0.0.1:1");
		expect(mountCount).toBe(1);
		expect(unmountCount).toBe(0);

		activeHostUrl = "http://127.0.0.1:43123";
		view.rerender(
			<LocalHostApiProviders>
				<ProductTree />
			</LocalHostApiProviders>,
		);
		expect(workspaceClientHostUrl).toBe("http://127.0.0.1:43123");
		expect(mountCount).toBe(1);
		expect(unmountCount).toBe(0);

		activeHostUrl = null;
		view.rerender(
			<LocalHostApiProviders>
				<ProductTree />
			</LocalHostApiProviders>,
		);
		expect(workspaceClientHostUrl).toBe("http://127.0.0.1:1");
		expect(mountCount).toBe(1);
		expect(unmountCount).toBe(0);
	});
});

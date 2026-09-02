import { describe, expect, test } from "bun:test";
import {
	type AgentBrowserBridge,
	AgentBrowserRuntime,
	type BrowserUseSidecarLike,
} from "./agent-browser-runtime";

function createBridge(calls: string[]): AgentBrowserBridge {
	const page = {
		id: "page-1",
		index: 0,
		targetId: "target-1",
		url: "https://example.com",
		title: "Example",
		active: true,
	};
	const pages = [page];
	return {
		isAvailable: () => true,
		state: async () => ({ active: true, activePageIndex: 0, pages }),
		activeTarget: async () => ({
			page,
			allowedTargetIds: pages.map((candidate) => candidate.targetId),
		}),
		createPage: async (_sessionId, url) => {
			calls.push(`create:${url ?? "about:blank"}`);
			return page;
		},
		selectPage: async (_sessionId, pageId) => {
			calls.push(`select:${pageId}`);
			return { pages };
		},
		closePage: async (_sessionId, pageId) => {
			calls.push(`close-page:${pageId}`);
			return { pages: [] };
		},
		closeSession: async () => {
			calls.push("close-session");
		},
		view: async () => ({
			enabled: true,
			active: true,
			activePageIndex: 0,
			pages: pages.map(({ targetId: _targetId, ...page }) => page),
		}),
	};
}

function createSidecar(calls: unknown[]): BrowserUseSidecarLike {
	return {
		call: async (input) => {
			calls.push(input);
			return { url: "https://example.com", interactiveElements: [] };
		},
		close: async () => {
			calls.push("sidecar-close");
		},
	};
}

describe("AgentBrowserRuntime", () => {
	test("passes the exact active target and conversation allowlist to Browser Use", async () => {
		const bridgeCalls: string[] = [];
		const sidecarCalls: unknown[] = [];
		const runtime = new AgentBrowserRuntime({
			bridge: createBridge(bridgeCalls),
			createSidecar: () => createSidecar(sidecarCalls),
			cdpUrl: "http://127.0.0.1:49001",
		});

		await runtime.execute({
			sessionId: "session-1",
			name: "browser_get_state",
			arguments: {},
		});

		expect(sidecarCalls).toEqual([
			{
				name: "browser_get_state",
				arguments: {},
				cdpUrl: "http://127.0.0.1:49001",
				targetId: "target-1",
				allowedTargetIds: ["target-1"],
			},
		]);
	});

	test("routes tab lifecycle through Electron instead of Browser Use", async () => {
		const bridgeCalls: string[] = [];
		const sidecarCalls: unknown[] = [];
		const runtime = new AgentBrowserRuntime({
			bridge: createBridge(bridgeCalls),
			createSidecar: () => createSidecar(sidecarCalls),
			cdpUrl: "http://127.0.0.1:49001",
		});

		await runtime.execute({
			sessionId: "session-1",
			name: "browser_tabs",
			arguments: { action: "new", url: "https://docs.example.com" },
		});
		await runtime.execute({
			sessionId: "session-1",
			name: "browser_tabs",
			arguments: { action: "switch", index: 0 },
		});
		await runtime.execute({
			sessionId: "session-1",
			name: "browser_tabs",
			arguments: { action: "close", pageId: "page-1" },
		});

		expect(bridgeCalls).toEqual([
			"create:https://docs.example.com",
			"select:page-1",
			"close-page:page-1",
		]);
		expect(sidecarCalls).toEqual([]);
	});

	test("returns native page metadata without screenshots", async () => {
		const runtime = new AgentBrowserRuntime({
			bridge: createBridge([]),
			cdpUrl: "http://127.0.0.1:49001",
		});
		expect(
			await runtime.getView({
				sessionId: "session-1",
				includeScreenshot: true,
			}),
		).toEqual({
			enabled: true,
			active: true,
			activePageIndex: 0,
			pages: [
				{
					id: "page-1",
					index: 0,
					url: "https://example.com",
					title: "Example",
					active: true,
				},
			],
		});
	});

	test("closing a conversation closes both sidecar and Electron pages", async () => {
		const bridgeCalls: string[] = [];
		const sidecarCalls: unknown[] = [];
		const runtime = new AgentBrowserRuntime({
			bridge: createBridge(bridgeCalls),
			createSidecar: () => createSidecar(sidecarCalls),
			cdpUrl: "http://127.0.0.1:49001",
		});
		await runtime.execute({
			sessionId: "session-1",
			name: "browser_get_state",
			arguments: {},
		});
		await runtime.closeSession("session-1");

		expect(sidecarCalls.at(-1)).toBe("sidecar-close");
		expect(bridgeCalls).toContain("close-session");
	});

	test("fails closed without the authenticated bridge or CDP endpoint", async () => {
		const unavailable = createBridge([]);
		unavailable.isAvailable = () => false;
		const runtime = new AgentBrowserRuntime({
			bridge: unavailable,
			cdpUrl: "http://127.0.0.1:49001",
		});
		expect(await runtime.getView({ sessionId: "session-1" })).toMatchObject({
			enabled: false,
			active: false,
		});
		await expect(
			runtime.execute({
				sessionId: "session-1",
				name: "browser_get_state",
				arguments: {},
			}),
		).rejects.toThrow("disabled or unavailable");
	});
});

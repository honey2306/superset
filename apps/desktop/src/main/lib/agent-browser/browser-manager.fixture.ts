import { describe, expect, mock, test } from "bun:test";

type Listener = (...args: never[]) => void;

class FakeWebContents {
	private readonly onceListeners = new Map<string, Listener[]>();
	private openHandler: ((input: { url: string }) => unknown) | undefined;
	private destroyed = false;
	private url = "";

	getOrCreateDevToolsTargetId() {
		return `target-${views.length + 1}`;
	}
	setBackgroundThrottling() {}
	setWindowOpenHandler(handler: (input: { url: string }) => unknown) {
		this.openHandler = handler;
	}
	on() {}
	once(event: string, listener: Listener) {
		this.onceListeners.set(event, [
			...(this.onceListeners.get(event) ?? []),
			listener,
		]);
	}
	async loadURL(url: string) {
		this.url = url;
	}
	getURL() {
		return this.url;
	}
	getTitle() {
		return "";
	}
	canGoBack() {
		return false;
	}
	canGoForward() {
		return false;
	}
	focus() {}
	close() {
		this.destroyed = true;
		for (const listener of this.onceListeners.get("destroyed") ?? []) {
			listener();
		}
	}
	isDestroyed() {
		return this.destroyed;
	}
	openPopup(url: string) {
		this.openHandler?.({ url });
	}
}

class FakeWebContentsView {
	readonly webContents = new FakeWebContents();
	constructor(_options: unknown) {
		views.push(this);
	}
	setVisible() {}
	setBounds() {}
	setBackgroundColor() {}
}

const views: FakeWebContentsView[] = [];

mock.module("electron", () => ({
	Menu: { buildFromTemplate: () => ({ popup() {} }) },
	WebContentsView: FakeWebContentsView,
}));

const { AgentBrowserManager } = await import("./browser-manager");

function manager() {
	return new AgentBrowserManager(
		() =>
			({
				isDestroyed: () => false,
				getContentBounds: () => ({ x: 0, y: 0, width: 900, height: 700 }),
				contentView: { addChildView() {}, removeChildView() {} },
			}) as never,
	);
}

describe("AgentBrowserManager fixture", () => {
	test("removes agent pages and inherited popups", async () => {
		const browser = manager();
		await browser.createPage("session", "https://user.example");
		await browser.createPage("session", "https://agent.example", "agent");
		views.at(-1)?.webContents.openPopup("https://popup.example");
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(browser.getState("session").pages).toHaveLength(3);
		await browser.closeAgentPages("session");

		const state = browser.getState("session");
		expect(state.pages).toHaveLength(1);
		expect(state.pages[0]?.url).toBe("https://user.example");
		expect(views[0]?.webContents.isDestroyed()).toBe(false);
		expect(views[1]?.webContents.isDestroyed()).toBe(true);
		expect(views[2]?.webContents.isDestroyed()).toBe(true);
	});
});

test("retained pages survive repeated cleanup with state intact until explicitly closed", async () => {
	const browser = manager();
	const user = await browser.createPage("s", "https://user.example");
	const retained = await browser.createPage(
		"s",
		"https://login.example",
		"agent",
	);
	const retainedView = views.at(-1);
	await browser.createPage("s", "https://temporary.example", "agent");
	browser.keepOpen("s", {
		pageIds: [retained.id],
		reason: "user_action",
		message: "Please log in",
	});
	await browser.closeAgentPages("s");
	await browser.closeAgentPages("s");
	expect(browser.getState("s").pages.map((page) => page.id)).toEqual([
		user.id,
		retained.id,
	]);
	expect(browser.getState("s").pages[1]?.handoff?.message).toBe(
		"Please log in",
	);
	expect(retainedView?.webContents.isDestroyed()).toBe(false);
	expect(retainedView?.webContents.getURL()).toBe("https://login.example");
	await expect(
		browser.closeAgentPages("s", [retained.id, user.id]),
	).rejects.toThrow();
	expect(retainedView?.webContents.isDestroyed()).toBe(false);
	await browser.closeAgentPages("s", [retained.id]);
	expect(retainedView?.webContents.isDestroyed()).toBe(true);
	expect(browser.getState("s").pages.map((page) => page.id)).toEqual([user.id]);
});

test("handoff rejects foreign or missing pages atomically and manual close removes retained pages", async () => {
	const browser = manager();
	const page = await browser.createPage("s", "https://result.example", "agent");
	const foreign = await browser.createPage(
		"other",
		"https://other.example",
		"agent",
	);
	expect(() =>
		browser.keepOpen("s", {
			pageIds: [page.id, foreign.id],
			reason: "review",
			message: "Review this",
		}),
	).toThrow();
	expect(browser.getState("s").pages[0]?.handoff).toBeUndefined();
	browser.keepOpen("s", {
		pageIds: [page.id],
		reason: "review",
		message: "Review this",
	});
	await browser.closePage("s", page.id);
	expect(browser.getState("s").pages).toEqual([]);
	await browser.closeAgentPages("s");
	expect(browser.getState("other").pages).toHaveLength(1);
});

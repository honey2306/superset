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

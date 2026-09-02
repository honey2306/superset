import { createHash, randomUUID } from "node:crypto";
import type { BrowserWindow, Rectangle } from "electron";
import { Menu, WebContentsView } from "electron";

export interface AgentBrowserPageState {
	id: string;
	index: number;
	targetId: string;
	url: string;
	title?: string;
	active: boolean;
	canGoBack: boolean;
	canGoForward: boolean;
	loading: boolean;
}

export interface AgentBrowserSessionState {
	enabled: true;
	active: boolean;
	pages: AgentBrowserPageState[];
	activePageIndex: number | null;
}

interface BrowserPage {
	id: string;
	targetId: string;
	view: WebContentsView;
	loading: boolean;
}

interface BrowserSession {
	pages: BrowserPage[];
	activePageId: string | null;
	bounds: Rectangle | null;
	visible: boolean;
}

const MIN_VIEW_SIZE = 1;

function partitionForConversation(sessionId: string): string {
	const digest = createHash("sha256")
		.update(sessionId)
		.digest("hex")
		.slice(0, 24);
	return `persist:superset-agent-browser-${digest}`;
}

function normalizeUrl(url: string): string {
	const value = url.trim();
	if (!value) return "about:blank";
	if (/^(https?:|about:)/i.test(value)) return value;
	if (/^(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/i.test(value)) {
		return `http://${value}`;
	}
	return `https://${value}`;
}

/**
 * Electron-main authority for every embedded Agent Browser page.
 *
 * No automation client may create or close CDP targets directly. The exact
 * target ids returned here are also the conversation target allowlist.
 */
export class AgentBrowserManager {
	private readonly sessions = new Map<string, BrowserSession>();

	constructor(private readonly getWindow: () => BrowserWindow | null) {}

	private sessionFor(sessionId: string): BrowserSession {
		const existing = this.sessions.get(sessionId);
		if (existing) return existing;
		const created: BrowserSession = {
			pages: [],
			activePageId: null,
			bounds: null,
			visible: false,
		};
		this.sessions.set(sessionId, created);
		return created;
	}

	private activePage(session: BrowserSession): BrowserPage | null {
		return (
			session.pages.find((page) => page.id === session.activePageId) ??
			session.pages[0] ??
			null
		);
	}

	private attachActiveView(session: BrowserSession): void {
		const window = this.getWindow();
		const active = this.activePage(session);
		for (const page of session.pages) {
			const shouldShow =
				page === active &&
				session.visible &&
				session.bounds !== null &&
				window !== null &&
				!window.isDestroyed();
			page.view.setVisible(shouldShow);
			if (!shouldShow || !window || !session.bounds) continue;
			// addChildView reparents an existing view and is safe when restoring a
			// renderer/window after the browser session has already been created.
			window.contentView.addChildView(page.view);
			page.view.setBounds(session.bounds);
		}
	}

	async createPage(
		sessionId: string,
		url = "about:blank",
	): Promise<AgentBrowserPageState> {
		const session = this.sessionFor(sessionId);
		const pageId = randomUUID();
		const view = new WebContentsView({
			webPreferences: {
				partition: partitionForConversation(sessionId),
				sandbox: true,
				contextIsolation: true,
				nodeIntegration: false,
			},
		});
		view.setVisible(false);
		view.webContents.setBackgroundThrottling(true);
		const page: BrowserPage = {
			id: pageId,
			targetId: view.webContents.getOrCreateDevToolsTargetId(),
			view,
			loading: false,
		};
		session.pages.push(page);
		session.activePageId = pageId;

		view.webContents.setWindowOpenHandler(({ url: childUrl }) => {
			void this.createPage(sessionId, childUrl);
			return { action: "deny" };
		});
		view.webContents.on("will-navigate", (event, destination) => {
			if (/^(https?:|about:)/i.test(destination)) return;
			event.preventDefault();
		});
		view.webContents.on("did-start-loading", () => {
			page.loading = true;
		});
		view.webContents.on("did-stop-loading", () => {
			page.loading = false;
		});
		view.webContents.on("context-menu", (_event, params) => {
			const menu = Menu.buildFromTemplate([
				{ role: "copy", enabled: params.editFlags.canCopy },
				{ role: "paste", enabled: params.editFlags.canPaste },
				{ role: "selectAll", enabled: params.editFlags.canSelectAll },
				{ type: "separator" },
				{
					label: "Back",
					enabled: view.webContents.canGoBack(),
					click: () => view.webContents.goBack(),
				},
				{
					label: "Reload",
					click: () => view.webContents.reload(),
				},
			]);
			menu.popup();
		});
		view.webContents.once("destroyed", () => {
			const current = this.sessions.get(sessionId);
			if (!current) return;
			current.pages = current.pages.filter((candidate) => candidate !== page);
			if (current.activePageId === page.id) {
				current.activePageId = current.pages[0]?.id ?? null;
			}
			this.attachActiveView(current);
		});

		this.attachActiveView(session);
		await view.webContents.loadURL(normalizeUrl(url));
		return this.pageState(session, page, session.pages.indexOf(page));
	}

	async ensurePage(sessionId: string): Promise<AgentBrowserPageState> {
		const session = this.sessionFor(sessionId);
		const page = this.activePage(session);
		if (!page) return this.createPage(sessionId);
		return this.pageState(session, page, session.pages.indexOf(page));
	}

	private pageState(
		session: BrowserSession,
		page: BrowserPage,
		index: number,
	): AgentBrowserPageState {
		const contents = page.view.webContents;
		const title = contents.getTitle();
		return {
			id: page.id,
			index,
			targetId: page.targetId,
			url: contents.getURL() || "about:blank",
			...(title ? { title } : {}),
			active: page.id === session.activePageId,
			canGoBack: contents.canGoBack(),
			canGoForward: contents.canGoForward(),
			loading: page.loading,
		};
	}

	getState(sessionId: string): AgentBrowserSessionState {
		const session = this.sessions.get(sessionId);
		if (!session) {
			return { enabled: true, active: false, pages: [], activePageIndex: null };
		}
		const activePageIndex = session.pages.findIndex(
			(page) => page.id === session.activePageId,
		);
		return {
			enabled: true,
			active: session.pages.length > 0,
			pages: session.pages.map((page, index) =>
				this.pageState(session, page, index),
			),
			activePageIndex: activePageIndex >= 0 ? activePageIndex : null,
		};
	}

	getAllowedTargetIds(sessionId: string): string[] {
		return (
			this.sessions.get(sessionId)?.pages.map((page) => page.targetId) ?? []
		);
	}

	async selectPage(sessionId: string, pageId: string): Promise<void> {
		const session = this.sessions.get(sessionId);
		const page = session?.pages.find((candidate) => candidate.id === pageId);
		if (!session || !page) throw new Error("Agent Browser page is not allowed");
		session.activePageId = page.id;
		this.attachActiveView(session);
		page.view.webContents.focus();
	}

	async closePage(sessionId: string, pageId: string): Promise<void> {
		const session = this.sessions.get(sessionId);
		const page = session?.pages.find((candidate) => candidate.id === pageId);
		if (!session || !page) throw new Error("Agent Browser page is not allowed");
		page.view.webContents.close();
	}

	async navigate(sessionId: string, url: string): Promise<void> {
		const page = await this.ensurePage(sessionId);
		const session = this.sessions.get(sessionId);
		const browserPage = session?.pages.find(
			(candidate) => candidate.id === page.id,
		);
		if (!browserPage) throw new Error("Agent Browser page disappeared");
		await browserPage.view.webContents.loadURL(normalizeUrl(url));
	}

	goBack(sessionId: string): void {
		const session = this.sessions.get(sessionId);
		const contents = session
			? this.activePage(session)?.view.webContents
			: null;
		if (contents?.canGoBack()) contents.goBack();
	}

	goForward(sessionId: string): void {
		const session = this.sessions.get(sessionId);
		const contents = session
			? this.activePage(session)?.view.webContents
			: null;
		if (contents?.canGoForward()) contents.goForward();
	}

	reload(sessionId: string): void {
		const session = this.sessions.get(sessionId);
		if (!session) return;
		this.activePage(session)?.view.webContents.reload();
	}

	setSurface(input: {
		sessionId: string;
		visible: boolean;
		bounds?: Rectangle;
	}): void {
		const session = this.sessionFor(input.sessionId);
		session.visible = input.visible;
		if (input.bounds) {
			session.bounds = {
				x: Math.max(0, Math.round(input.bounds.x)),
				y: Math.max(0, Math.round(input.bounds.y)),
				width: Math.max(MIN_VIEW_SIZE, Math.round(input.bounds.width)),
				height: Math.max(MIN_VIEW_SIZE, Math.round(input.bounds.height)),
			};
		}
		this.attachActiveView(session);
	}

	hideAll(): void {
		for (const session of this.sessions.values()) {
			session.visible = false;
			this.attachActiveView(session);
		}
	}

	async closeSession(sessionId: string): Promise<void> {
		const session = this.sessions.get(sessionId);
		if (!session) return;
		this.sessions.delete(sessionId);
		for (const page of session.pages) {
			if (!page.view.webContents.isDestroyed()) page.view.webContents.close();
		}
	}

	async dispose(): Promise<void> {
		const sessionIds = [...this.sessions.keys()];
		await Promise.all(
			sessionIds.map((sessionId) => this.closeSession(sessionId)),
		);
	}
}

let manager: AgentBrowserManager | null = null;

export function getAgentBrowserManager(
	getWindow: () => BrowserWindow | null = () => null,
): AgentBrowserManager {
	if (!manager) manager = new AgentBrowserManager(getWindow);
	return manager;
}

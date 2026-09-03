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

interface BrowserPageMenu {
	view: WebContentsView;
	bounds: Rectangle;
	resolve: (pageId: string | null) => void;
}

interface BrowserSession {
	pages: BrowserPage[];
	activePageId: string | null;
	bounds: Rectangle | null;
	visible: boolean;
	pageMenu: BrowserPageMenu | null;
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

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");
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
			pageMenu: null,
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

		const menu = session.pageMenu;
		const shouldShowMenu =
			menu !== null &&
			session.visible &&
			window !== null &&
			!window.isDestroyed();
		menu?.view.setVisible(shouldShowMenu);
		if (shouldShowMenu && menu && window) {
			window.contentView.addChildView(menu.view);
			menu.view.setBounds(menu.bounds);
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
		if (!input.visible) this.closePageMenu(input.sessionId);
		this.attachActiveView(session);
	}

	async showPageMenu(input: {
		sessionId: string;
		bounds: Rectangle;
		theme: "dark" | "light";
	}): Promise<string | null> {
		this.closePageMenu(input.sessionId);
		const session = this.sessionFor(input.sessionId);
		const window = this.getWindow();
		if (!window || window.isDestroyed() || session.pages.length === 0) {
			return null;
		}

		const view = new WebContentsView({
			webPreferences: {
				sandbox: true,
				contextIsolation: true,
				nodeIntegration: false,
			},
		});
		view.setVisible(false);
		view.setBackgroundColor("#00000000");

		const selection = new Promise<string | null>((resolve) => {
			session.pageMenu = {
				view,
				bounds: {
					x: Math.max(0, Math.round(input.bounds.x)),
					y: Math.max(0, Math.round(input.bounds.y)),
					width: Math.max(MIN_VIEW_SIZE, Math.round(input.bounds.width)),
					height: Math.max(MIN_VIEW_SIZE, Math.round(input.bounds.height)),
				},
				resolve,
			};
		});

		const palette =
			input.theme === "dark"
				? {
						background: "#25222d",
						border: "#46414f",
						foreground: "#f2eff5",
						muted: "#aaa3b2",
						hover: "#34303d",
						accent: "#51334e",
					}
				: {
						background: "#ffffff",
						border: "#d9d5dd",
						foreground: "#242128",
						muted: "#746e79",
						hover: "#f2eff4",
						accent: "#f2dcea",
					};
		const items = session.pages
			.map((page, index) => {
				const state = this.pageState(session, page, index);
				const label = state.title || state.url || `Page ${index + 1}`;
				const href = `superset-agent-browser-menu://select?pageId=${encodeURIComponent(page.id)}`;
				return `<a class="item${state.active ? " active" : ""}" href="${href}" title="${escapeHtml(state.url)}"><span class="globe"></span><span class="label">${escapeHtml(label)}</span><span class="check">${state.active ? "✓" : ""}</span></a>`;
			})
			.join("");
		const html = `<!doctype html><html><head><meta charset="utf-8"><style>
			*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:${palette.foreground}}
			.menu{width:100%;height:100%;overflow-y:auto;padding:4px;border:1px solid ${palette.border};border-radius:10px;background:${palette.background};box-shadow:0 8px 24px rgba(0,0,0,.28);scrollbar-width:none}
			.menu::-webkit-scrollbar{display:none}
			.item{display:flex;height:30px;align-items:center;gap:8px;padding:0 8px;border-radius:6px;color:${palette.muted};font-size:11px;text-decoration:none;outline:none}
			.item:hover,.item:focus{background:${palette.hover};color:${palette.foreground}}
			.item.active{background:${palette.accent};color:${palette.foreground}}
			.globe{width:12px;height:12px;border:1.5px solid currentColor;border-radius:50%;flex:none;opacity:.8}
			.label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
			.check{width:12px;flex:none;color:${palette.foreground};font-size:12px}
		</style></head><body><nav class="menu">${items}</nav></body></html>`;

		view.webContents.on("will-navigate", (event, destination) => {
			if (!destination.startsWith("superset-agent-browser-menu://select")) {
				return;
			}
			event.preventDefault();
			const pageId = new URL(destination).searchParams.get("pageId");
			if (pageId && session.pages.some((page) => page.id === pageId)) {
				session.activePageId = pageId;
				this.closePageMenu(input.sessionId, pageId);
				this.attachActiveView(session);
				this.activePage(session)?.view.webContents.focus();
			}
		});
		view.webContents.on("before-input-event", (event, keyboardInput) => {
			if (keyboardInput.key === "Escape") {
				event.preventDefault();
				this.closePageMenu(input.sessionId);
			}
		});
		view.webContents.on("blur", () => this.closePageMenu(input.sessionId));
		view.webContents.once("destroyed", () => {
			const menu = session.pageMenu;
			if (menu?.view === view) {
				session.pageMenu = null;
				menu.resolve(null);
			}
		});

		try {
			await view.webContents.loadURL(
				`data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
			);
			if (session.pageMenu?.view === view) {
				this.attachActiveView(session);
				view.webContents.focus();
			}
		} catch {
			this.closePageMenu(input.sessionId);
		}
		return selection;
	}

	closePageMenu(sessionId: string, pageId: string | null = null): void {
		const session = this.sessions.get(sessionId);
		const menu = session?.pageMenu;
		if (!session || !menu) return;
		session.pageMenu = null;
		const window = this.getWindow();
		if (window && !window.isDestroyed()) {
			window.contentView.removeChildView(menu.view);
		}
		menu.resolve(pageId);
		if (!menu.view.webContents.isDestroyed()) menu.view.webContents.close();
	}

	hideAll(): void {
		for (const [sessionId, session] of this.sessions) {
			this.closePageMenu(sessionId);
			session.visible = false;
			this.attachActiveView(session);
		}
	}

	async closeSession(sessionId: string): Promise<void> {
		const session = this.sessions.get(sessionId);
		if (!session) return;
		this.closePageMenu(sessionId);
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

import type {
	AgentBrowserToolInput,
	AgentBrowserView,
	AgentBrowserViewportInput,
} from "@superset/session-protocol";
import { AgentBrowserBridgeClient } from "./agent-browser-bridge-client";
import { BrowserUseSidecar } from "./browser-use-sidecar";

interface TabArguments {
	action: "list" | "new" | "switch" | "close";
	pageId?: string;
	index?: number;
	url?: string;
}

export interface AgentBrowserBridge {
	isAvailable(): boolean;
	state(sessionId: string): Promise<{
		active: boolean;
		activePageIndex: number | null;
		pages: Array<{
			id: string;
			index: number;
			targetId: string;
			url: string;
			title?: string;
			active: boolean;
		}>;
	}>;
	activeTarget(sessionId: string): Promise<{
		page: { targetId: string };
		allowedTargetIds: string[];
	}>;
	createPage(sessionId: string, url?: string): Promise<unknown>;
	selectPage(sessionId: string, pageId: string): Promise<unknown>;
	closePage(sessionId: string, pageId: string): Promise<unknown>;
	closeSession(sessionId: string): Promise<void>;
	view(sessionId: string): Promise<AgentBrowserView>;
}

export interface BrowserUseSidecarLike {
	call(input: Parameters<BrowserUseSidecar["call"]>[0]): Promise<unknown>;
	close(): Promise<void>;
}

export interface AgentBrowserRuntimeOptions {
	enabled?: boolean;
	bridge?: AgentBrowserBridge;
	createSidecar?: (sessionId: string) => BrowserUseSidecarLike;
	cdpUrl?: string;
}

function parseTabArguments(value: unknown): TabArguments {
	if (!value || typeof value !== "object") {
		throw new Error("browser_tabs arguments are required");
	}
	const input = value as Record<string, unknown>;
	if (
		input.action !== "list" &&
		input.action !== "new" &&
		input.action !== "switch" &&
		input.action !== "close"
	) {
		throw new Error("Invalid browser_tabs action");
	}
	return {
		action: input.action,
		...(typeof input.pageId === "string" ? { pageId: input.pageId } : {}),
		...(typeof input.index === "number" ? { index: input.index } : {}),
		...(typeof input.url === "string" ? { url: input.url } : {}),
	};
}

/**
 * Detached-daemon adapter for Electron-owned pages and Browser Use SDK actions.
 * Page lifecycle always crosses the authenticated Electron bridge; the Python
 * sidecar receives only an exact active target plus its conversation allowlist.
 */
export class AgentBrowserRuntime {
	private readonly enabled: boolean;
	private readonly bridge: AgentBrowserBridge;
	private readonly createSidecar: (sessionId: string) => BrowserUseSidecarLike;
	private readonly sidecars = new Map<string, BrowserUseSidecarLike>();
	private readonly cdpUrl: string | undefined;

	constructor(options: AgentBrowserRuntimeOptions = {}) {
		this.enabled = options.enabled ?? true;
		this.bridge = options.bridge ?? new AgentBrowserBridgeClient();
		this.createSidecar =
			options.createSidecar ?? (() => new BrowserUseSidecar());
		this.cdpUrl = options.cdpUrl ?? process.env.SUPERSET_AGENT_BROWSER_CDP_URL;
	}

	isEnabled(): boolean {
		return this.enabled && this.bridge.isAvailable() && Boolean(this.cdpUrl);
	}

	private assertEnabled(): void {
		if (!this.isEnabled()) {
			throw new Error("Agent Browser is disabled or unavailable on this host");
		}
	}

	private sidecarFor(sessionId: string): BrowserUseSidecarLike {
		const existing = this.sidecars.get(sessionId);
		if (existing) return existing;
		const sidecar = this.createSidecar(sessionId);
		this.sidecars.set(sessionId, sidecar);
		return sidecar;
	}

	private async executeTabs(
		sessionId: string,
		arguments_: unknown,
	): Promise<unknown> {
		const input = parseTabArguments(arguments_);
		if (input.action === "list") return this.bridge.state(sessionId);
		if (input.action === "new") {
			return this.bridge.createPage(sessionId, input.url);
		}
		const state = await this.bridge.state(sessionId);
		const page = input.pageId
			? state.pages.find((candidate) => candidate.id === input.pageId)
			: state.pages[input.index ?? -1];
		if (!page) throw new Error("Agent Browser page is not allowed");
		if (input.action === "switch") {
			return this.bridge.selectPage(sessionId, page.id);
		}
		return this.bridge.closePage(sessionId, page.id);
	}

	async execute(input: AgentBrowserToolInput): Promise<unknown> {
		this.assertEnabled();
		if (input.name === "browser_tabs") {
			return this.executeTabs(input.sessionId, input.arguments);
		}
		if (input.name === "browser_close") {
			await this.closeSession(input.sessionId);
			return { success: true };
		}

		const target = await this.bridge.activeTarget(input.sessionId);
		return this.sidecarFor(input.sessionId).call({
			name: input.name,
			arguments: input.arguments,
			cdpUrl: this.cdpUrl as string,
			targetId: target.page.targetId,
			allowedTargetIds: target.allowedTargetIds,
		});
	}

	async setViewport(_input: AgentBrowserViewportInput): Promise<void> {
		// The native WebContentsView's bounds are authoritative. Browser Use reads
		// that real viewport after focusing the target; no emulation is applied.
	}

	async getView(input: {
		sessionId: string;
		includeScreenshot?: boolean;
	}): Promise<AgentBrowserView> {
		if (!this.isEnabled()) {
			return {
				enabled: false,
				active: false,
				pages: [],
				activePageIndex: null,
			};
		}
		try {
			return await this.bridge.view(input.sessionId);
		} catch (error) {
			return {
				enabled: true,
				active: false,
				pages: [],
				activePageIndex: null,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	async closeSession(sessionId: string): Promise<void> {
		const sidecar = this.sidecars.get(sessionId);
		this.sidecars.delete(sessionId);
		await Promise.allSettled([
			sidecar?.close() ?? Promise.resolve(),
			this.bridge.isAvailable()
				? this.bridge.closeSession(sessionId)
				: Promise.resolve(),
		]);
	}

	async dispose(): Promise<void> {
		const sidecars = [...this.sidecars.values()];
		this.sidecars.clear();
		await Promise.allSettled(sidecars.map((sidecar) => sidecar.close()));
	}
}

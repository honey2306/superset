import { randomUUID } from "node:crypto";
import net from "node:net";
import type { AgentBrowserView } from "@superset/session-protocol";

interface BridgePage {
	id: string;
	index: number;
	targetId: string;
	url: string;
	title?: string;
	active: boolean;
}

interface BridgeState {
	enabled: true;
	active: boolean;
	pages: BridgePage[];
	activePageIndex: number | null;
}

interface ActiveTarget {
	page: BridgePage;
	allowedTargetIds: string[];
}

interface BridgeResponse<T> {
	id: string;
	ok: boolean;
	result?: T;
	error?: string;
}

export interface AgentBrowserBridgeClientOptions {
	socketPath?: string;
	token?: string;
}

export class AgentBrowserBridgeClient {
	private readonly socketPath: string | undefined;
	private readonly token: string | undefined;

	constructor(options: AgentBrowserBridgeClientOptions = {}) {
		this.socketPath =
			options.socketPath ?? process.env.SUPERSET_AGENT_BROWSER_BRIDGE_SOCKET;
		this.token =
			options.token ?? process.env.SUPERSET_AGENT_BROWSER_BRIDGE_TOKEN;
	}

	isAvailable(): boolean {
		return Boolean(this.socketPath && this.token);
	}

	private async call<T>(
		method: string,
		params: Record<string, unknown>,
	): Promise<T> {
		const socketPath = this.socketPath;
		const token = this.token;
		if (!socketPath || !token) {
			throw new Error("Superset Agent Browser bridge is unavailable");
		}
		return new Promise<T>((resolve, reject) => {
			const id = randomUUID();
			const socket = net.createConnection(socketPath);
			let buffer = "";
			let settled = false;
			const finish = (error?: Error, value?: T) => {
				if (settled) return;
				settled = true;
				socket.removeAllListeners();
				socket.destroy();
				if (error) reject(error);
				else resolve(value as T);
			};
			socket.setEncoding("utf8");
			socket.once("connect", () => {
				socket.write(`${JSON.stringify({ id, token, method, params })}\n`);
			});
			socket.on("data", (chunk: string) => {
				buffer += chunk;
				const newline = buffer.indexOf("\n");
				if (newline < 0) return;
				try {
					const response = JSON.parse(
						buffer.slice(0, newline),
					) as BridgeResponse<T>;
					if (response.id !== id)
						throw new Error("Bridge response id mismatch");
					if (!response.ok)
						throw new Error(response.error ?? "Bridge call failed");
					finish(undefined, response.result);
				} catch (error) {
					finish(error instanceof Error ? error : new Error(String(error)));
				}
			});
			socket.once("error", (error) => finish(error));
			socket.once("close", () =>
				finish(new Error("Agent Browser bridge closed before responding")),
			);
		});
	}

	state(sessionId: string): Promise<BridgeState> {
		return this.call("state", { sessionId });
	}

	activeTarget(sessionId: string): Promise<ActiveTarget> {
		return this.call("activeTarget", { sessionId });
	}

	createPage(sessionId: string, url?: string): Promise<BridgePage> {
		return this.call("createPage", { sessionId, ...(url ? { url } : {}) });
	}

	selectPage(sessionId: string, pageId: string): Promise<BridgeState> {
		return this.call("selectPage", { sessionId, pageId });
	}

	closePage(sessionId: string, pageId: string): Promise<BridgeState> {
		return this.call("closePage", { sessionId, pageId });
	}

	async closeSession(sessionId: string): Promise<void> {
		await this.call("closeSession", { sessionId });
	}

	async view(sessionId: string): Promise<AgentBrowserView> {
		const state = await this.state(sessionId);
		return {
			enabled: true,
			active: state.active,
			activePageIndex:
				state.activePageIndex !== null && state.activePageIndex >= 0
					? state.activePageIndex
					: null,
			pages: state.pages.map((page) => ({
				id: page.id,
				index: page.index,
				url: page.url,
				...(page.title ? { title: page.title } : {}),
				active: page.active,
			})),
		};
	}
}

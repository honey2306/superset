/**
 * Host-service terminal adapter for v1 terminal panes (Milestone 1).
 *
 * Lets v1 terminal panes create/adopt host-service terminal sessions without
 * mounting the v2 workspace UI. Maintains a paneId → terminalId mapping so
 * pane identity (v1) and backend session identity (host-service) can diverge.
 *
 * See: plans/20260724-v1-v2-terminal-fusion.md (Milestone 1)
 */
import type { AppRouter } from "@superset/host-service";
import type { TRPCClient } from "@trpc/client";
import { getHostServiceWsToken } from "renderer/lib/host-service-auth";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export interface CreateOrAttachOptions {
	paneId: string;
	tabId: string;
	/**
	 * Explicit backend session identity. The legacy mosaic path omits this and
	 * keeps paneId === terminalId; the @superset/panes path persists its own
	 * terminalId in pane data and passes it here.
	 */
	terminalId?: string;
	cols?: number;
	rows?: number;
	cwd?: string;
	command?: string;
	themeType?: "dark" | "light";
}

export interface HostServiceTerminalAdapter {
	createOrAttach(options: CreateOrAttachOptions): Promise<string>;
	write(paneId: string, data: string): void;
	resize(paneId: string, cols: number, rows: number): void;
	kill(paneId: string): Promise<void>;
	restart(options: CreateOrAttachOptions): Promise<string>;
	detach(paneId: string): void;
	getTerminalId(paneId: string): string | null;
	getWebsocketUrl(paneId: string, themeType: "dark" | "light"): string;
}

interface AdapterDeps {
	hostUrl: string;
	workspaceId: string;
	getClient?: () => TRPCClient<AppRouter>;
	getWsToken?: () => string | null;
	runtime: {
		writeInput(terminalId: string, data: string, instanceId?: string): void;
		resize(
			terminalId: string,
			cols: number,
			rows: number,
			instanceId?: string,
		): void;
		detach(terminalId: string, instanceId?: string): void;
		discard(terminalId: string, instanceId?: string): void;
	};
}

function trimTrailingSeparators(path: string): string {
	return path.replace(/[\\/]+$/, "");
}

/**
 * v1 and host-service keep separate workspace identities. During the fusion
 * rollout, resolve the host-owned row by its worktree path instead of assuming
 * a v1 workspace UUID is valid in host.db.
 */
export async function resolveHostWorkspaceId(
	client: TRPCClient<AppRouter>,
	v1WorkspaceId: string,
	worktreePath: string,
): Promise<string | null> {
	const hostWorkspaces = await client.workspace.list.query();
	const exactId = hostWorkspaces.find(
		(workspace) => workspace.id === v1WorkspaceId,
	);
	if (exactId) return exactId.id;

	const normalizedWorktreePath = trimTrailingSeparators(worktreePath);
	const matchingPath = hostWorkspaces.find(
		(workspace) =>
			trimTrailingSeparators(workspace.worktreePath) === normalizedWorktreePath,
	);
	if (matchingPath) return matchingPath.id;

	// Workspace not found in host-service. This can happen when a workspace
	// was created in v1 desktop but hasn't been synced to host-service yet.
	// Return null to signal the caller to fall back to the v1 terminal backend.
	console.warn(
		`[resolveHostWorkspaceId] Workspace ${v1WorkspaceId} not found in host-service (${hostWorkspaces.length} workspaces available), falling back to v1 terminal`,
		{ worktreePath },
	);
	return null;
}

// Adapter instances are recreated when a pane remounts or the local host URL
// changes. Keep identity outside the hook so those transitions can still adopt
// the same backend session. paneId is already persisted and globally unique in
// v1, so using it as the initial terminalId also survives a full app reload.
const terminalIdByPaneKey = new Map<string, string>();

export function createHostServiceTerminalAdapter(
	deps: AdapterDeps,
): HostServiceTerminalAdapter {
	const { hostUrl, workspaceId } = deps;
	const { runtime } = deps;
	const createdPaneIds = new Set<string>();
	const pendingCreates = new Map<string, Promise<void>>();

	function paneKey(paneId: string): string {
		return `${workspaceId}\u0000${paneId}`;
	}

	function ensureTerminalId(
		paneId: string,
		requestedTerminalId?: string,
	): string {
		const key = paneKey(paneId);
		const existing = terminalIdByPaneKey.get(key);
		if (existing) {
			if (requestedTerminalId && requestedTerminalId !== existing) {
				throw new Error(
					`Pane ${paneId} is already bound to terminal ${existing}`,
				);
			}
			return existing;
		}
		const terminalId = requestedTerminalId ?? paneId;
		terminalIdByPaneKey.set(key, terminalId);
		return terminalId;
	}

	function getClient(): TRPCClient<AppRouter> {
		if (deps.getClient) return deps.getClient();
		return getHostServiceClientByUrl(hostUrl);
	}

	function getWsToken(): string | null {
		if (deps.getWsToken) return deps.getWsToken();
		return getHostServiceWsToken(hostUrl);
	}

	async function createOrAttach(
		options: CreateOrAttachOptions,
	): Promise<string> {
		const terminalId = ensureTerminalId(options.paneId, options.terminalId);
		if (createdPaneIds.has(options.paneId)) return terminalId;

		let pending = pendingCreates.get(options.paneId);
		if (!pending) {
			pending = getClient()
				.terminal.createSession.mutate({
					terminalId,
					workspaceId,
					themeType: options.themeType,
					initialCommand: options.command,
					cwd: options.cwd,
					cols: options.cols,
					rows: options.rows,
				})
				.then(() => {
					createdPaneIds.add(options.paneId);
				})
				.finally(() => {
					pendingCreates.delete(options.paneId);
				});
			pendingCreates.set(options.paneId, pending);
		}
		await pending;
		return terminalId;
	}

	function write(paneId: string, data: string): void {
		const terminalId = getTerminalId(paneId);
		if (!terminalId) return;
		runtime.writeInput(terminalId, data, paneId);
	}

	function resize(paneId: string, cols: number, rows: number): void {
		const terminalId = getTerminalId(paneId);
		if (!terminalId) return;
		runtime.resize(terminalId, cols, rows, paneId);
	}

	async function kill(paneId: string): Promise<void> {
		const terminalId = getTerminalId(paneId);
		if (!terminalId) return;
		runtime.discard(terminalId, paneId);
		let disposed = false;
		try {
			// Closing can race an in-flight create. Wait for that request to
			// settle so kill cannot arrive first and orphan the new PTY.
			await pendingCreates.get(paneId)?.catch(() => {});
			await getClient().terminal.killSession.mutate({
				terminalId,
				workspaceId,
			});
			disposed = true;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (
				message.includes("not found") ||
				message.includes("has exited") ||
				message.includes("disposed")
			) {
				disposed = true;
			} else {
				throw error;
			}
		} finally {
			if (disposed) {
				createdPaneIds.delete(paneId);
				terminalIdByPaneKey.delete(paneKey(paneId));
			}
		}
	}

	async function restart(options: CreateOrAttachOptions): Promise<string> {
		await kill(options.paneId);
		return createOrAttach(options);
	}

	function detach(paneId: string): void {
		const terminalId = getTerminalId(paneId);
		if (!terminalId) return;
		runtime.detach(terminalId, paneId);
	}

	function getTerminalId(paneId: string): string | null {
		return terminalIdByPaneKey.get(paneKey(paneId)) ?? null;
	}

	function getWebsocketUrl(
		paneId: string,
		themeType: "dark" | "light",
	): string {
		const terminalId = getTerminalId(paneId);
		if (!terminalId) return "";
		const url = new URL(`${hostUrl}/terminal/${terminalId}`);
		url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
		url.searchParams.set("workspaceId", workspaceId);
		url.searchParams.set("themeType", themeType);
		const token = getWsToken();
		if (token) url.searchParams.set("token", token);
		return url.toString();
	}

	return {
		createOrAttach,
		write,
		resize,
		kill,
		restart,
		detach,
		getTerminalId,
		getWebsocketUrl,
	};
}

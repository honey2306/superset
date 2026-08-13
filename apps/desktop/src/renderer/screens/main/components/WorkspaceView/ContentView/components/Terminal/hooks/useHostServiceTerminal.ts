/** React hook that resolves the canonical local host-service terminal adapter. */

import { useMemo } from "react";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider/LocalHostServiceProvider";
import {
	createHostServiceTerminalAdapter,
	type HostServiceTerminalAdapter,
} from "../host-service-terminal-adapter";

export interface UseHostServiceTerminalOptions {
	workspaceId: string;
	worktreePath?: string;
}

export interface UseHostServiceTerminalResult {
	enabled: boolean;
	adapter: HostServiceTerminalAdapter | null;
	status: "starting" | "ready" | "unavailable";
	hostUrl: string | null;
	hostWorkspaceId: string | null;
}

/**
 * Catalog workspace IDs are canonical host IDs. The provider owns host
 * readiness, so pane mounts never probe by worktree path or start their own
 * backend-discovery lifecycle.
 */
export function useHostServiceTerminal({
	workspaceId,
}: UseHostServiceTerminalOptions): UseHostServiceTerminalResult {
	const { activeHostUrl } = useLocalHostService();
	const adapter = useMemo(
		() =>
			activeHostUrl
				? createHostServiceTerminalAdapter({
						hostUrl: activeHostUrl,
						workspaceId,
						runtime: terminalRuntimeRegistry,
					})
				: null,
		[activeHostUrl, workspaceId],
	);
	return {
		enabled: adapter !== null,
		adapter,
		status: adapter ? "ready" : "unavailable",
		hostUrl: activeHostUrl,
		hostWorkspaceId: activeHostUrl ? workspaceId : null,
	};
}

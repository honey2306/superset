/** React hook that resolves the local host-service terminal adapter. */

import { useEffect, useMemo, useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider/LocalHostServiceProvider";
import {
	createHostServiceTerminalAdapter,
	type HostServiceTerminalAdapter,
	resolveHostWorkspaceId,
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

export function useHostServiceTerminal({
	workspaceId,
	worktreePath,
}: UseHostServiceTerminalOptions): UseHostServiceTerminalResult {
	const { activeHostUrl, waitForHostReady } = useLocalHostService();
	const [resolvedHostUrl, setResolvedHostUrl] = useState<string | null>(
		activeHostUrl,
	);
	const [hostUnavailable, setHostUnavailable] = useState(false);
	const [hostWorkspaceId, setHostWorkspaceId] = useState<string | null>(null);
	const [workspaceUnavailable, setWorkspaceUnavailable] = useState(false);

	useEffect(() => {
		if (activeHostUrl) {
			setResolvedHostUrl(activeHostUrl);
			setHostUnavailable(false);
			return;
		}

		let cancelled = false;
		setHostUnavailable(false);
		void waitForHostReady().then((hostUrl) => {
			if (cancelled) return;
			setResolvedHostUrl(hostUrl);
			setHostUnavailable(hostUrl === null);
		});
		return () => {
			cancelled = true;
		};
	}, [activeHostUrl, waitForHostReady]);

	useEffect(() => {
		if (!resolvedHostUrl || !worktreePath) {
			setHostWorkspaceId(null);
			setWorkspaceUnavailable(false);
			return;
		}

		let cancelled = false;
		setHostWorkspaceId(null);
		setWorkspaceUnavailable(false);
		void resolveHostWorkspaceId(
			getHostServiceClientByUrl(resolvedHostUrl),
			workspaceId,
			worktreePath,
		)
			.then((resolvedWorkspaceId) => {
				if (!cancelled) setHostWorkspaceId(resolvedWorkspaceId);
			})
			.catch(() => {
				if (!cancelled) setWorkspaceUnavailable(true);
			});
		return () => {
			cancelled = true;
		};
	}, [resolvedHostUrl, workspaceId, worktreePath]);

	const adapter = useMemo(() => {
		if (!resolvedHostUrl || !hostWorkspaceId) return null;
		return createHostServiceTerminalAdapter({
			hostUrl: resolvedHostUrl,
			workspaceId: hostWorkspaceId,
			runtime: terminalRuntimeRegistry,
		});
	}, [resolvedHostUrl, hostWorkspaceId]);

	const status: UseHostServiceTerminalResult["status"] = adapter
		? "ready"
		: hostUnavailable || workspaceUnavailable
			? "unavailable"
			: "starting";

	return {
		enabled: status === "ready",
		adapter,
		status,
		hostUrl: resolvedHostUrl,
		hostWorkspaceId,
	};
}

export type { HostServiceTerminalAdapter };

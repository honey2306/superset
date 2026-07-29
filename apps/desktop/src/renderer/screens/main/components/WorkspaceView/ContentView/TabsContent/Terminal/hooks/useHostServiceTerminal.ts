/**
 * React hook that wraps the host-service terminal adapter for v1 Terminal.
 *
 * When the `v1-host-service-terminal` feature flag is enabled and the local
 * host-service is ready, returns an adapter that routes terminal operations
 * through the v2-grade byte-safe backend. Otherwise returns null, and the
 * v1 Terminal component falls back to the legacy Electron IPC path.
 *
 * See: plans/20260724-v1-v2-terminal-fusion.md (Milestone 1)
 */

import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useEffect, useMemo, useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider";
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
	status: "disabled" | "starting" | "ready" | "unavailable";
	hostUrl: string | null;
	hostWorkspaceId: string | null;
}

export function useHostServiceTerminal({
	workspaceId,
	worktreePath,
}: UseHostServiceTerminalOptions): UseHostServiceTerminalResult {
	const flagEnabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.V1_HOST_SERVICE_TERMINAL) ?? false;
	const { activeHostUrl, waitForHostReady } = useLocalHostService();
	const [resolvedHostUrl, setResolvedHostUrl] = useState<string | null>(
		activeHostUrl,
	);
	const [hostUnavailable, setHostUnavailable] = useState(false);
	const [hostWorkspaceId, setHostWorkspaceId] = useState<string | null>(null);
	const [workspaceUnavailable, setWorkspaceUnavailable] = useState(false);

	useEffect(() => {
		if (!flagEnabled) {
			setResolvedHostUrl(null);
			setHostUnavailable(false);
			return;
		}
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
	}, [flagEnabled, activeHostUrl, waitForHostReady]);

	useEffect(() => {
		if (!flagEnabled || !resolvedHostUrl || !worktreePath) {
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
	}, [flagEnabled, resolvedHostUrl, workspaceId, worktreePath]);

	const adapter = useMemo(() => {
		if (!flagEnabled || !resolvedHostUrl || !hostWorkspaceId) return null;
		return createHostServiceTerminalAdapter({
			hostUrl: resolvedHostUrl,
			workspaceId: hostWorkspaceId,
			runtime: terminalRuntimeRegistry,
		});
	}, [flagEnabled, resolvedHostUrl, hostWorkspaceId]);

	const status: UseHostServiceTerminalResult["status"] = !flagEnabled
		? "disabled"
		: adapter
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

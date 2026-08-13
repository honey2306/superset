import { useMemo } from "react";
import { useNotificationStore } from "renderer/stores/notifications";
import type { ActivePaneStatus, PaneStatus } from "shared/tabs-types";
import {
	useTerminalAgentBindings,
	useTerminalAgentBindingsAtHost,
} from "../useTerminalAgentBindings";
import {
	deriveTerminalAgentStatuses,
	getHighestTerminalAgentStatus,
} from "./deriveTerminalAgentStatus";

/**
 * Map of `terminalId → derived agent status` for a workspace. Runtime state
 * (working/permission/idle) comes from the host binding's `lastEventType`;
 * `review` means the host recorded a Stop newer than the locally persisted
 * seen timestamp. Terminals without a live binding are absent (treat as idle).
 */
export function useTerminalAgentStatuses(
	workspaceId: string,
	options?: { enabled?: boolean },
): Map<string, PaneStatus> {
	const bindings = useTerminalAgentBindings(workspaceId, options);
	const terminalSeenAt = useNotificationStore((state) => state.terminalSeenAt);

	return useMemo(
		() => deriveTerminalAgentStatuses(bindings, terminalSeenAt),
		[bindings, terminalSeenAt],
	);
}

export function useTerminalAgentStatusesAtHost(
	hostUrl: string | null,
	hostWorkspaceId: string | null,
): Map<string, PaneStatus> {
	const bindings = useTerminalAgentBindingsAtHost(hostUrl, hostWorkspaceId);
	const terminalSeenAt = useNotificationStore((state) => state.terminalSeenAt);
	return useMemo(
		() => deriveTerminalAgentStatuses(bindings, terminalSeenAt),
		[bindings, terminalSeenAt],
	);
}

export function useHighestTerminalAgentStatusAtHost(
	hostUrl: string | null,
	hostWorkspaceId: string | null,
): ActivePaneStatus | null {
	const bindings = useTerminalAgentBindingsAtHost(hostUrl, hostWorkspaceId);
	const terminalSeenAt = useNotificationStore((state) => state.terminalSeenAt);
	return useMemo(
		() => getHighestTerminalAgentStatus(bindings, terminalSeenAt),
		[bindings, terminalSeenAt],
	);
}

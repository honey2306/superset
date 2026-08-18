import { getEventBus } from "@superset/workspace-client";
import { useEffect, useRef } from "react";
import { getHostServiceWsToken } from "renderer/lib/host-service-auth";
import { electronTrpcClient } from "renderer/lib/trpc-client";

/** Opens only host-validated MR creation pages requested by Superset MCP. */
export function useMergeRequestOpenRequests({
	hostUrl,
	hostWorkspaceId,
}: {
	hostUrl: string | null;
	hostWorkspaceId: string | null;
}): void {
	const handled = useRef(new Set<string>());

	useEffect(() => {
		if (!hostUrl || !hostWorkspaceId) return;
		const bus = getEventBus(hostUrl, () => getHostServiceWsToken(hostUrl));
		const off = bus.on(
			"acp-session:merge-request-open-requested",
			hostWorkspaceId,
			(_workspaceId, event) => {
				// Deduplicate one delivered event, while allowing a later intentional
				// tool call to reopen the same branch's MR page.
				const key = `${event.sourceSessionId}:${event.occurredAt}:${event.url}`;
				if (handled.current.has(key)) return;
				handled.current.add(key);
				void electronTrpcClient.external.openUrl.mutate(event.url).catch(() => {
					handled.current.delete(key);
				});
			},
		);
		const release = bus.retain();
		return () => {
			off();
			release();
		};
	}, [hostUrl, hostWorkspaceId]);
}

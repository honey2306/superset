import { useMemo } from "react";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";

/** Resolves only the embedded local host. Remote hosts are unsupported. */
export function useHostUrl(hostId: string | null | undefined): string | null {
	const { machineId, activeHostUrl } = useLocalHostService();
	if (hostId === undefined) return null;
	if (hostId !== null && hostId !== machineId) return null;
	return activeHostUrl;
}

/** Local-only list variant retained for callers that aggregate host-owned data. */
export function useHostUrls(
	hostIds: string[],
): Array<{ hostId: string; url: string | null; isLocal: boolean }> {
	const { machineId, activeHostUrl } = useLocalHostService();
	return useMemo(
		() =>
			hostIds.map((hostId) => ({
				hostId,
				url: hostId === machineId ? activeHostUrl : null,
				isLocal: hostId === machineId,
			})),
		[activeHostUrl, hostIds, machineId],
	);
}

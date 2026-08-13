import {
	createTrpcProvisioningAdapter,
	getEventBus,
	type ProvisioningAdapter,
	type WorkspaceOperation,
} from "@superset/workspace-client";
import { useMemo } from "react";
import { getHostServiceWsToken } from "renderer/lib/host-service-auth";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useMaybeLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";

/** Create a durable Provisioning adapter for any reachable host URL. */
export function createWorkspaceProvisioningAdapter(
	hostUrl: string,
): ProvisioningAdapter {
	const bus = getEventBus(hostUrl, () => getHostServiceWsToken(hostUrl));
	return createTrpcProvisioningAdapter({
		trpc: getHostServiceClientByUrl(hostUrl),
		subscribe: (listener) => {
			const off = bus.on(
				"workspace-operation:changed",
				"*",
				(_operationId, payload) =>
					listener(payload.operation as WorkspaceOperation),
			);
			const release = bus.retain();
			return () => {
				off();
				release();
			};
		},
	});
}

/** Production adapter for the local host's durable Provisioning journal. */
export function useWorkspaceProvisioningAdapter(): ProvisioningAdapter | null {
	const hostUrl = useMaybeLocalHostService()?.activeHostUrl ?? null;

	return useMemo(
		() => (hostUrl ? createWorkspaceProvisioningAdapter(hostUrl) : null),
		[hostUrl],
	);
}

import { createTRPCUntypedClient, httpLink } from "@trpc/client";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { getHostServiceHeaders } from "renderer/lib/host-service-auth";
import { hostServiceTrpc } from "renderer/lib/host-service-trpc";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import superjson from "superjson";

export const UNAVAILABLE_HOST_URL = "http://127.0.0.1:1";

export function createHostServiceClient(hostUrl: string) {
	// Hooks consume the untyped client through hostServiceTrpc.Provider. Passing
	// createClient's recursive procedure proxy lets React development's props
	// diff instrumentation invoke it while switching from the fallback URL.
	return createTRPCUntypedClient({
		links: [
			httpLink({
				url: `${hostUrl}/trpc`,
				transformer: superjson,
				headers: () => getHostServiceHeaders(hostUrl),
			}),
		],
	});
}

export function HostServiceTRPCProvider({ children }: { children: ReactNode }) {
	const { activeHostUrl } = useLocalHostService();
	const hostUrl = activeHostUrl ?? UNAVAILABLE_HOST_URL;
	const client = useMemo(() => createHostServiceClient(hostUrl), [hostUrl]);

	return (
		<hostServiceTrpc.Provider client={client} queryClient={electronQueryClient}>
			{children}
		</hostServiceTrpc.Provider>
	);
}

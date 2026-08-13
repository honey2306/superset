import { WorkspaceClientProvider } from "@superset/workspace-client";
import type { ReactNode } from "react";
import {
	getHostServiceHeaders,
	getHostServiceWsToken,
} from "renderer/lib/host-service-auth";
import {
	HostServiceTRPCProvider,
	UNAVAILABLE_HOST_URL,
} from "renderer/providers/HostServiceTRPCProvider";
import { useLocalHostService } from "../LocalHostServiceProvider";

export function LocalHostApiProviders({ children }: { children: ReactNode }) {
	const { activeHostUrl } = useLocalHostService();
	const hostUrl = activeHostUrl ?? UNAVAILABLE_HOST_URL;

	return (
		<HostServiceTRPCProvider>
			<WorkspaceClientProvider
				cacheKey="embedded-host"
				hostUrl={hostUrl}
				headers={() => getHostServiceHeaders(hostUrl)}
				wsToken={() => getHostServiceWsToken(hostUrl)}
			>
				{children}
			</WorkspaceClientProvider>
		</HostServiceTRPCProvider>
	);
}

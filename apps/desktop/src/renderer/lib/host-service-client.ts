import { createHostClient, type HostClient } from "@superset/host-client";
import { getHostServiceHeaders } from "./host-service-auth";

const clientCache = new Map<string, HostClient>();

export type HostServiceClient = HostClient;

export function getHostServiceClient(port: number): HostServiceClient {
	return getHostServiceClientByUrl(`http://127.0.0.1:${port}`);
}

export function getHostServiceClientByUrl(hostUrl: string): HostServiceClient {
	const cached = clientCache.get(hostUrl);
	if (cached) return cached;

	const client = createHostClient({
		endpoint: hostUrl,
		headers: () => getHostServiceHeaders(hostUrl),
	});

	clientCache.set(hostUrl, client);
	return client;
}

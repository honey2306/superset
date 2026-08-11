import type { AppRouter } from "@superset/trpc";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import { env } from "renderer/env.renderer";
import superjson from "superjson";
import { getAuthToken } from "./auth-client";
import { authenticatedTrpcFetch } from "./authenticated-trpc-fetch";

/**
 * HTTP tRPC client for calling the API server.
 * Uses bearer token authentication like the auth client.
 * For mutations only - for fetching data we already have electric
 */
export const apiTrpcClient = createTRPCProxyClient<AppRouter>({
	links: [
		httpBatchLink({
			fetch: authenticatedTrpcFetch,
			url: `${env.NEXT_PUBLIC_API_URL}/api/trpc`,
			transformer: superjson,
			headers: () => {
				const token = getAuthToken();
				if (token) {
					return {
						Authorization: `Bearer ${token}`,
					};
				}
				return {};
			},
		}),
	],
});

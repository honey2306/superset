import { getJwt } from "./auth-client";
import { authenticatedTrpcFetch } from "./authenticated-trpc-fetch";
import { refreshJwtAfterUnauthorized } from "./jwt-refresh";

interface AuthenticatedElectricFetchDependencies {
	fetchImpl?: typeof fetch;
	getToken?: () => string | null;
	refreshJwt?: () => Promise<void>;
}

/**
 * Cookie-authenticated Electric fetch that gives a cold-start JWT one chance
 * to refresh before Electric evaluates the response protocol headers.
 */
export function createAuthenticatedElectricFetch({
	fetchImpl = fetch,
	getToken = getJwt,
	refreshJwt = refreshJwtAfterUnauthorized,
}: AuthenticatedElectricFetchDependencies = {}): typeof fetch {
	const credentialedFetch = async (
		input: RequestInfo | URL,
		init?: RequestInit,
	) => {
		const noStoreInit = { ...init, cache: "no-store" as const };
		const response = await authenticatedTrpcFetch(
			input,
			noStoreInit,
			fetchImpl,
		);
		if (response.status !== 401) return response;

		await refreshJwt();
		const retryHeaders = new Headers(init?.headers);
		const refreshedToken = getToken();
		if (refreshedToken) {
			retryHeaders.set("Authorization", `Bearer ${refreshedToken}`);
		} else {
			retryHeaders.delete("Authorization");
		}
		const retriedResponse = await authenticatedTrpcFetch(
			input,
			{ ...noStoreInit, headers: retryHeaders },
			fetchImpl,
		);
		return retriedResponse;
	};

	return Object.assign(credentialedFetch, {
		preconnect: fetchImpl.preconnect,
	});
}

export const authenticatedElectricFetch = createAuthenticatedElectricFetch();

/**
 * Sends Better Auth's renderer cookies to the API, which runs on a different
 * development port. The link still supplies its bearer header independently.
 */
export function authenticatedTrpcFetch(
	input: RequestInfo | URL,
	init?: RequestInit,
	fetchImpl: typeof fetch = fetch,
): Promise<Response> {
	return fetchImpl(input, { ...init, credentials: "include" });
}

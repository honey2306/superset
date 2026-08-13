import type { AppRouter } from "@superset/host-service";
import { createTRPCClient, httpLink, TRPCClientError } from "@trpc/client";
import superjson from "superjson";
import { clearStoredSession, getStoredToken } from "./auth-store";
import { getPhoneTransport } from "./transport";

let cached: ReturnType<typeof createTRPCClient<AppRouter>> | null = null;

/**
 * Same-origin tRPC client. Bearer token is pulled fresh from localStorage
 * on every request so a stale sign-in doesn't linger across pair/unpair.
 * `superjson` matches the host-service transformer.
 */
export function getTrpc(): ReturnType<typeof createTRPCClient<AppRouter>> {
	if (cached) return cached;
	cached = createTRPCClient<AppRouter>({
		links: [
			httpLink({
				url: "/trpc",
				transformer: superjson,
				headers: () => {
					const token = getStoredToken();
					return token ? { Authorization: `Bearer ${token}` } : {};
				},
				fetch: (input, init) => getPhoneTransport().fetch(input, init),
			}),
		],
	});
	return cached;
}

/**
 * Reset the memoized client, e.g. after clearing auth so the next request
 * doesn't reuse stale header closures. httpLink recomputes headers every
 * call already, so this is mostly a hygiene helper.
 */
export function resetTrpc(): void {
	cached = null;
}

export function isUnauthorized(err: unknown): boolean {
	if (err instanceof TRPCClientError) {
		return err.data?.code === "UNAUTHORIZED";
	}
	return false;
}

/** Wrap a query and drop the session on 401 so the caller sends to `/pair`. */
export async function withAuthGuard<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (err) {
		if (isUnauthorized(err)) {
			clearStoredSession();
		}
		throw err;
	}
}

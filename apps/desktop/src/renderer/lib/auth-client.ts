import { apiKeyClient } from "@better-auth/api-key/client";
import { stripeClient } from "@better-auth/stripe/client";
import type { auth } from "@superset/auth/server";
import {
	customSessionClient,
	jwtClient,
	organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { env } from "renderer/env.renderer";
import { decodeJwtExpiresAtMs } from "renderer/lib/jwt-expiry";

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
	authToken = token;
}

export function getAuthToken(): string | null {
	return authToken;
}

let jwt: string | null = null;
let jwtExpiresAtMs: number | null = null;
let jwtGeneration = 0;
let jwtRefreshInFlight: Promise<string | null> | null = null;

// Refresh ahead of expiry so a token handed to a WS URL is still valid by the
// time the relay verifies it.
const JWT_REFRESH_LEEWAY_MS = 60_000;

export function setJwt(token: string | null) {
	jwt = token;
	jwtGeneration++;
	jwtExpiresAtMs = token ? decodeJwtExpiresAtMs(token) : null;
}

function jwtIsFresh(): boolean {
	if (!jwt) return false;
	if (jwtExpiresAtMs === null) return true;
	return Date.now() < jwtExpiresAtMs - JWT_REFRESH_LEEWAY_MS;
}

export function getJwt(): string | null {
	// Relay JWTs rotate hourly, but this cache only updates when some API
	// response happens to carry `set-auth-jwt`. Sync callers (WS URL builders,
	// reconnect loops) can't await a refresh, so kick one off in the background
	// and let their next attempt pick up the fresh token.
	if (jwt && !jwtIsFresh()) void ensureFreshJwt();
	return jwt;
}

/**
 * Returns the cached JWT if it's still valid, otherwise mints a fresh one from
 * better-auth's `/token` endpoint (deduped across concurrent callers). Falls
 * back to the stale cached token if the refresh fails.
 */
export async function ensureFreshJwt(): Promise<string | null> {
	if (jwtIsFresh()) return jwt;
	if (!jwtRefreshInFlight) {
		const generationAtStart = jwtGeneration;
		jwtRefreshInFlight = authClient
			.$fetch<{ token?: string }>("/token")
			.then((res) => {
				const token = res.data?.token;
				// Apply only if nothing (logout, a set-auth-jwt response header)
				// replaced the cached token while this request was in flight.
				if (
					typeof token === "string" &&
					token &&
					jwtGeneration === generationAtStart
				) {
					setJwt(token);
				}
				return jwt;
			})
			.catch((err) => {
				console.warn("[auth] JWT refresh failed:", err);
				return jwt;
			})
			.finally(() => {
				jwtRefreshInFlight = null;
			});
	}
	return jwtRefreshInFlight;
}

/**
 * Better Auth client for Electron desktop app.
 *
 * Bearer authentication configured via onRequest hook.
 * Server has bearer() plugin enabled to accept bearer tokens.
 */
const remoteAuthClient = createAuthClient({
	baseURL: env.NEXT_PUBLIC_API_URL,
	plugins: [
		organizationClient({
			teams: { enabled: true },
			schema: {
				team: {
					additionalFields: {
						slug: { type: "string", input: true, required: true },
					},
				},
			},
		}),
		customSessionClient<typeof auth>(),
		stripeClient({ subscription: true }),
		apiKeyClient(),
		jwtClient(),
	],
	fetchOptions: {
		credentials: "include",
		onRequest: async (context) => {
			const token = getAuthToken();
			if (token) {
				context.headers.set("Authorization", `Bearer ${token}`);
			}
		},
		onResponse: async (context) => {
			const token = context.response.headers.get("set-auth-jwt");
			if (token) {
				setJwt(token);
			}
		},
	},
});

type SessionHookResult = ReturnType<typeof remoteAuthClient.useSession>;
type SessionData = NonNullable<SessionHookResult["data"]>;
type ActiveOrganizationHookResult = ReturnType<
	typeof remoteAuthClient.useActiveOrganization
>;

const LOCAL_USER_ID = "ea4695ed-43bc-4b31-85a1-9e67deefa301";
const LOCAL_ORGANIZATION_ID = "1887f807-99db-49c0-9568-fc085a2fd36a";
const localSession = {
	session: {
		id: "local-session",
		userId: LOCAL_USER_ID,
		createdAt: new Date(),
		updatedAt: new Date(),
		expiresAt: new Date("2999-12-31T23:59:59.999Z"),
		token: "local-token",
		ipAddress: "127.0.0.1",
		userAgent: "Superset Desktop",
		activeOrganizationId: LOCAL_ORGANIZATION_ID,
	},
	user: {
		id: LOCAL_USER_ID,
		email: "admin@local.test",
		name: "Local Admin",
		emailVerified: true,
		image: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		activeOrganizationId: LOCAL_ORGANIZATION_ID,
		onboardedAt: new Date(),
	},
} as unknown as SessionData;

const localSessionHookResult = {
	data: localSession,
	isPending: false,
	isRefetching: false,
	isLoading: false,
	error: null,
	refetch: async () => {},
} as unknown as SessionHookResult;

const localActiveOrganizationHookResult = {
	data: {
		id: LOCAL_ORGANIZATION_ID,
		name: "My Workspace",
		slug: "local-workspace",
		logo: null,
		metadata: null,
		createdAt: new Date(),
	},
	isPending: false,
	isRefetching: false,
	isLoading: false,
	error: null,
	refetch: async () => {},
} as unknown as ActiveOrganizationHookResult;

function useLocalSession(): SessionHookResult {
	return localSessionHookResult;
}

/**
 * Superset is a local single-user tool in this fork. Keep the Better Auth
 * client methods needed by legacy callers, but replace its session hook with
 * a stable local identity so rendering never depends on remote authentication.
 *
 * Better Auth itself returns a dynamic Proxy. Assigning `useSession` directly
 * does not work because that Proxy's get trap ignores properties written onto
 * its function target, so the override must live in an outer Proxy.
 */
export const authClient = new Proxy(remoteAuthClient, {
	get(target, property, receiver) {
		if (property === "useSession") return useLocalSession;
		if (property === "useActiveOrganization") {
			return () => localActiveOrganizationHookResult;
		}
		return Reflect.get(target, property, receiver);
	},
});

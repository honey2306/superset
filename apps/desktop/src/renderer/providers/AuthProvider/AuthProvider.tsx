import {
	DEV_EMAIL,
	DEV_NAME,
	DEV_PASSWORD,
} from "@superset/shared/dev-credentials";
import { type ReactNode, useEffect, useState } from "react";
import { env } from "renderer/env.renderer";
import {
	authClient,
	getAuthToken,
	setAuthToken,
	setJwt,
} from "renderer/lib/auth-client";
import { SupersetLogo } from "renderer/routes/sign-in/components/SupersetLogo/SupersetLogo";
import { electronTrpc } from "../../lib/electron-trpc";

const HYDRATION_TIMEOUT_MS = 15_000;

/**
 * Single-user setup: auto sign-in with dev credentials.
 * If dev account doesn't exist, create it first.
 */
async function performAutoLogin(): Promise<{
	token: string;
	expiresAt: string;
} | null> {
	console.log("[AuthProvider] performAutoLogin started");
	console.log("[AuthProvider] API URL:", env.NEXT_PUBLIC_API_URL);

	const postAuth = async (path: string, body: Record<string, unknown>) => {
		console.log(`[AuthProvider] POST ${path}`);
		const response = await fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "omit",
			body: JSON.stringify(body),
		});
		const data = (await response.json().catch(() => ({}))) as {
			token?: string;
			code?: string;
			message?: string;
		};
		console.log(`[AuthProvider] POST ${path} response:`, {
			ok: response.ok,
			status: response.status,
			code: data.code,
		});
		return { ok: response.ok, status: response.status, data };
	};

	try {
		let result = await postAuth("/api/auth/sign-in/email", {
			email: DEV_EMAIL,
			password: DEV_PASSWORD,
		});

		// Account doesn't exist yet - create it
		if (!result.ok && result.data.code === "INVALID_EMAIL_OR_PASSWORD") {
			console.log("[AuthProvider] Account doesn't exist, creating...");
			const signUp = await postAuth("/api/auth/sign-up/email", {
				email: DEV_EMAIL,
				password: DEV_PASSWORD,
				name: DEV_NAME,
			});
			if (!signUp.ok) {
				console.error("[AuthProvider] auto sign-up failed:", signUp.data);
				return null;
			}
			console.log("[AuthProvider] Account created, signing in...");
			result = await postAuth("/api/auth/sign-in/email", {
				email: DEV_EMAIL,
				password: DEV_PASSWORD,
			});
		}

		if (!result.ok || !result.data.token) {
			console.error("[AuthProvider] auto sign-in failed:", result.data);
			return null;
		}

		const expiresAt = new Date(
			Date.now() + 1000 * 60 * 60 * 24 * 30,
		).toISOString();
		console.log(
			"[AuthProvider] Auto sign-in successful, token:",
			`${result.data.token.substring(0, 20)}...`,
		);
		return { token: result.data.token, expiresAt };
	} catch (error) {
		console.error("[AuthProvider] auto sign-in error:", error);
		return null;
	}
}

export function AuthProvider({ children }: { children: ReactNode }) {
	const [isHydrated, setIsHydrated] = useState(false);
	const { refetch: refetchSession } = authClient.useSession();
	const persistToken = electronTrpc.auth.persistToken.useMutation();

	const { data: storedToken, isSuccess } =
		electronTrpc.auth.getStoredToken.useQuery(undefined, {
			refetchOnWindowFocus: false,
			refetchOnReconnect: false,
		});

	useEffect(() => {
		if (!isSuccess || isHydrated) return;

		let cancelled = false;

		async function fetchSessionAndJwt(tokenAtStart: string) {
			try {
				await refetchSession();
			} catch (err) {
				console.warn(
					"[AuthProvider] session refetch failed during hydration",
					err,
				);
			}
			try {
				const res = await authClient.token();
				// A response outliving the hydration timeout must not resurrect a
				// JWT after sign-out or a token change.
				if (res.data?.token && getAuthToken() === tokenAtStart) {
					setJwt(res.data.token);
				}
			} catch (err) {
				console.warn("[AuthProvider] JWT fetch failed during hydration", err);
			}
		}

		async function hydrate() {
			console.log("[AuthProvider] hydrate started, storedToken:", {
				hasToken: !!storedToken?.token,
				expiresAt: storedToken?.expiresAt,
			});

			let tokenToUse = storedToken?.token ?? null;
			let expiresAt = storedToken?.expiresAt ?? null;

			// Check if stored token is expired
			const isExpired =
				tokenToUse && expiresAt && new Date(expiresAt) < new Date();

			console.log("[AuthProvider] Token check:", {
				hasToken: !!tokenToUse,
				isExpired,
			});

			// Single-user setup: if no token or expired, auto sign-in
			if (!tokenToUse || isExpired) {
				console.log("[AuthProvider] No valid token - performing auto sign-in");
				const autoLoginResult = await performAutoLogin();
				if (autoLoginResult) {
					tokenToUse = autoLoginResult.token;
					expiresAt = autoLoginResult.expiresAt;
					console.log("[AuthProvider] Persisting auto-login token...");
					try {
						await persistToken.mutateAsync({
							token: tokenToUse,
							expiresAt,
						});
						console.log("[AuthProvider] Token persisted successfully");
					} catch (err) {
						console.warn(
							"[AuthProvider] Failed to persist auto-login token",
							err,
						);
					}
				} else {
					console.error(
						"[AuthProvider] Auto-login failed, will show sign-in page",
					);
				}
			}

			if (tokenToUse) {
				console.log(
					"[AuthProvider] Setting auth token and fetching session...",
				);
				setAuthToken(tokenToUse);
				// A hung session fetch must not hold boot on the splash forever —
				// proceed after a bound; the routes show session-pending UI (#5729).
				await Promise.race([
					fetchSessionAndJwt(tokenToUse),
					new Promise((resolve) =>
						window.setTimeout(resolve, HYDRATION_TIMEOUT_MS),
					),
				]);
			}
			if (!cancelled) {
				console.log("[AuthProvider] Hydration complete");
				setIsHydrated(true);
			}
		}

		hydrate();
		return () => {
			cancelled = true;
		};
	}, [storedToken, isSuccess, isHydrated, refetchSession, persistToken]);

	electronTrpc.auth.onTokenChanged.useSubscription(undefined, {
		onData: async (data) => {
			if (data?.token && data?.expiresAt) {
				setAuthToken(null);
				await authClient.signOut({ fetchOptions: { throw: false } });
				setAuthToken(data.token);
				try {
					await refetchSession();
				} catch (err) {
					console.warn(
						"[AuthProvider] session refetch failed after token change",
						err,
					);
				}
				setIsHydrated(true);
			} else if (data === null) {
				setAuthToken(null);
				setJwt(null);
				try {
					await refetchSession();
				} catch (err) {
					console.warn(
						"[AuthProvider] session refetch failed after token cleared",
						err,
					);
				}
			}
		},
	});

	useEffect(() => {
		if (!isHydrated) return;

		const refreshJwt = () =>
			authClient
				.token()
				.then((res) => {
					if (res.data?.token) {
						setJwt(res.data.token);
					}
				})
				.catch((err: unknown) => {
					console.warn("[AuthProvider] JWT refresh failed", err);
				});

		refreshJwt();
		const interval = setInterval(refreshJwt, 50 * 60 * 1000);
		return () => clearInterval(interval);
	}, [isHydrated]);

	if (!isHydrated) {
		return (
			<div className="flex h-screen w-screen items-center justify-center bg-background">
				<SupersetLogo className="h-8 w-auto" gradient />
			</div>
		);
	}

	return <>{children}</>;
}

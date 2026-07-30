import type { ReactNode } from "react";

/**
 * Single-user local setup: bypass all auth completely.
 * No token checks, no API calls, no session validation.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
	return <>{children}</>;
}

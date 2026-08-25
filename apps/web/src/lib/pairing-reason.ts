export type PairingNavigationState = {
	reason?: unknown;
};

export function isRevokedPairingReason(
	searchParams: URLSearchParams,
	navigationState: unknown,
): boolean {
	if (searchParams.get("reason") === "revoked") return true;
	if (!navigationState || typeof navigationState !== "object") return false;
	return (navigationState as PairingNavigationState).reason === "revoked";
}

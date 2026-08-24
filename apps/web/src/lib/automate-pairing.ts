export type PairingPathParams = { code?: string; mailboxId?: string };

/**
 * AutoMate can reopen the generic `#/pair` route after the platform has
 * stripped the mailbox path segment. Keep the mailbox from the existing
 * session in that case; a normal LAN pairing must never inherit relay state.
 */
export function getAutoMatePairingMailboxId({
	isAutoMateWebApp,
	routeMailboxId,
	storedMailboxId,
}: {
	isAutoMateWebApp: boolean;
	routeMailboxId?: string;
	storedMailboxId?: string;
}): string | undefined {
	if (!isAutoMateWebApp) return undefined;
	if (routeMailboxId) return routeMailboxId;
	if (storedMailboxId) return storedMailboxId;
	return undefined;
}

export function canRedeemPairing({
	isAutoMateWebApp,
	relayMailboxId,
}: {
	isAutoMateWebApp: boolean;
	relayMailboxId?: string;
}): boolean {
	return !isAutoMateWebApp || Boolean(relayMailboxId);
}

export function getPairingCredentials(
	searchParams: URLSearchParams,
	pathParams: PairingPathParams,
): { code: string; mailboxId: string | undefined } {
	return {
		code: searchParams.get("code") ?? pathParams.code ?? "",
		mailboxId: searchParams.get("mailboxId") ?? pathParams.mailboxId,
	};
}

function decodePathSegment(segment: string): string | undefined {
	try {
		return decodeURIComponent(segment);
	} catch {
		return undefined;
	}
}

/** Parses the path that AutoMate retains after dropping its original query. */
export function getAutoMatePairingPathParams(
	pathname: string,
): PairingPathParams {
	const segments = pathname.split("/");
	if (
		segments.length !== 6 ||
		segments[1] !== "webapp" ||
		segments[2] !== "16740" ||
		segments[3] !== "pair"
	) {
		return {};
	}

	const code = decodePathSegment(segments[4]);
	const mailboxId = decodePathSegment(segments[5]);
	return code && mailboxId ? { code, mailboxId } : {};
}

/** Parses the fragment route used by the AutoMate HashRouter WebApp. */
export function getAutoMatePairingHashParams(hash: string): PairingPathParams {
	const match = /^#\/pair\/([^/?#]+)\/([^/?#]+)$/.exec(hash);
	if (!match) return {};
	const code = decodePathSegment(match[1]);
	const mailboxId = decodePathSegment(match[2]);
	return code && mailboxId ? { code, mailboxId } : {};
}

const AUTOMATE_WEBAPP_URL = "https://automate.corp.kuaishou.com/webapp/16740";
const AUTOMATE_WEBAPP_VERSION = "acp3";

/**
 * Keep pairing credentials inside AutoMate's route parameter: the WebApp only
 * preserves that parameter when it navigates to the requested route.
 */
export function buildAutoMatePairingUrl(
	code: string,
	mailboxId: string,
): string {
	const route = `/pair/${encodeURIComponent(code)}/${encodeURIComponent(mailboxId)}`;
	const url = new URL(AUTOMATE_WEBAPP_URL);
	url.searchParams.set("v", AUTOMATE_WEBAPP_VERSION);
	url.searchParams.set("route", route);
	return url.toString();
}

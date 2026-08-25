const RELAY_UNAVAILABLE_MESSAGE =
	"The pairing service is temporarily unavailable. Check your connection and try again.";

const INVALID_CODE_MESSAGE =
	"This pairing code is invalid or has expired. Generate a new code on desktop.";

const RATE_LIMITED_MESSAGE =
	"Too many pairing attempts. Wait a minute and try again.";

export const AUTOMATE_PAIRING_LINK_REQUIRED_MESSAGE =
	"This AutoMate page needs the pairing link generated in desktop Settings → Phone access.";

function errorText(error: unknown): string {
	if (error instanceof Error) return error.message;
	return typeof error === "string" ? error : "";
}

/** Converts transport/server errors into copy safe for a phone user. */
export function getPairingErrorMessage(error: unknown): string {
	const message = errorText(error).toLowerCase();

	if (
		message.includes("too many") ||
		message.includes("rate limit") ||
		message.includes("rate_limit")
	) {
		return RATE_LIMITED_MESSAGE;
	}

	if (
		(message.includes("pairing") &&
			(message.includes("invalid") ||
				message.includes("expired") ||
				message.includes("redeemed"))) ||
		message.includes("invalid or has expired")
	) {
		return INVALID_CODE_MESSAGE;
	}

	if (
		message.includes("isolated-vm") ||
		message.includes("relay") ||
		message.includes("network") ||
		message.includes("fetch") ||
		message.includes("timeout") ||
		message.includes("timed out") ||
		message.includes("connection") ||
		message.includes("service unavailable") ||
		message.includes("internal server") ||
		/\b50[0234]\b/.test(message) ||
		message.includes("await is only valid")
	) {
		return RELAY_UNAVAILABLE_MESSAGE;
	}

	return "Pairing failed. Check the code and try again.";
}

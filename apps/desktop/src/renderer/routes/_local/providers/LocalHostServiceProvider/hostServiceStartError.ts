import { toast } from "@superset/ui/sonner";

interface HostServiceStartError {
	data?: { code?: string } | null;
	message: string;
}

interface HostServiceStartErrorHandlers {
	logError?: (...args: unknown[]) => void;
	showToast?: (
		message: string,
		options: { id: string; description: string },
	) => void;
}

/**
 * A missing token is expected while the authenticated session is persisting on
 * cold start. Other host-service startup failures should remain visible.
 */
export function handleHostServiceStartError(
	error: HostServiceStartError,
	handlers: HostServiceStartErrorHandlers = {},
): void {
	if (error.data?.code === "UNAUTHORIZED") return;

	const logError = handlers.logError ?? console.error;
	const showToast = handlers.showToast ?? toast.error;
	logError("[host-service] start failed:", error);
	showToast("Host service failed to start", {
		id: "host-service-start-failed",
		description: error.message,
	});
}

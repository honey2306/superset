export interface DirectSocketTelemetryEvent {
	kind: "degraded" | "recovered";
	socketName: string;
	/** Attempt URL without its query string — the token never leaves this module. */
	endpoint: string | null;
	closeCode: number | null;
	closeReason: string | null;
	/** Dial attempts in the current outage at emit time. */
	failedAttempts: number;
	/** Outage duration; only on `recovered`. */
	outageMs: number | null;
}

type DirectSocketTelemetrySink = (event: DirectSocketTelemetryEvent) => void;

let telemetrySink: DirectSocketTelemetrySink | null = null;

/** Install a process-wide sink for direct socket health events. */
export function setDirectSocketTelemetry(
	sink: DirectSocketTelemetrySink | null,
): void {
	telemetrySink = sink;
}

const DEGRADED_AFTER_ATTEMPTS = 5;

export interface CloseInfo {
	code: number;
	reason: string;
}

/** Collapse connection churn into one degraded/recovered outage episode. */
export function createOutageReporter(socketName: string) {
	let endpoint: string | null = null;
	let outageStartedAt: number | null = null;
	let lastClose: CloseInfo | null = null;
	let reported = false;

	const emit = (
		kind: DirectSocketTelemetryEvent["kind"],
		failedAttempts: number,
		close: CloseInfo | null,
	): void => {
		try {
			telemetrySink?.({
				kind,
				socketName,
				endpoint,
				closeCode: close?.code ?? null,
				closeReason: close?.reason || null,
				failedAttempts,
				outageMs:
					kind === "recovered" && outageStartedAt !== null
						? Date.now() - outageStartedAt
						: null,
			});
		} catch {
			// A throwing sink must never break the socket lifecycle.
		}
	};

	return {
		attempt(signedUrl: string): void {
			endpoint = signedUrl.split("?")[0] ?? null;
		},

		failed(failedAttempts: number, close?: CloseInfo): void {
			outageStartedAt ??= Date.now();
			if (close) lastClose = close;
			if (reported || failedAttempts < DEGRADED_AFTER_ATTEMPTS) return;
			reported = true;
			emit("degraded", failedAttempts, lastClose);
		},

		opened(failedAttempts: number): void {
			if (reported) emit("recovered", failedAttempts, null);
			outageStartedAt = null;
			lastClose = null;
			reported = false;
		},
	};
}

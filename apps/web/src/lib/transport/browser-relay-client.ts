export type BrowserRelayFetch = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

export const AUTOMATE_BROWSER_RELAY_REQUEST_TIMEOUT_MS = 20_000;
/** Leave headroom for the host's relay pull/ack/push operations. */
export const AUTOMATE_BROWSER_RELAY_MAX_CONCURRENT_REQUESTS = 2;
/** A transient relay failure may be attempted twice more before surfacing. */
export const AUTOMATE_BROWSER_RELAY_MAX_RETRIES = 2;
export const AUTOMATE_BROWSER_RELAY_RETRY_BASE_DELAY_MS = 250;
export const AUTOMATE_BROWSER_RELAY_RETRY_MAX_DELAY_MS = 2_000;

export type BrowserRelayClientScheduler = {
	setTimeout(callback: () => void, timeoutMs: number): unknown;
	clearTimeout(timer: unknown): void;
};

const defaultBrowserRelayClientScheduler: BrowserRelayClientScheduler = {
	setTimeout: (callback, timeoutMs) => setTimeout(callback, timeoutMs),
	clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

export type BrowserRelayClientOptions = {
	requestTimeoutMs?: number;
	maxConcurrentRequests?: number;
	/** Number of additional attempts for transient relay failures. */
	maxRetries?: number;
	/** Set to zero to keep retries immediate (or disable backoff delay). */
	retryBaseDelayMs?: number;
	retryMaxDelayMs?: number;
	scheduler?: BrowserRelayClientScheduler;
};

type PendingRun = {
	input: unknown;
	resolve: (value: unknown) => void;
	reject: (reason?: unknown) => void;
};

type ActiveRun = PendingRun & {
	controller: AbortController;
	cancelRetry?: () => void;
	cancelled: boolean;
};

/** AutoMate's authenticated server-side task bridge for WebApp 16740. */
export const AUTOMATE_BROWSER_RELAY_PATH = "/api/task/16740/run";

/**
 * Resolve the credential-free endpoint exposed by the AutoMate WebApp task.
 *
 * The phone page must never call task 16739 directly. AutoMate has to expose
 * this endpoint as a same-origin server-side proxy which holds the task
 * credential and forwards the JSON operation to the relay task. Keeping this
 * check here makes an accidentally credentialed or cross-origin build fail at
 * the browser boundary instead of silently widening the relay trust boundary.
 */
export function toAutoMateBrowserRelayUrl(
	proxyUrl: string,
	origin: string,
): string {
	let parsed: URL;
	try {
		parsed = new URL(proxyUrl, origin);
	} catch {
		throw new Error("AutoMate browser relay proxy URL is invalid");
	}

	let expectedOrigin: URL;
	try {
		expectedOrigin = new URL(origin);
	} catch {
		throw new Error("AutoMate browser relay origin is invalid");
	}

	const isHttp = parsed.protocol === "http:" || parsed.protocol === "https:";
	if (!isHttp || parsed.origin !== expectedOrigin.origin) {
		throw new Error(
			"AutoMate browser relay proxy must be a same-origin HTTP endpoint",
		);
	}
	if (parsed.username || parsed.password || parsed.search || parsed.hash) {
		throw new Error(
			"AutoMate browser relay proxy URL must not contain credentials or query data",
		);
	}
	if (parsed.pathname !== AUTOMATE_BROWSER_RELAY_PATH) {
		throw new Error(
			"The phone must use AutoMate WebApp task 16740's relay proxy",
		);
	}
	return parsed.toString();
}

type RelayRunResponse = {
	code?: unknown;
	data?: unknown;
	msg?: unknown;
};

class BrowserRelayRequestError extends Error {
	constructor(
		message: string,
		readonly retryable: boolean,
	) {
		super(message);
		this.name = "BrowserRelayRequestError";
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function responseMessage(payload: unknown): string | undefined {
	if (!isRecord(payload)) return undefined;
	return typeof payload.message === "string" ? payload.message : undefined;
}

function isSuccessfulCode(code: unknown): boolean {
	return (
		code === undefined ||
		code === 0 ||
		code === "0" ||
		code === 200 ||
		code === "200"
	);
}

function normalizeConcurrency(value: number | undefined): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		return AUTOMATE_BROWSER_RELAY_MAX_CONCURRENT_REQUESTS;
	}
	return Math.max(1, Math.floor(value));
}

function normalizeRetries(value: number | undefined): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return AUTOMATE_BROWSER_RELAY_MAX_RETRIES;
	}
	return Math.max(0, Math.floor(value));
}

function normalizeDelay(value: number | undefined, fallback: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	return Math.max(0, value);
}

function isTransientStatus(status: number): boolean {
	return status === 429 || (status >= 500 && status <= 599);
}

/**
 * Browser-side client for the AutoMate WebApp server-side relay proxy.
 *
 * Its request intentionally contains only the mailbox operation. The
 * AutoMate task token is held by the proxy/task runtime and is never sent as a
 * URL, header, cookie value, or JSON field by this client.
 */
export class AutoMateBrowserRelayClient {
	private readonly endpoint: string;
	private readonly requestTimeoutMs: number;
	private readonly maxConcurrentRequests: number;
	private readonly maxRetries: number;
	private readonly retryBaseDelayMs: number;
	private readonly retryMaxDelayMs: number;
	private readonly scheduler: BrowserRelayClientScheduler;
	private readonly queue: PendingRun[] = [];
	private readonly activeRuns = new Set<ActiveRun>();
	private activeRequests = 0;
	private closed = false;

	constructor(
		proxyUrl: string,
		private readonly fetchImpl: BrowserRelayFetch = fetch,
		origin = typeof location === "undefined"
			? "http://localhost"
			: location.origin,
		options: BrowserRelayClientOptions = {},
	) {
		this.endpoint = toAutoMateBrowserRelayUrl(proxyUrl, origin);
		this.requestTimeoutMs =
			options.requestTimeoutMs ?? AUTOMATE_BROWSER_RELAY_REQUEST_TIMEOUT_MS;
		this.maxConcurrentRequests = normalizeConcurrency(
			options.maxConcurrentRequests,
		);
		this.maxRetries = normalizeRetries(options.maxRetries);
		this.retryBaseDelayMs = normalizeDelay(
			options.retryBaseDelayMs,
			AUTOMATE_BROWSER_RELAY_RETRY_BASE_DELAY_MS,
		);
		this.retryMaxDelayMs = normalizeDelay(
			options.retryMaxDelayMs,
			AUTOMATE_BROWSER_RELAY_RETRY_MAX_DELAY_MS,
		);
		this.scheduler = options.scheduler ?? defaultBrowserRelayClientScheduler;
	}

	run(input: unknown): Promise<unknown> {
		if (this.closed) {
			return Promise.reject(new Error("AutoMate browser relay client closed"));
		}
		return new Promise((resolve, reject) => {
			this.queue.push({ input, resolve, reject });
			this.drain();
		});
	}

	close(): void {
		this.closed = true;
		const error = new Error("AutoMate browser relay client closed");
		for (const pending of this.queue) pending.reject(error);
		this.queue.length = 0;
		for (const active of this.activeRuns) {
			active.cancelled = true;
			active.cancelRetry?.();
			active.cancelRetry = undefined;
			active.controller.abort();
			active.reject(error);
		}
	}

	private drain(): void {
		while (
			!this.closed &&
			this.activeRequests < this.maxConcurrentRequests &&
			this.queue.length > 0
		) {
			const pending = this.queue.shift();
			if (!pending) return;
			this.activeRequests += 1;
			const active: ActiveRun = {
				...pending,
				controller: new AbortController(),
				cancelled: false,
			};
			this.activeRuns.add(active);
			void this.execute(active)
				.then(active.resolve, active.reject)
				.finally(() => {
					this.activeRuns.delete(active);
					this.activeRequests -= 1;
					this.drain();
				});
		}
	}

	private async execute(active: ActiveRun): Promise<unknown> {
		// Serialize once so every retry carries the exact same operation body.
		const body = JSON.stringify({ type: "api", relay: active.input });
		let retryCount = 0;

		while (true) {
			if (this.closed || active.cancelled) {
				throw new Error("AutoMate browser relay client closed");
			}

			try {
				const request = this.executeRequest(body, active.controller.signal);
				return await this.withTimeout(
					request,
					() => active.controller.abort(),
					active.controller.signal,
				);
			} catch (error) {
				if (this.closed || active.cancelled) {
					throw new Error("AutoMate browser relay client closed");
				}
				if (
					!(error instanceof BrowserRelayRequestError) ||
					!error.retryable ||
					retryCount >= this.maxRetries
				) {
					throw error;
				}

				const delay = Math.min(
					this.retryMaxDelayMs,
					this.retryBaseDelayMs * 2 ** retryCount,
				);
				retryCount += 1;
				await this.waitForRetry(active, delay);
			}
		}
	}

	private async executeRequest(
		body: string,
		signal: AbortSignal,
	): Promise<unknown> {
		let response: Response;
		try {
			response = await this.fetchImpl(this.endpoint, {
				method: "POST",
				credentials: "same-origin",
				headers: { "content-type": "application/json" },
				body,
				signal,
			});
		} catch {
			if (signal.aborted) {
				throw new BrowserRelayRequestError(
					"AutoMate browser relay proxy request aborted",
					false,
				);
			}
			throw new BrowserRelayRequestError(
				"AutoMate browser relay proxy request failed",
				true,
			);
		}

		let payload: unknown;
		try {
			payload = await response.json();
		} catch {
			throw new BrowserRelayRequestError(
				"AutoMate browser relay proxy returned invalid JSON",
				response.ok || isTransientStatus(response.status),
			);
		}
		if (!response.ok) {
			throw new BrowserRelayRequestError(
				"AutoMate browser relay proxy request failed",
				isTransientStatus(response.status),
			);
		}
		if (!isRecord(payload)) {
			throw new BrowserRelayRequestError(
				"AutoMate browser relay proxy request failed",
				false,
			);
		}

		const result = payload as RelayRunResponse;
		if (!isSuccessfulCode(result.code)) {
			throw new BrowserRelayRequestError(
				responseMessage(result.data) ??
					(typeof result.msg === "string" ? result.msg : undefined) ??
					"AutoMate browser relay operation failed",
				false,
			);
		}
		// AutoMate's task runner returns either the task result directly or wraps
		// it in `data`, depending on the WebApp API response envelope.
		return result.data || payload;
	}

	private waitForRetry(active: ActiveRun, delayMs: number): Promise<void> {
		if (this.closed || active.cancelled) {
			return Promise.reject(new Error("AutoMate browser relay client closed"));
		}
		if (delayMs <= 0) return Promise.resolve();

		return new Promise<void>((resolve, reject) => {
			let settled = false;
			const timer = this.scheduler.setTimeout(() => {
				if (settled) return;
				settled = true;
				this.scheduler.clearTimeout(timer);
				active.cancelRetry = undefined;
				resolve();
			}, delayMs);
			active.cancelRetry = () => {
				if (settled) return;
				settled = true;
				this.scheduler.clearTimeout(timer);
				active.cancelRetry = undefined;
				reject(new Error("AutoMate browser relay client closed"));
			};
		});
	}

	private withTimeout<T>(
		promise: Promise<T>,
		onTimeout: () => void,
		signal: AbortSignal,
	): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			let settled = false;
			const onAbort = () => {
				if (settled) return;
				settled = true;
				this.scheduler.clearTimeout(timer);
				signal.removeEventListener("abort", onAbort);
				reject(new Error("AutoMate browser relay proxy request aborted"));
			};
			const timer = this.scheduler.setTimeout(() => {
				if (settled) return;
				settled = true;
				this.scheduler.clearTimeout(timer);
				signal.removeEventListener("abort", onAbort);
				onTimeout();
				reject(new Error("AutoMate browser relay proxy request timed out"));
			}, this.requestTimeoutMs);
			signal.addEventListener("abort", onAbort, { once: true });
			promise.then(
				(value) => {
					if (settled) return;
					settled = true;
					this.scheduler.clearTimeout(timer);
					signal.removeEventListener("abort", onAbort);
					resolve(value);
				},
				(error) => {
					if (settled) return;
					settled = true;
					this.scheduler.clearTimeout(timer);
					signal.removeEventListener("abort", onAbort);
					reject(error);
				},
			);
		});
	}
}

export function createDefaultAutoMateBrowserRelayClient(
	proxyUrl: string,
	fetchImpl?: BrowserRelayFetch,
	options?: BrowserRelayClientOptions,
): AutoMateBrowserRelayClient {
	return new AutoMateBrowserRelayClient(
		proxyUrl,
		fetchImpl,
		undefined,
		options,
	);
}

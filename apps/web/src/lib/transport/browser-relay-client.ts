export type BrowserRelayFetch = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

export const AUTOMATE_BROWSER_RELAY_REQUEST_TIMEOUT_MS = 20_000;

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
	scheduler?: BrowserRelayClientScheduler;
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
	private readonly scheduler: BrowserRelayClientScheduler;
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
		this.scheduler = options.scheduler ?? defaultBrowserRelayClientScheduler;
	}

	run(input: unknown): Promise<unknown> {
		if (this.closed) {
			return Promise.reject(new Error("AutoMate browser relay client closed"));
		}
		return this.execute(input);
	}

	close(): void {
		this.closed = true;
	}

	private async execute(input: unknown): Promise<unknown> {
		const controller = new AbortController();
		const request = this.executeRequest(input, controller.signal);
		return this.withTimeout(request, () => controller.abort());
	}

	private async executeRequest(
		input: unknown,
		signal: AbortSignal,
	): Promise<unknown> {
		let response: Response;
		try {
			response = await this.fetchImpl(this.endpoint, {
				method: "POST",
				credentials: "same-origin",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ type: "api", relay: input }),
				signal,
			});
		} catch {
			throw new Error("AutoMate browser relay proxy request failed");
		}

		let payload: unknown;
		try {
			payload = await response.json();
		} catch {
			throw new Error("AutoMate browser relay proxy returned invalid JSON");
		}
		if (!response.ok || !isRecord(payload)) {
			throw new Error("AutoMate browser relay proxy request failed");
		}

		const result = payload as RelayRunResponse;
		if (!isSuccessfulCode(result.code)) {
			throw new Error(
				responseMessage(result.data) ??
					(typeof result.msg === "string" ? result.msg : undefined) ??
					"AutoMate browser relay operation failed",
			);
		}
		// AutoMate's task runner returns either the task result directly or wraps
		// it in `data`, depending on the WebApp API response envelope.
		return result.data || payload;
	}

	private withTimeout<T>(
		promise: Promise<T>,
		onTimeout: () => void,
	): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			let settled = false;
			const timer = this.scheduler.setTimeout(() => {
				if (settled) return;
				settled = true;
				this.scheduler.clearTimeout(timer);
				onTimeout();
				reject(new Error("AutoMate browser relay proxy request timed out"));
			}, this.requestTimeoutMs);
			promise.then(
				(value) => {
					if (settled) return;
					settled = true;
					this.scheduler.clearTimeout(timer);
					resolve(value);
				},
				(error) => {
					if (settled) return;
					settled = true;
					this.scheduler.clearTimeout(timer);
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

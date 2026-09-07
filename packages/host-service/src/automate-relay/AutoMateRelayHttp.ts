import type { RelayTaskClient } from "./AutoMateRelay";

export type RelayFetch = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

export const AUTOMATE_RELAY_HTTP_REQUEST_TIMEOUT_MS = 5_000;
export const AUTOMATE_RELAY_HTTP_MAX_RETRIES = 2;
export const AUTOMATE_RELAY_HTTP_RETRY_DELAY_MS = 250;
export const AUTOMATE_RELAY_HTTP_MAX_CONCURRENT_REQUESTS = 4;

export type AutoMateRelayHttpTaskClientOptions = {
	/** Per-attempt deadline. The task endpoint must never hold a Host forever. */
	requestTimeoutMs?: number;
	/** Number of retries after the initial request. */
	maxRetries?: number;
	/** Base delay between retries; attempts use exponential backoff. */
	retryDelayMs?: number;
	/** Upper bound on calls in flight, including long-poll operations. */
	maxConcurrentRequests?: number;
	/** Injectable for deterministic tests and controlled shutdowns. */
	sleep?: (ms: number) => Promise<void>;
};

export type AutoMateRunRequest = {
	url: string;
	token: string;
};

/** Convert the legacy task URL without ever putting its token in the target URL. */
export function toAutoMateRunRequest(relayUrl: string): AutoMateRunRequest {
	let parsed: URL;
	try {
		parsed = new URL(relayUrl);
	} catch {
		throw new Error("AutoMate relay URL is invalid");
	}
	if (parsed.protocol !== "wss:" || parsed.username || parsed.password) {
		throw new Error("AutoMate relay URL must be a credential-free wss:// URL");
	}
	const tokens = parsed.searchParams.getAll("token");
	const token = tokens.length === 1 ? tokens[0] : undefined;
	if (!token) throw new Error("AutoMate relay URL is missing its task token");
	const wsSuffix = "/ws";
	if (!parsed.pathname.endsWith(wsSuffix)) {
		throw new Error("AutoMate relay URL path must end in /ws");
	}

	parsed.protocol = "https:";
	parsed.pathname = `${parsed.pathname.slice(0, -wsSuffix.length)}/run`;
	parsed.search = "";
	parsed.hash = "";
	return { url: parsed.toString(), token };
}

type RelayRunResponse = {
	code?: unknown;
	data?: unknown;
	msg?: unknown;
};

type PendingRequest = {
	input: unknown;
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
};

class RetryableRelayError extends Error {
	constructor(
		message: string,
		readonly retryable: boolean,
	) {
		super(message);
	}
}

class RelayRequestTimeoutError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function redactToken(message: string, token: string): string {
	return message.replaceAll(token, "[redacted]").slice(0, 256);
}

function normalizeContentType(response: Response): string {
	const value = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
	return value ? value.toLowerCase().slice(0, 64) : "unknown";
}

/** Classify a response without copying any response bytes into logs/errors. */
function classifyResponseBody(body: string, contentType: string): string {
	if (!body) return "empty";
	if (
		contentType.includes("html") ||
		/^\s*<!doctype\s+html\b/i.test(body) ||
		/^\s*<html\b/i.test(body)
	)
		return "html";
	if (contentType.includes("json")) return "json";
	const first = body.trimStart()[0];
	if (first === "[" || first === "{") return "json-like";
	if (contentType.startsWith("text/")) return "text";
	return "binary";
}

function transientHttpStatus(status: number): boolean {
	return status === 429 || status >= 500;
}

function positiveInteger(value: number | undefined, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? Math.floor(value)
		: fallback;
}

function nonNegativeInteger(
	value: number | undefined,
	fallback: number,
): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? Math.floor(value)
		: fallback;
}

/** HTTP `/run` adapter for AutoMate task 16739. */
export class AutoMateRelayHttpTaskClient implements RelayTaskClient {
	private readonly runUrl: string;
	private readonly taskToken: string;
	private readonly requestTimeoutMs: number;
	private readonly maxRetries: number;
	private readonly retryDelayMs: number;
	private readonly maxConcurrentRequests: number;
	private readonly sleep: (ms: number) => Promise<void>;
	private readonly queue: PendingRequest[] = [];
	private readonly activeControllers = new Set<AbortController>();
	private readonly closeSignal: Promise<void>;
	private resolveCloseSignal: (() => void) | undefined;
	private activeRequests = 0;
	private closed = false;

	constructor(
		relayUrl: string,
		private readonly fetchImpl: RelayFetch = fetch,
		options: AutoMateRelayHttpTaskClientOptions = {},
	) {
		this.closeSignal = new Promise<void>((resolve) => {
			this.resolveCloseSignal = resolve;
		});
		const request = toAutoMateRunRequest(relayUrl);
		this.runUrl = request.url;
		this.taskToken = request.token;
		this.requestTimeoutMs = positiveInteger(
			options.requestTimeoutMs,
			AUTOMATE_RELAY_HTTP_REQUEST_TIMEOUT_MS,
		);
		this.maxRetries = nonNegativeInteger(
			options.maxRetries,
			AUTOMATE_RELAY_HTTP_MAX_RETRIES,
		);
		this.retryDelayMs = nonNegativeInteger(
			options.retryDelayMs,
			AUTOMATE_RELAY_HTTP_RETRY_DELAY_MS,
		);
		this.maxConcurrentRequests = positiveInteger(
			options.maxConcurrentRequests,
			AUTOMATE_RELAY_HTTP_MAX_CONCURRENT_REQUESTS,
		);
		this.sleep =
			options.sleep ??
			((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
	}

	request(input: unknown): Promise<unknown> {
		if (this.closed) {
			return Promise.reject(new Error("AutoMate relay client closed"));
		}
		return new Promise((resolve, reject) => {
			this.queue.push({ input, resolve, reject });
			this.drain();
		});
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.resolveCloseSignal?.();
		const closed = new Error("AutoMate relay client closed");
		for (const pending of this.queue) pending.reject(closed);
		this.queue.length = 0;
		for (const controller of this.activeControllers) controller.abort();
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
			void this.execute(pending.input)
				.then(pending.resolve, pending.reject)
				.finally(() => {
					this.activeRequests -= 1;
					this.drain();
				});
		}
	}

	private async execute(input: unknown): Promise<unknown> {
		let body: string | undefined;
		try {
			body = JSON.stringify(input);
		} catch {
			throw new Error("AutoMate relay request payload is not serializable");
		}
		if (body === undefined)
			throw new Error("AutoMate relay request payload is not serializable");

		let lastError: Error | undefined;
		for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
			if (this.closed) throw new Error("AutoMate relay client closed");
			try {
				return await this.executeAttempt(body);
			} catch (caught: unknown) {
				const error =
					caught instanceof Error ? caught : new Error(String(caught));
				lastError = error;
				const retryable =
					error instanceof RetryableRelayError && error.retryable;
				if (!retryable || attempt >= this.maxRetries || this.closed)
					throw error;
				await this.wait(this.retryDelayMs * 2 ** attempt);
			}
		}
		throw lastError ?? new Error("AutoMate relay request failed");
	}

	private async wait(ms: number): Promise<void> {
		await Promise.race([this.sleep(ms), this.closeSignal]);
	}

	private async executeAttempt(body: string): Promise<unknown> {
		const { response, rawBody } = await this.fetchWithTimeout(body);
		const status = response.status;
		const contentType = normalizeContentType(response);

		let payload: unknown;
		try {
			payload = JSON.parse(rawBody);
		} catch {
			throw new RetryableRelayError(
				`AutoMate relay returned invalid JSON (status=${status}, content-type=${contentType}, response=${classifyResponseBody(rawBody, contentType)})`,
				response.ok || transientHttpStatus(status),
			);
		}

		if (!response.ok) {
			throw new RetryableRelayError(
				`AutoMate relay HTTP request failed (status=${status}, content-type=${contentType}, response=${classifyResponseBody(rawBody, contentType)})`,
				transientHttpStatus(status),
			);
		}
		if (!isRecord(payload)) {
			throw new Error(
				`AutoMate relay returned an invalid response (status=${status}, content-type=${contentType}, response=${classifyResponseBody(rawBody, contentType)})`,
			);
		}

		const result = payload as RelayRunResponse;
		if (
			result.code !== 0 &&
			result.code !== "0" &&
			result.code !== 200 &&
			result.code !== "200"
		) {
			const message =
				typeof result.msg === "string"
					? redactToken(result.msg, this.taskToken)
					: "";
			throw new Error(
				message
					? `AutoMate relay request failed: ${message}`
					: `AutoMate relay request failed (status=${status}, content-type=${contentType}, response=json)`,
			);
		}
		if (!("data" in result)) {
			throw new Error(
				`AutoMate relay response is missing data (status=${status}, content-type=${contentType}, response=json)`,
			);
		}
		return result.data;
	}

	private async fetchWithTimeout(
		body: string,
	): Promise<{ response: Response; rawBody: string }> {
		const controller = new AbortController();
		this.activeControllers.add(controller);
		let timedOut = false;
		let response: Response | undefined;
		let bodyReadFailed = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<never>((_resolve, reject) => {
			timer = setTimeout(() => {
				timedOut = true;
				controller.abort();
				reject(new RelayRequestTimeoutError());
			}, this.requestTimeoutMs);
		});
		try {
			return await Promise.race([
				(async () => {
					const fetchedResponse = await this.fetchImpl(this.runUrl, {
						method: "POST",
						headers: {
							"content-type": "application/json",
							"x-am-task-token": this.taskToken,
						},
						body,
						signal: controller.signal,
					});
					response = fetchedResponse;
					try {
						return {
							response: fetchedResponse,
							rawBody: await fetchedResponse.text(),
						};
					} catch (error) {
						bodyReadFailed = true;
						throw error;
					}
				})(),
				timeout,
				this.closeSignal.then(() => {
					throw new Error("AutoMate relay client closed");
				}),
			]);
		} catch (caught: unknown) {
			if (this.closed) throw new Error("AutoMate relay client closed");
			if (timedOut || caught instanceof RelayRequestTimeoutError) {
				throw new RetryableRelayError(
					`AutoMate relay HTTP request timed out after ${this.requestTimeoutMs}ms`,
					true,
				);
			}
			if (bodyReadFailed && response) {
				const status = response.status;
				const contentType = normalizeContentType(response);
				throw new RetryableRelayError(
					`AutoMate relay response could not be read (status=${status}, content-type=${contentType}, response=unreadable)`,
					response.ok || transientHttpStatus(status),
				);
			}
			throw new RetryableRelayError(
				"AutoMate relay HTTP request failed (network/body read error)",
				true,
			);
		} finally {
			if (timer !== undefined) clearTimeout(timer);
			this.activeControllers.delete(controller);
		}
	}
}

export function createDefaultAutoMateRelayTaskClient(
	relayUrl: string,
	fetchImpl?: RelayFetch,
	options?: AutoMateRelayHttpTaskClientOptions,
): RelayTaskClient {
	return new AutoMateRelayHttpTaskClient(relayUrl, fetchImpl, options);
}

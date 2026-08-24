export type RelayFetch = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;

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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function redactToken(message: string, token: string): string {
	return message.replaceAll(token, "[redacted]").slice(0, 256);
}

/** HTTP `/run` adapter for AutoMate task 16739. */
export class AutoMateHttpTaskClient {
	private readonly runUrl: string;
	private readonly taskToken: string;
	private closed = false;

	constructor(
		relayUrl: string,
		private readonly fetchImpl: RelayFetch = fetch,
	) {
		const request = toAutoMateRunRequest(relayUrl);
		this.runUrl = request.url;
		this.taskToken = request.token;
	}

	run(input: unknown): Promise<unknown> {
		if (this.closed) {
			return Promise.reject(new Error("AutoMate relay client closed"));
		}
		return this.execute(input);
	}

	close(): void {
		this.closed = true;
	}

	private async execute(input: unknown): Promise<unknown> {
		let response: Response;
		try {
			response = await this.fetchImpl(this.runUrl, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-am-task-token": this.taskToken,
				},
				body: JSON.stringify(input),
			});
		} catch {
			throw new Error("AutoMate relay HTTP request failed");
		}

		let payload: unknown;
		try {
			payload = await response.json();
		} catch {
			throw new Error("AutoMate relay returned invalid JSON");
		}
		if (!response.ok) {
			throw new Error(
				`AutoMate relay HTTP request failed (${response.status})`,
			);
		}
		if (!isRecord(payload)) {
			throw new Error("AutoMate relay returned an invalid response");
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
					: "AutoMate relay request failed",
			);
		}
		if (!("data" in result)) {
			throw new Error("AutoMate relay response is missing data");
		}
		return result.data;
	}
}

export function createDefaultAutoMateTaskClient(
	relayUrl: string,
	fetchImpl?: RelayFetch,
): AutoMateHttpTaskClient {
	return new AutoMateHttpTaskClient(relayUrl, fetchImpl);
}

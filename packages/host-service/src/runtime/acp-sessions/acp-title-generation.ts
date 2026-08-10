import { spawn } from "node:child_process";

/**
 * With a pinned small model (`MFCLI_TITLE_MODEL`), `utils.summarizeMessage`
 * finishes in ~4-6s on warm PATH. On the first invocation the mfcli boot
 * adds ~700ms. 30s leaves comfortable headroom for a network hiccup while
 * still bounding the wait — the generation is fire-and-forget from the
 * caller's perspective (see `AcpSessionManager.maybeStartTitleGeneration`),
 * so a longer wait only delays the title landing — never the user's turn.
 */
const GENERATE_TIMEOUT_MS = 30_000;

/** Overridable so packaged/dev builds can point at a specific mfcli binary. */
const MFCLI_COMMAND = process.env.SUPERSET_MFCLI_TITLE_COMMAND ?? "mfcli";

/**
 * Pinning a specific small model keeps the summarizer honest about the JSON
 * schema `utils.summarizeMessage` asks for. `wanqing/auto` routes to a heavy
 * model that ignores the response format and replies to the user's question
 * verbatim — the fenced ```json``` output we relied on was a coincidence.
 * DeepSeek V4 Flash respects the schema and returns strict `{"title": "..."}`.
 * Override via env var when your mfcli install has a different provider.
 */
const MFCLI_TITLE_MODEL =
	process.env.SUPERSET_MFCLI_TITLE_MODEL ?? "wanqing/deepseek-v4-flash";

/**
 * Cap the message shipped to `mfcli` so pathological pastes (100k-token
 * prompts) don't blow argv limits or generate a wildly off-topic title from
 * the tail of the input. The summarizer only needs the first few sentences.
 */
const MAX_MESSAGE_BYTES = 4_096;

/**
 * Ask `mfcli call utils.summarizeMessage` for a short, human-friendly session
 * title. Returns null when `mfcli` is not installed, the call errors, times
 * out, or produces an empty string — callers must treat null as "leave the
 * session titleless" (the renderer falls back to the agent label).
 *
 * We shell out to `mfcli` rather than reusing `getSmallModel` because the
 * myflicker CLI already owns the user's low-cost model credentials, and the
 * host-service daemon has no independent OAuth to Anthropic/OpenAI in the
 * OAuth-only setups (ChatGPT sign-in flow).
 */
export async function generateAcpSessionTitle(
	message: string,
): Promise<string | null> {
	const trimmed = message.trim();
	if (!trimmed) return null;
	const truncated =
		trimmed.length > MAX_MESSAGE_BYTES
			? trimmed.slice(0, MAX_MESSAGE_BYTES)
			: trimmed;

	try {
		const raw = await runMfcliSummarize(truncated, GENERATE_TIMEOUT_MS);
		const title = parseSummarizeOutput(raw);
		return title;
	} catch (error) {
		console.warn("[acp-title-generation] generation failed:", error);
		return null;
	}
}

/**
 * Build the `--data` payload sent to `mfcli call utils.summarizeMessage`.
 * Kept exported so tests can pin the exact shape.
 */
export function buildMfcliDataPayload(message: string): string {
	return JSON.stringify({ message, model: MFCLI_TITLE_MODEL });
}

function runMfcliSummarize(
	message: string,
	timeoutMs: number,
): Promise<string> {
	return new Promise((resolve, reject) => {
		let child: ReturnType<typeof spawn>;
		try {
			child = spawn(
				MFCLI_COMMAND,
				[
					"call",
					"utils.summarizeMessage",
					"--data",
					buildMfcliDataPayload(message),
				],
				{ stdio: ["ignore", "pipe", "pipe"] },
			);
		} catch (error) {
			reject(error instanceof Error ? error : new Error(String(error)));
			return;
		}

		let stdout = "";
		let stderr = "";
		let settled = false;
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			try {
				child.kill("SIGTERM");
			} catch {
				// best-effort — the child may already be dead
			}
			reject(new Error(`mfcli summarize timed out after ${timeoutMs}ms`));
		}, timeoutMs);

		child.stdout?.on("data", (chunk: Buffer | string) => {
			stdout += typeof chunk === "string" ? chunk : chunk.toString("utf8");
		});
		child.stderr?.on("data", (chunk: Buffer | string) => {
			stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
		});
		child.on("error", (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			reject(error);
		});
		child.on("close", (code) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (code !== 0) {
				const detail = stderr.trim() || "(no stderr)";
				reject(new Error(`mfcli exited ${code}: ${detail}`));
				return;
			}
			resolve(stdout);
		});
	});
}

/**
 * Parse `mfcli call utils.summarizeMessage` output. It emits a JSON envelope
 * `{"success":true,"data":{"text":"..."}}` where `text` is meant to be a
 * ```json\n{"title":"..."}\n``` fenced block. When the pinned small model
 * respects the schema this is exact; when it doesn't (e.g. a chatty model
 * that ignores `responseFormat` and replies to the user's prompt directly),
 * we return null so the tab falls back to the agent label rather than
 * writing the model's reply into the tab strip.
 */
export function parseSummarizeOutput(raw: string): string | null {
	let envelope: unknown;
	try {
		envelope = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!isObjectRecord(envelope)) return null;
	if (envelope.success !== true) return null;
	if (!isObjectRecord(envelope.data)) return null;
	const text = envelope.data.text;
	if (typeof text !== "string") return null;

	// Strip a leading ```json / ``` fence and trailing ``` if present. Handles
	// both inline (```json{...}```) and multi-line variants.
	const unfenced = text
		.replace(/^\s*```(?:json)?\s*\n?/i, "")
		.replace(/\n?\s*```\s*$/i, "")
		.trim();
	if (!unfenced) return null;

	// Strict: mfcli asks the model for `{"title": "..."}` and includes a JSON
	// schema. If we can't parse that shape, the model went off-script (it may
	// have answered the user's question verbatim); returning null lets the tab
	// fall back to the agent label instead of writing the reply into the strip.
	try {
		const parsed: unknown = JSON.parse(unfenced);
		if (isObjectRecord(parsed) && typeof parsed.title === "string") {
			const title = parsed.title.trim();
			return title || null;
		}
	} catch {
		// Not JSON — fall through to null.
	}
	return null;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

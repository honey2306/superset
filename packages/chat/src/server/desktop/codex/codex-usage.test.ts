import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	findLatestCodexRollout,
	getCodexUsage,
	readLatestRateLimits,
} from "./codex-usage";

let workDir: string;

async function makeRollout(
	relativePath: string,
	lines: string[],
	mtime?: Date,
): Promise<string> {
	const full = join(workDir, relativePath);
	await fs.mkdir(join(full, ".."), { recursive: true });
	await fs.writeFile(full, `${lines.join("\n")}\n`, "utf8");
	if (mtime) await fs.utimes(full, mtime, mtime);
	return full;
}

function rateLimitEvent(
	timestamp: string,
	usedPercent: number,
	options: {
		resetsAt?: number;
		planType?: string;
		balance?: string;
	} = {},
): string {
	return JSON.stringify({
		timestamp,
		type: "event_msg",
		payload: {
			type: "token_count",
			info: {
				total_token_usage: {
					input_tokens: 0,
					cached_input_tokens: 0,
					cache_write_input_tokens: 0,
					output_tokens: 0,
					reasoning_output_tokens: 0,
					total_tokens: 0,
				},
				last_token_usage: {
					input_tokens: 0,
					cached_input_tokens: 0,
					cache_write_input_tokens: 0,
					output_tokens: 0,
					reasoning_output_tokens: 0,
					total_tokens: 0,
				},
				model_context_window: 258400,
			},
			rate_limits: {
				limit_id: "codex",
				limit_name: null,
				primary: {
					used_percent: usedPercent,
					window_minutes: 10080,
					resets_at: options.resetsAt ?? 1786504313,
				},
				secondary: null,
				credits: {
					has_credits: false,
					unlimited: false,
					balance: options.balance ?? "0",
				},
				individual_limit: null,
				spend_control_reached: null,
				plan_type: options.planType ?? "pro",
				rate_limit_reached_type: null,
			},
		},
	});
}

beforeEach(async () => {
	workDir = await fs.mkdtemp(join(tmpdir(), "codex-usage-"));
});

afterEach(async () => {
	await fs.rm(workDir, { recursive: true, force: true });
});

describe("findLatestCodexRollout", () => {
	it("returns null for a missing sessions dir", async () => {
		const missing = join(workDir, "does-not-exist");
		expect(await findLatestCodexRollout(missing)).toBeNull();
	});

	it("returns null when the sessions dir has no rollouts", async () => {
		await fs.mkdir(join(workDir, "2026/08/09"), { recursive: true });
		expect(await findLatestCodexRollout(workDir)).toBeNull();
	});

	it("picks the rollout with the newest mtime across nested day dirs", async () => {
		const older = await makeRollout(
			"2026/07/25/rollout-old.jsonl",
			[rateLimitEvent("2026-07-25T12:00:00.000Z", 20)],
			new Date("2026-07-25T12:00:00Z"),
		);
		const newer = await makeRollout(
			"2026/08/07/rollout-new.jsonl",
			[rateLimitEvent("2026-08-07T15:00:00.000Z", 40)],
			new Date("2026-08-07T15:00:00Z"),
		);
		expect(await findLatestCodexRollout(workDir)).toBe(newer);
		expect(older).not.toBe(newer);
	});
});

describe("readLatestRateLimits", () => {
	it("returns the last rate_limits event in the file", async () => {
		const path = await makeRollout("2026/08/09/rollout-a.jsonl", [
			rateLimitEvent("2026-08-09T10:00:00.000Z", 11, { planType: "plus" }),
			rateLimitEvent("2026-08-09T10:05:00.000Z", 12, { planType: "plus" }),
			rateLimitEvent("2026-08-09T10:10:00.000Z", 15, { planType: "pro" }),
		]);
		const result = await readLatestRateLimits(path);
		expect(result.available).toBe(true);
		if (!result.available) return;
		expect(result.primary.usedPercent).toBe(15);
		expect(result.planType).toBe("pro");
		expect(result.sourceFile).toBe(path);
		expect(result.observedAt).toBe(Date.parse("2026-08-09T10:10:00.000Z"));
	});

	it("skips non-rate-limit event lines and malformed JSON", async () => {
		const path = await makeRollout("2026/08/09/rollout-b.jsonl", [
			'{"timestamp":"2026-08-09T09:00:00.000Z","type":"session_meta","payload":{"session_id":"x"}}',
			"{this is not valid json",
			rateLimitEvent("2026-08-09T09:30:00.000Z", 42),
			'{"timestamp":"2026-08-09T09:31:00.000Z","type":"event_msg","payload":{"type":"agent_message","message":"hi"}}',
		]);
		const result = await readLatestRateLimits(path);
		expect(result.available).toBe(true);
		if (!result.available) return;
		expect(result.primary.usedPercent).toBe(42);
	});

	it("returns no-rate-limit-events when the file has none", async () => {
		const path = await makeRollout("2026/08/09/rollout-c.jsonl", [
			'{"timestamp":"2026-08-09T09:00:00.000Z","type":"session_meta","payload":{"session_id":"x"}}',
		]);
		const result = await readLatestRateLimits(path);
		expect(result.available).toBe(false);
		if (result.available) return;
		expect(result.reason).toBe("no-rate-limit-events");
	});

	it("returns unreadable when the file does not exist", async () => {
		const result = await readLatestRateLimits(join(workDir, "nope.jsonl"));
		expect(result.available).toBe(false);
		if (result.available) return;
		expect(result.reason).toBe("unreadable");
	});
});

describe("getCodexUsage", () => {
	it("returns no-rollouts when the sessions dir is missing", async () => {
		const result = await getCodexUsage(join(workDir, "gone"));
		expect(result.available).toBe(false);
		if (result.available) return;
		expect(result.reason).toBe("no-rollouts");
	});

	it("reads the newest rollout's last rate_limits", async () => {
		await makeRollout(
			"2026/08/01/rollout-old.jsonl",
			[rateLimitEvent("2026-08-01T00:00:00.000Z", 5)],
			new Date("2026-08-01T00:00:00Z"),
		);
		await makeRollout(
			"2026/08/09/rollout-new.jsonl",
			[
				rateLimitEvent("2026-08-09T09:00:00.000Z", 50),
				rateLimitEvent("2026-08-09T10:00:00.000Z", 75, { planType: "plus" }),
			],
			new Date("2026-08-09T10:00:00Z"),
		);
		const result = await getCodexUsage(workDir);
		expect(result.available).toBe(true);
		if (!result.available) return;
		expect(result.primary.usedPercent).toBe(75);
		expect(result.planType).toBe("plus");
	});
});

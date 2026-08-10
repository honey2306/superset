import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const rateLimitWindowSchema = z.object({
	used_percent: z.number(),
	window_minutes: z.number(),
	resets_at: z.number(),
});

const rateLimitsSchema = z.object({
	limit_id: z.string().nullable().optional(),
	primary: rateLimitWindowSchema,
	secondary: rateLimitWindowSchema.nullable().optional(),
	credits: z
		.object({
			has_credits: z.boolean().optional(),
			unlimited: z.boolean().optional(),
			balance: z.string().optional(),
		})
		.nullable()
		.optional(),
	plan_type: z.string().nullable().optional(),
	rate_limit_reached_type: z.string().nullable().optional(),
});

const rateLimitEventSchema = z.object({
	timestamp: z.string(),
	type: z.literal("event_msg"),
	payload: z.object({
		type: z.literal("token_count"),
		rate_limits: rateLimitsSchema,
	}),
});

export interface CodexUsageWindow {
	usedPercent: number;
	windowMinutes: number;
	resetsAt: number;
}

export interface CodexUsageCredits {
	hasCredits: boolean;
	unlimited: boolean;
	balance: string;
}

export interface CodexUsageSnapshot {
	available: true;
	primary: CodexUsageWindow;
	secondary: CodexUsageWindow | null;
	credits: CodexUsageCredits;
	planType: string | null;
	rateLimitReachedType: string | null;
	observedAt: number;
	sourceFile: string;
}

export type CodexUsageUnavailableReason =
	| "no-rollouts"
	| "no-rate-limit-events"
	| "unreadable"
	| "unexpected-shape";

export interface CodexUsageUnavailable {
	available: false;
	reason: CodexUsageUnavailableReason;
	message?: string;
}

export type CodexUsageResult = CodexUsageSnapshot | CodexUsageUnavailable;

function defaultSessionsDir(): string {
	return join(homedir(), ".codex", "sessions");
}

async function collectRolloutFiles(sessionsDir: string): Promise<string[]> {
	const files: string[] = [];
	async function walk(dir: string): Promise<void> {
		let entries: import("node:fs").Dirent[];
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				await walk(full);
			} else if (
				entry.isFile() &&
				entry.name.startsWith("rollout-") &&
				entry.name.endsWith(".jsonl")
			) {
				files.push(full);
			}
		}
	}
	await walk(sessionsDir);
	return files;
}

export async function findLatestCodexRollout(
	sessionsDir: string = defaultSessionsDir(),
): Promise<string | null> {
	const files = await collectRolloutFiles(sessionsDir);
	if (files.length === 0) return null;
	const withStats = await Promise.all(
		files.map(async (path) => {
			try {
				const stat = await fs.stat(path);
				return { path, mtimeMs: stat.mtimeMs };
			} catch {
				return null;
			}
		}),
	);
	const valid = withStats.filter(
		(entry): entry is { path: string; mtimeMs: number } => entry !== null,
	);
	if (valid.length === 0) return null;
	valid.sort((a, b) => b.mtimeMs - a.mtimeMs);
	return valid[0]?.path ?? null;
}

const TAIL_WINDOW_BYTES = 256 * 1024;

async function readTail(path: string): Promise<string> {
	const stat = await fs.stat(path);
	const size = stat.size;
	if (size === 0) return "";
	const start = Math.max(0, size - TAIL_WINDOW_BYTES);
	const length = size - start;
	const handle = await fs.open(path, "r");
	try {
		const buffer = Buffer.alloc(length);
		await handle.read(buffer, 0, length, start);
		return buffer.toString("utf8");
	} finally {
		await handle.close();
	}
}

export async function readLatestRateLimits(
	rolloutPath: string,
): Promise<CodexUsageResult> {
	let tail: string;
	try {
		tail = await readTail(rolloutPath);
	} catch (error) {
		return {
			available: false,
			reason: "unreadable",
			message: error instanceof Error ? error.message : String(error),
		};
	}
	const lines = tail.split("\n");
	// If our window doesn't start at a line boundary, drop the (possibly
	// truncated) first fragment so we don't feed a partial JSON to the parser.
	if (lines.length > 0) lines.shift();
	for (let index = lines.length - 1; index >= 0; index -= 1) {
		const raw = lines[index];
		if (!raw) continue;
		if (!raw.includes('"rate_limits"')) continue;
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			continue;
		}
		const result = rateLimitEventSchema.safeParse(parsed);
		if (!result.success) continue;
		const event = result.data;
		const limits = event.payload.rate_limits;
		return {
			available: true,
			primary: {
				usedPercent: limits.primary.used_percent,
				windowMinutes: limits.primary.window_minutes,
				resetsAt: limits.primary.resets_at,
			},
			secondary: limits.secondary
				? {
						usedPercent: limits.secondary.used_percent,
						windowMinutes: limits.secondary.window_minutes,
						resetsAt: limits.secondary.resets_at,
					}
				: null,
			credits: {
				hasCredits: limits.credits?.has_credits ?? false,
				unlimited: limits.credits?.unlimited ?? false,
				balance: limits.credits?.balance ?? "0",
			},
			planType: limits.plan_type ?? null,
			rateLimitReachedType: limits.rate_limit_reached_type ?? null,
			observedAt: Date.parse(event.timestamp),
			sourceFile: rolloutPath,
		};
	}
	return { available: false, reason: "no-rate-limit-events" };
}

export async function getCodexUsage(
	sessionsDir: string = defaultSessionsDir(),
): Promise<CodexUsageResult> {
	const latest = await findLatestCodexRollout(sessionsDir);
	if (!latest) return { available: false, reason: "no-rollouts" };
	return readLatestRateLimits(latest);
}

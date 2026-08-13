import { isAbsolute, normalize, sep, win32 } from "node:path";
import { TRPCError } from "@trpc/server";

export interface GitLogEntry {
	hash: string;
	shortHash: string;
	message: string;
	author: string;
	date: number;
}

export interface GitStashEntry {
	index: number;
	ref: string;
	branch: string;
	message: string;
	timestamp: number;
}

const COMMIT_REF_PATTERN = /^[0-9a-fA-F]{4,40}(?:\^+|~\d+)?$/;

export function assertSafeGitPath(filePath: string): void {
	if (
		!filePath ||
		filePath.includes("\0") ||
		isAbsolute(filePath) ||
		win32.isAbsolute(filePath)
	) {
		throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid file path" });
	}
	const normalized = normalize(filePath);
	if (
		normalized === "." ||
		normalized === "" ||
		normalized.split(sep).includes("..") ||
		filePath.split(/[\\/]/).includes("..")
	) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Path must stay within the workspace",
		});
	}
}

export function assertValidCommitRef(ref: string): void {
	if (!COMMIT_REF_PATTERN.test(ref)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Invalid commit reference: expected a SHA, optionally followed by ^ or ~N",
		});
	}
}

export function parseGitLog(output: string): GitLogEntry[] {
	if (!output.trim()) return [];
	const entries: GitLogEntry[] = [];
	for (const line of output.split("\n")) {
		if (!line.trim()) continue;
		const [hash, shortHash, message, author, timestamp] = line.split("\x1f");
		if (!hash || !shortHash) continue;
		const seconds = Number.parseInt(timestamp ?? "", 10);
		entries.push({
			hash,
			shortHash,
			message: message ?? "",
			author: author ?? "",
			date: Number.isFinite(seconds) ? seconds * 1000 : 0,
		});
	}
	return entries;
}

export function parseGitStashList(output: string): GitStashEntry[] {
	if (!output.trim()) return [];
	const entries: GitStashEntry[] = [];
	for (const line of output.split("\n")) {
		if (!line.trim()) continue;
		const [ref, subject, timestamp] = line.split("\x1f");
		const match = ref?.match(/^stash@\{(\d+)\}$/);
		if (!ref || !match || !subject) continue;
		const seconds = Number.parseInt(timestamp ?? "", 10);
		entries.push({
			index: Number.parseInt(match[1] ?? "", 10),
			ref,
			branch: subject.match(/^(?:WIP on|On)\s+([^:]+):/)?.[1]?.trim() ?? "",
			message: subject,
			timestamp: Number.isFinite(seconds) ? seconds * 1000 : 0,
		});
	}
	return entries;
}

export function parseNameStatus(
	output: string,
): Array<{ path: string; status: string }> {
	if (!output.trim()) return [];
	return output
		.split("\n")
		.filter(Boolean)
		.flatMap((line) => {
			const [status, ...paths] = line.split("\t");
			const path = paths.at(-1);
			return status && path ? [{ path, status }] : [];
		});
}

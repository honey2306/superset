import { isAbsolute, normalize, sep, win32 } from "node:path";
import { TRPCError } from "@trpc/server";

export interface GitLogEntry {
	hash: string;
	shortHash: string;
	message: string;
	author: string;
	date: number;
	/** Parent commit hashes, in Git's first-parent order. */
	parents: string[];
	/** Decorations printed by Git (branches, tags, and HEAD pointers). */
	refs: string[];
	/** The local branch name when Git can identify one from the decorations. */
	branch?: string;
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
	// Newer callers terminate each record with the ASCII record separator. Keep
	// accepting the old line-delimited five-field format because persisted host
	// responses and older workers can still be in flight during an upgrade.
	const records = output.includes("\x1e")
		? output.split("\x1e")
		: output.split("\n");
	for (const record of records) {
		const line = record.replace(/^\n+|\n+$/g, "");
		if (!line.trim()) continue;
		const fields = line.split("\x1f");
		const isCurrentFormat = fields.length >= 7;
		const hasSourceRef = fields.length >= 8;
		const [hash, shortHash] = fields;
		if (!hash || !shortHash) continue;
		const parents = isCurrentFormat
			? (fields[2] ?? "").split(" ").filter(Boolean)
			: [];
		const refs = isCurrentFormat ? parseGitDecorations(fields[3] ?? "") : [];
		const sourceRef = hasSourceRef ? fields[4] : undefined;
		const message = isCurrentFormat ? fields[hasSourceRef ? 5 : 4] : fields[2];
		const author = isCurrentFormat ? fields[hasSourceRef ? 6 : 5] : fields[3];
		const timestamp = isCurrentFormat
			? fields[hasSourceRef ? 7 : 6]
			: fields[4];
		const seconds = Number.parseInt(timestamp ?? "", 10);
		const branch = parseGitSourceRef(sourceRef) ?? parseGitBranch(refs);
		entries.push({
			hash,
			shortHash,
			message: message ?? "",
			author: author ?? "",
			date: Number.isFinite(seconds) ? seconds * 1000 : 0,
			parents,
			refs,
			...(branch ? { branch } : {}),
		});
	}
	return entries;
}

/** Parse Git decorations from the worker's safe separator, with old-format fallback. */
export function parseGitDecorations(decorations: string): string[] {
	return decorations
		.split(decorations.includes("\x1d") ? "\x1d" : ",")
		.map((ref) => ref.trim())
		.filter(Boolean);
}

/** `%S` identifies the ref used to reach a commit, including non-tip branches. */
export function parseGitSourceRef(sourceRef?: string): string | undefined {
	const ref = sourceRef?.trim();
	if (!ref || ref === "HEAD" || ref.startsWith("tag: ")) return undefined;
	if (ref.startsWith("refs/heads/")) return ref.slice("refs/heads/".length);
	if (ref.startsWith("refs/remotes/")) {
		return ref.slice("refs/remotes/".length);
	}
	if (ref.startsWith("heads/")) return ref.slice("heads/".length);
	if (ref.startsWith("remotes/")) return ref.slice("remotes/".length);
	return ref;
}

export function parseGitBranch(refs: string[]): string | undefined {
	const headBranch = refs.find((ref) => ref.startsWith("HEAD -> "));
	if (headBranch)
		return headBranch.slice("HEAD -> ".length).trim() || undefined;

	const localRef = refs.find(
		(ref) =>
			!ref.startsWith("HEAD") &&
			!ref.startsWith("tag: ") &&
			!ref.startsWith("refs/remotes/") &&
			!ref.startsWith("remotes/"),
	);
	if (!localRef) return undefined;
	return localRef.startsWith("refs/heads/")
		? localRef.slice("refs/heads/".length)
		: localRef;
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

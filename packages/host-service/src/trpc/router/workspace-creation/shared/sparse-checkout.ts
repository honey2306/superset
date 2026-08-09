import { TRPCError } from "@trpc/server";
import type { GitClient } from "./types";

export function normalizeSparseCheckoutPaths(inputs: string[]): string[] {
	const paths = new Set<string>();
	for (const input of inputs) {
		const path = input
			.trim()
			.replaceAll("\\", "/")
			.replace(/^(?:\.?\/)+|\/+$/g, "");
		if (!path || path === ".") continue;
		if (path.split("/").some((part) => part === ".." || part.startsWith("-"))) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Invalid sparse checkout path: ${input}`,
			});
		}
		paths.add(path);
	}
	if (paths.size > 200)
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Too many sparse checkout folders (max 200)",
		});
	return [...paths];
}

export function parseSparseCheckoutPaths(
	raw: string | null | undefined,
): string[] {
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		const paths: string[] = [];
		for (const value of parsed) {
			if (typeof value !== "string") continue;
			try {
				for (const path of normalizeSparseCheckoutPaths([value])) {
					if (!paths.includes(path)) paths.push(path);
				}
			} catch {
				// Stored values can be hand-edited or written by an older client.
				// Ignore unsafe entries rather than blocking workspace creation.
			}
		}
		return paths;
	} catch {
		return [];
	}
}

export function serializeSparseCheckoutPaths(paths: string[]): string | null {
	return paths.length ? JSON.stringify(paths) : null;
}

/**
 * Creates a worktree while honoring its sparse-checkout paths.
 *
 * `git worktree add --no-checkout`, followed by sparse configuration and an
 * explicit checkout, prevents excluded paths from being written first. Sparse
 * checkout is an optimization: unsupported patterns fall back to a full
 * checkout, but an incomplete checkout removes the newly-created worktree.
 */
export async function addWorktreeWithSparseCheckout(args: {
	git: GitClient;
	worktreeArgs: string[];
	worktreePath: string;
	sparsePaths: string[];
	logPrefix: string;
	hookTolerance?: { context: string; didSucceed: () => Promise<boolean> };
}): Promise<void> {
	const runCheckout = async (argv: string[]): Promise<void> => {
		try {
			await args.git.raw(argv);
		} catch (error) {
			if (!args.hookTolerance || !(await args.hookTolerance.didSucceed())) {
				throw error;
			}
			console.warn(
				`${args.hookTolerance.context}, but git reported failure (likely post-checkout hook)`,
			);
		}
	};

	if (!args.sparsePaths.length) {
		await runCheckout(["worktree", "add", ...args.worktreeArgs]);
		return;
	}

	await args.git.raw([
		"worktree",
		"add",
		"--no-checkout",
		...args.worktreeArgs,
	]);
	try {
		try {
			await args.git.raw([
				"-C",
				args.worktreePath,
				"sparse-checkout",
				"set",
				"--cone",
				...args.sparsePaths,
			]);
		} catch (error) {
			console.warn(
				`${args.logPrefix} sparse checkout failed, falling back to a full checkout:`,
				error,
			);
			await args.git
				.raw(["-C", args.worktreePath, "sparse-checkout", "disable"])
				.catch(() => {});
		}
		await runCheckout(["-C", args.worktreePath, "checkout"]);
	} catch (error) {
		await args.git
			.raw(["worktree", "remove", "--force", args.worktreePath])
			.catch((removeError) =>
				console.warn(
					`${args.logPrefix} failed to remove the worktree after a failed checkout:`,
					removeError,
				),
			);
		throw error;
	}
}

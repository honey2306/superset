import { describe, expect, test } from "bun:test";
import {
	addWorktreeWithSparseCheckout,
	normalizeSparseCheckoutPaths,
	parseSparseCheckoutPaths,
} from "./sparse-checkout";
import type { GitClient } from "./types";

function fakeGit(failWhen: (argv: string[]) => boolean = () => false) {
	const calls: string[][] = [];
	const git = {
		raw: async (argv: string[]) => {
			calls.push(argv);
			if (failWhen(argv)) throw new Error(`boom: ${argv.join(" ")}`);
			return "";
		},
	} as unknown as GitClient;
	return { git, calls };
}

describe("sparse checkout paths", () => {
	test("normalizes, deduplicates, and rejects unsafe paths", () => {
		expect(
			normalizeSparseCheckoutPaths([
				" ./apps/desktop/ ",
				"apps\\desktop",
				"packages/ui",
				".",
				".//packages/ui//",
			]),
		).toEqual(["apps/desktop", "packages/ui"]);
		expect(() => normalizeSparseCheckoutPaths(["../secrets"])).toThrow();
		expect(() => normalizeSparseCheckoutPaths(["--cone"])).toThrow();
	});

	test("drops invalid persisted paths so creation falls back safely", () => {
		expect(
			parseSparseCheckoutPaths('["./apps/desktop/", "../secrets", "-rf"]'),
		).toEqual(["apps/desktop"]);
	});
});

describe("addWorktreeWithSparseCheckout", () => {
	const base = { worktreeArgs: ["/wt", "main"], worktreePath: "/wt" };

	test("uses a normal worktree add for an empty sparse path list", async () => {
		const { git, calls } = fakeGit();
		await addWorktreeWithSparseCheckout({
			...base,
			git,
			sparsePaths: [],
			logPrefix: "[test]",
		});
		expect(calls).toEqual([["worktree", "add", "/wt", "main"]]);
	});

	test("adds without checkout, configures the cone, then checks out", async () => {
		const { git, calls } = fakeGit();
		await addWorktreeWithSparseCheckout({
			...base,
			git,
			sparsePaths: ["apps/desktop"],
			logPrefix: "[test]",
		});
		expect(calls).toEqual([
			["worktree", "add", "--no-checkout", "/wt", "main"],
			["-C", "/wt", "sparse-checkout", "set", "--cone", "apps/desktop"],
			["-C", "/wt", "checkout"],
		]);
	});

	test("falls back to a full checkout when sparse configuration fails", async () => {
		const { git, calls } = fakeGit((argv) => argv.includes("set"));
		await addWorktreeWithSparseCheckout({
			...base,
			git,
			sparsePaths: ["apps/desktop"],
			logPrefix: "[test]",
		});
		expect(calls.slice(-2)).toEqual([
			["-C", "/wt", "sparse-checkout", "disable"],
			["-C", "/wt", "checkout"],
		]);
	});

	test("removes the worktree when its explicit checkout fails", async () => {
		const { git, calls } = fakeGit((argv) => argv.at(-1) === "checkout");
		await expect(
			addWorktreeWithSparseCheckout({
				...base,
				git,
				sparsePaths: ["apps/desktop"],
				logPrefix: "[test]",
			}),
		).rejects.toThrow("boom");
		expect(calls.at(-1)).toEqual(["worktree", "remove", "--force", "/wt"]);
	});
});

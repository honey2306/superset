import { describe, expect, test } from "bun:test";
import { resolveKDevMergeRequestPage } from "./kdev-merge-request";

describe("resolveKDevMergeRequestPage", () => {
	test("derives a KDev page from the checked-out source branch", async () => {
		const commands: string[][] = [];
		const page = await resolveKDevMergeRequestPage("/trusted/session/cwd", {
			runGit: async (args) => {
				commands.push(args);
				if (args[0] === "rev-parse") return "/trusted/repo";
				if (args[0] === "symbolic-ref") return "feature/my-work";
				return "git@kdev.corp.kuaishou.com:group/repo.git";
			},
		});

		expect(page).toEqual({
			provider: "kdev",
			sourceBranch: "feature/my-work",
			url: "https://kdev.corp.kuaishou.com/git/group/repo/-/create_MR?branchName=feature%2Fmy-work",
		});
		expect(commands).toEqual([
			["rev-parse", "--show-toplevel"],
			["symbolic-ref", "--quiet", "--short", "HEAD"],
			["remote", "get-url", "origin"],
		]);
	});

	test("rejects detached HEAD before reading any remote", async () => {
		const commands: string[][] = [];
		await expect(
			resolveKDevMergeRequestPage("/trusted/session/cwd", {
				runGit: async (args) => {
					commands.push(args);
					if (args[0] === "rev-parse") return "/trusted/repo";
					throw new Error("detached");
				},
			}),
		).rejects.toThrow("detached HEAD");
		expect(commands).toEqual([
			["rev-parse", "--show-toplevel"],
			["symbolic-ref", "--quiet", "--short", "HEAD"],
		]);
	});

	test("returns clear errors for a non-repository, missing origin, and non-KDev origin", async () => {
		await expect(
			resolveKDevMergeRequestPage("/trusted/session/cwd", {
				runGit: async () => {
					throw new Error("not a git repo");
				},
			}),
		).rejects.toThrow("not inside a Git repository");

		await expect(
			resolveKDevMergeRequestPage("/trusted/session/cwd", {
				runGit: async (args) => {
					if (args[0] === "rev-parse") return "/trusted/repo";
					if (args[0] === "symbolic-ref") return "feature/a";
					throw new Error("no origin");
				},
			}),
		).rejects.toThrow('remote "origin" is not configured');

		await expect(
			resolveKDevMergeRequestPage("/trusted/session/cwd", {
				runGit: async (args) => {
					if (args[0] === "rev-parse") return "/trusted/repo";
					if (args[0] === "symbolic-ref") return "feature/a";
					return "https://github.com/group/repo.git";
				},
			}),
		).rejects.toThrow("not a supported KDev repository");
	});
});

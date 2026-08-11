import { describe, expect, it } from "bun:test";
import type { HostServiceContext } from "../../../types";
import { gitRouter } from "./git";

function createCaller(
	options: { branch?: string; hasUpstream?: boolean } = {},
) {
	const calls: Array<{ method: string; args: string[] }> = [];
	const git = {
		fetch: async (args: string[]) => calls.push({ method: "fetch", args }),
		pull: async (args: string[]) => calls.push({ method: "pull", args }),
		push: async (args: string[]) => calls.push({ method: "push", args }),
		revparse: async () => options.branch ?? "feature/test",
		raw: async () => {
			if (options.hasUpstream === false) throw new Error("no upstream");
			return "origin/feature/test";
		},
	};
	const ctx = {
		isAuthenticated: true,
		db: {
			query: {
				workspaces: {
					findFirst: () => ({
						sync: () => ({ worktreePath: "/repo/worktree" }),
					}),
				},
			},
		},
		git: async () => git,
	} as unknown as HostServiceContext;
	return { caller: gitRouter.createCaller(ctx), calls };
}

describe("gitRouter current branch operations", () => {
	it("runs fetch, rebase pull, and initial upstream push in the host worktree", async () => {
		const { caller, calls } = createCaller({ hasUpstream: false });
		await caller.fetchCurrentBranch({ workspaceId: "host-ws" });
		await caller.pullCurrentBranch({ workspaceId: "host-ws" });
		await caller.pushCurrentBranch({
			workspaceId: "host-ws",
			setUpstream: true,
		});
		expect(calls).toEqual([
			{ method: "fetch", args: ["--all", "--prune"] },
			{ method: "pull", args: ["--rebase"] },
			{ method: "push", args: ["-u", "origin", "feature/test"] },
		]);
	});

	it("rejects pushing detached HEAD", async () => {
		const { caller } = createCaller({ branch: "HEAD" });
		await expect(
			caller.pushCurrentBranch({ workspaceId: "host-ws", setUpstream: true }),
		).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
		});
	});
});

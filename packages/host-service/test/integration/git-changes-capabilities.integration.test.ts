import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TRPCClientError } from "@trpc/client";
import { type BasicScenario, createBasicScenario } from "../helpers/scenarios";

describe("workspace-scoped git changes capabilities", () => {
	let scenario: BasicScenario;

	beforeEach(async () => {
		scenario = await createBasicScenario();
	});

	afterEach(async () => {
		await scenario?.dispose();
	});

	test("stages, unstages, discards, and commits only through workspaceId", async () => {
		const trackedPath = join(scenario.repo.repoPath, "README.md");
		const untrackedPath = join(scenario.repo.repoPath, "new.txt");
		writeFileSync(trackedPath, "changed\n");
		writeFileSync(untrackedPath, "new\n");

		await scenario.host.trpc.git.stageFiles.mutate({
			workspaceId: scenario.workspaceId,
			filePaths: ["README.md", "new.txt"],
		});
		expect((await scenario.repo.git.status()).staged).toContain("README.md");

		await scenario.host.trpc.git.unstageFiles.mutate({
			workspaceId: scenario.workspaceId,
			filePaths: ["new.txt"],
		});
		expect((await scenario.repo.git.status()).not_added).toContain("new.txt");

		await scenario.host.trpc.git.discardFiles.mutate({
			workspaceId: scenario.workspaceId,
			filePaths: ["new.txt"],
		});
		expect(existsSync(untrackedPath)).toBe(false);

		const result = await scenario.host.trpc.git.commit.mutate({
			workspaceId: scenario.workspaceId,
			message: "workspace-scoped commit",
		});
		expect(result.success).toBe(true);
		expect(result.hash).toMatch(/^[0-9a-f]{40}$/);
		expect((await scenario.repo.git.log({ maxCount: 1 })).latest?.message).toBe(
			"workspace-scoped commit",
		);
	});

	test("reads renamed file diffs with workspace-scoped old and new paths", async () => {
		await scenario.repo.git.mv("README.md", "RENAMED.md");
		writeFileSync(join(scenario.repo.repoPath, "RENAMED.md"), "renamed\n");
		await scenario.repo.git.add("RENAMED.md");

		const diff = await scenario.host.trpc.git.getDiff.query({
			workspaceId: scenario.workspaceId,
			path: "RENAMED.md",
			oldPath: "README.md",
			category: "staged",
		});

		expect(diff.oldFile.name).toBe("README.md");
		expect(diff.oldFile.contents).toBe("initial commit");
		expect(diff.newFile).toEqual({
			name: "RENAMED.md",
			contents: "renamed\n",
		});
	});

	test("rejects traversal and absolute paths before invoking git or deleting", async () => {
		for (const filePath of [
			"../outside.txt",
			"/tmp/outside.txt",
			"C:\\outside.txt",
		]) {
			await expect(
				scenario.host.trpc.git.discardFiles.mutate({
					workspaceId: scenario.workspaceId,
					filePaths: [filePath],
				}),
			).rejects.toBeInstanceOf(TRPCClientError);
		}
		await expect(
			scenario.host.trpc.git.getDiff.query({
				workspaceId: scenario.workspaceId,
				path: "../outside.txt",
				category: "unstaged",
			}),
		).rejects.toBeInstanceOf(TRPCClientError);
	});

	test("lists paged log and follows file history", async () => {
		await scenario.repo.commit("first file revision", {
			"history.txt": "one\n",
		});
		await scenario.repo.commit("second file revision", {
			"history.txt": "two\n",
		});

		const log = await scenario.host.trpc.git.listLog.query({
			workspaceId: scenario.workspaceId,
			limit: 1,
			grep: "second file revision",
		});
		expect(log).toHaveLength(1);
		expect(log[0]?.message).toBe("second file revision");
		expect(log[0]?.date).toBeGreaterThan(0);

		const history = await scenario.host.trpc.git.getFileHistory.query({
			workspaceId: scenario.workspaceId,
			filePath: "history.txt",
		});
		expect(history.map((entry) => entry.message)).toEqual([
			"second file revision",
			"first file revision",
		]);
	});

	test("lists, inspects, applies, pops, and drops indexed stashes", async () => {
		const path = join(scenario.repo.repoPath, "README.md");
		writeFileSync(path, "stash one\n");
		await scenario.repo.git.raw(["stash", "push", "-m", "stash-one"]);
		writeFileSync(path, "stash two\n");
		await scenario.repo.git.raw(["stash", "push", "-m", "stash-two"]);

		const stashes = await scenario.host.trpc.git.stashList.query({
			workspaceId: scenario.workspaceId,
		});
		expect(stashes).toHaveLength(2);
		expect(stashes[0]?.message).toContain("stash-two");
		const files = await scenario.host.trpc.git.stashFiles.query({
			workspaceId: scenario.workspaceId,
			index: 0,
		});
		expect(files).toContainEqual({ path: "README.md", status: "M" });

		await scenario.host.trpc.git.stashApplyAt.mutate({
			workspaceId: scenario.workspaceId,
			index: 0,
		});
		expect(readFileSync(path, "utf8")).toBe("stash two\n");
		await scenario.repo.git.raw(["checkout", "--", "README.md"]);

		await scenario.host.trpc.git.stashPopAt.mutate({
			workspaceId: scenario.workspaceId,
			index: 0,
		});
		expect(readFileSync(path, "utf8")).toBe("stash two\n");
		await scenario.repo.git.raw(["checkout", "--", "README.md"]);

		await scenario.host.trpc.git.stashDropAt.mutate({
			workspaceId: scenario.workspaceId,
			index: 0,
		});
		expect(
			await scenario.host.trpc.git.stashList.query({
				workspaceId: scenario.workspaceId,
			}),
		).toEqual([]);
	});

	test("resets to a validated commit", async () => {
		const target = await scenario.repo.commit("target", {
			"reset.txt": "one\n",
		});
		await scenario.repo.commit("later", { "reset.txt": "two\n" });

		await scenario.host.trpc.git.resetToCommit.mutate({
			workspaceId: scenario.workspaceId,
			commit: target,
			mode: "hard",
		});
		expect((await scenario.repo.git.revparse(["HEAD"])).trim()).toBe(target);

		await expect(
			scenario.host.trpc.git.resetToCommit.mutate({
				workspaceId: scenario.workspaceId,
				commit: "--hard",
				mode: "mixed",
			}),
		).rejects.toBeInstanceOf(TRPCClientError);
	});
});

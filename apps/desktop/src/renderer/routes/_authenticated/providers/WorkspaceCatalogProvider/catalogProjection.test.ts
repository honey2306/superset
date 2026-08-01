import { describe, expect, test } from "bun:test";
import type { WorkspaceCatalogSnapshot } from "@superset/host-service/workspace-catalog";
import {
	applyChanges,
	emptyProjection,
	installSnapshot,
	makeHighWaterMark,
} from "./catalogProjection";

const projSnapshot = (
	id: string,
): WorkspaceCatalogSnapshot["projects"][number] => ({
	id,
	kind: "repository",
	singletonKey: null,
	name: id,
	repoPath: `/tmp/${id}`,
	repoProvider: null,
	repoOwner: null,
	repoName: null,
	repoUrl: null,
	remoteName: null,
	worktreeBaseDir: null,
	branchPrefixMode: null,
	branchPrefixCustom: null,
	createdAt: 1,
	updatedAt: 1,
});

const wsSnapshot = (
	id: string,
	projectId: string,
): WorkspaceCatalogSnapshot["workspaces"][number] => ({
	id,
	projectId,
	name: id,
	type: "worktree",
	worktreePath: `/tmp/${projectId}/${id}`,
	branch: `branch/${id}`,
	headSha: null,
	upstreamOwner: null,
	upstreamRepo: null,
	upstreamBranch: null,
	pullRequestId: null,
	taskId: null,
	createdByUserId: null,
	createdAt: 1,
	updatedAt: 1,
});

describe("catalogProjection", () => {
	test("installSnapshot indexes rows by id and preserves revision", () => {
		const state = installSnapshot({
			schemaVersion: 1,
			revision: 5,
			projects: [projSnapshot("p1")],
			workspaces: [wsSnapshot("w1", "p1")],
			health: { unresolvedIdentityConflicts: 0 },
		});
		expect(state.revision).toBe(5);
		expect(state.projects.get("p1")?.id).toBe("p1");
		expect(state.workspaces.get("w1")?.projectId).toBe("p1");
	});

	test("applyChanges applies only forward-going revisions", () => {
		const base = installSnapshot({
			schemaVersion: 1,
			revision: 10,
			projects: [projSnapshot("p1")],
			workspaces: [],
			health: { unresolvedIdentityConflicts: 0 },
		});
		const next = applyChanges(base, [
			{
				schemaVersion: 1,
				revision: 9, // stale — must be ignored
				entityType: "project",
				entityId: "p1",
				eventType: "deleted",
				snapshot: null,
				occurredAt: 1,
			},
			{
				schemaVersion: 1,
				revision: 11,
				entityType: "workspace",
				entityId: "w1",
				eventType: "created",
				snapshot: wsSnapshot("w1", "p1"),
				occurredAt: 1,
			},
		]);
		expect(next.projects.has("p1")).toBe(true);
		expect(next.workspaces.get("w1")?.id).toBe("w1");
		expect(next.revision).toBe(11);
	});

	test("workspace delete removes only the target row", () => {
		const base = applyChanges(emptyProjection(), [
			{
				schemaVersion: 1,
				revision: 1,
				entityType: "workspace",
				entityId: "w1",
				eventType: "created",
				snapshot: wsSnapshot("w1", "p1"),
				occurredAt: 1,
			},
			{
				schemaVersion: 1,
				revision: 2,
				entityType: "workspace",
				entityId: "w2",
				eventType: "created",
				snapshot: wsSnapshot("w2", "p1"),
				occurredAt: 1,
			},
		]);
		const next = applyChanges(base, [
			{
				schemaVersion: 1,
				revision: 3,
				entityType: "workspace",
				entityId: "w1",
				eventType: "deleted",
				snapshot: null,
				occurredAt: 1,
			},
		]);
		expect(next.workspaces.has("w1")).toBe(false);
		expect(next.workspaces.has("w2")).toBe(true);
	});

	test("high-water mark tracks the max observed revision", () => {
		const hw = makeHighWaterMark();
		hw.observe(3);
		hw.observe(7);
		hw.observe(5);
		expect(hw.current()).toBe(7);
	});
});

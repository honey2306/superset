import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SourceHandler } from "./types";

/**
 * `ProjectTarget.temporary` — the singleton temporary Project (execplan
 * §Decision 10). MVP: reuse if already claimed.
 */
export const temporaryHandler: SourceHandler = async ({
	request,
	ctx,
	launches,
	warnings,
}) => {
	if (request.project.kind !== "temporary") {
		throw new Error(
			`temporaryHandler cannot handle project.kind='${request.project.kind}'`,
		);
	}
	const singletonKey = request.project.singletonKey;
	const existing = ctx.db.query.projects
		.findFirst({
			where: (row, { eq }) => eq(row.singletonKey, singletonKey),
		})
		.sync();
	if (existing) {
		const main = ctx.db.query.workspaces
			.findFirst({
				where: (w, { and, eq }) =>
					and(eq(w.projectId, existing.id), eq(w.type, "main")),
			})
			.sync();
		return {
			projectId: existing.id,
			workspaceId: main?.id ?? existing.id,
			disposition: "reused",
			launches,
			warnings,
		};
	}

	const repoPath = join(homedir(), "Superset", "temporary");
	await mkdir(repoPath, { recursive: true });
	const git = await ctx.git(repoPath);
	try {
		await git.raw(["rev-parse", "--show-toplevel"]);
	} catch {
		try {
			await git.raw(["init", "--initial-branch=main"]);
		} catch {
			await git.raw(["init"]);
		}
	}
	let branch = "main";
	try {
		branch =
			(await git.raw(["symbolic-ref", "--short", "HEAD"])).trim() || branch;
	} catch {
		// An unborn repository still has a stable main-workspace identity.
	}
	const project = ctx.catalog.createProject({
		kind: "temporary",
		singletonKey,
		repoPath,
		name: "Temporary workspace",
	});
	const workspace = ctx.catalog.createWorkspace({
		projectId: project.id,
		worktreePath: repoPath,
		branch,
		type: "main",
		name: "Temporary workspace",
	});
	return {
		projectId: project.id,
		workspaceId: workspace.id,
		disposition: "created",
		launches,
		warnings,
		artifacts: [{ kind: "repo-dir", identity: repoPath, ownership: "adopted" }],
	};
};

import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { runSourceStep, type SourceHandler } from "./types";

/**
 * `ProjectTarget.temporary` — the singleton temporary Project (execplan
 * §Decision 10). MVP: reuse if already claimed.
 */
export const temporaryHandler: SourceHandler = async (context) => {
	const { request, ctx, launches, warnings } = context;
	if (request.project.kind !== "temporary") {
		throw new Error(
			`temporaryHandler cannot handle project.kind='${request.project.kind}'`,
		);
	}
	const singletonKey = request.project.singletonKey;
	const repoPath = join(homedir(), "Superset", "temporary");
	const claimTemporaryIdentity = (project: {
		id: string;
		kind: string | null;
		singletonKey: string | null;
	}) => {
		if (project.kind === "temporary" && project.singletonKey === singletonKey) {
			return;
		}
		const updated = ctx.catalog.updateProject(project.id, {
			kind: "temporary",
			singletonKey,
		});
		if (!updated) {
			throw new Error(`Temporary project disappeared: ${project.id}`);
		}
	};
	const existing =
		ctx.db.query.projects
			.findFirst({
				where: (row, { eq }) => eq(row.singletonKey, singletonKey),
			})
			.sync() ??
		ctx.db.query.projects
			.findFirst({
				where: (row, { eq }) => eq(row.repoPath, repoPath),
			})
			.sync();
	if (existing) {
		claimTemporaryIdentity(existing);
		const main = ctx.db.query.workspaces
			.findFirst({
				where: (w, { and, eq }) =>
					and(eq(w.projectId, existing.id), eq(w.type, "main")),
			})
			.sync();
		if (main) {
			return {
				projectId: existing.id,
				workspaceId: main.id,
				disposition: "reused",
				launches,
				warnings,
			};
		}
	}

	const prepared = await runSourceStep(
		context,
		"prepare-repository",
		{ repoPath },
		async () => {
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
			return { repoPath, branch };
		},
	);
	const committed = await runSourceStep(
		context,
		"catalog",
		{ singletonKey, repoPath: prepared.repoPath },
		async () => {
			const existingProject =
				ctx.db.query.projects
					.findFirst({
						where: (row, { eq }) => eq(row.singletonKey, singletonKey),
					})
					.sync() ??
				ctx.db.query.projects
					.findFirst({
						where: (row, { eq }) => eq(row.repoPath, prepared.repoPath),
					})
					.sync();
			if (existingProject) {
				const existingWorkspace = ctx.db.query.workspaces
					.findFirst({
						where: (row, { and, eq }) =>
							and(eq(row.projectId, existingProject.id), eq(row.type, "main")),
					})
					.sync();
				if (existingWorkspace) {
					return {
						projectId: existingProject.id,
						workspaceId: existingWorkspace.id,
						disposition: "reused" as const,
					};
				}
				const repairedWorkspace = ctx.catalog.createWorkspace({
					projectId: existingProject.id,
					worktreePath: prepared.repoPath,
					branch: prepared.branch,
					type: "main",
					name: "Temporary workspace",
				});
				return {
					projectId: existingProject.id,
					workspaceId: repairedWorkspace.id,
					disposition: "repaired" as const,
				};
			}

			const project = ctx.catalog.createProject({
				kind: "temporary",
				singletonKey,
				repoPath: prepared.repoPath,
				name: "Temporary workspace",
			});
			const workspace = ctx.catalog.createWorkspace({
				projectId: project.id,
				worktreePath: prepared.repoPath,
				branch: prepared.branch,
				type: "main",
				name: "Temporary workspace",
			});
			return {
				projectId: project.id,
				workspaceId: workspace.id,
				disposition: "created" as const,
			};
		},
	);
	return {
		projectId: committed.projectId,
		workspaceId: committed.workspaceId,
		disposition: committed.disposition,
		launches,
		warnings,
		artifacts: [
			{ kind: "repo-dir", identity: prepared.repoPath, ownership: "adopted" },
		],
	};
};

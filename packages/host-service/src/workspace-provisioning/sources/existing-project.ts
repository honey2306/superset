import type { RunnerArtifact } from "../workspace-provisioning";
import type { SourceHandler } from "./types";

/**
 * `ProjectTarget.existing` — the project row lives in Catalog already.
 * Dispatches on `WorkspaceSource`:
 *   - main       → read back the project's main workspace row
 *   - branch     → delegate to `workspaces.create` with explicit branch
 *   - worktree   → delegate to `workspaceCreation.adopt` with path
 *   - pull-request → delegate to `workspaces.create` with `pr` number
 */
export const existingProjectHandler: SourceHandler = async ({
	request,
	ctx,
	caller,
	launches,
	warnings,
}) => {
	if (request.project.kind !== "existing") {
		throw new Error(
			`existingProjectHandler cannot handle project.kind='${request.project.kind}'`,
		);
	}
	const projectId = request.project.projectId;
	const source = request.source;
	switch (source.kind) {
		case "main": {
			const row = ctx.db.query.workspaces
				.findFirst({
					where: (w, { and, eq }) =>
						and(eq(w.projectId, projectId), eq(w.type, "main")),
				})
				.sync();
			if (!row) throw new Error("PROJECT_NOT_FOUND: no main workspace");
			return {
				projectId,
				workspaceId: row.id,
				disposition: "reused",
				launches,
				warnings,
			};
		}
		case "branch": {
			const branch =
				source.name.kind === "explicit" ? source.name.value : undefined;
			const result = await caller.workspaces.create({
				projectId,
				branch,
				baseBranch: source.from.kind === "ref" ? source.from.value : undefined,
				taskId: request.display?.taskId,
				name: request.display?.name,
			});
			return {
				projectId,
				workspaceId: result.workspace.id,
				disposition: result.alreadyExists ? "reused" : "created",
				launches,
				warnings,
				artifacts: [
					{
						kind: "worktree",
						identity:
							ctx.db.query.workspaces
								.findFirst({
									where: (w, { eq }) => eq(w.id, result.workspace.id),
								})
								.sync()?.worktreePath ?? "",
						ownership: result.alreadyExists ? "adopted" : "created",
					},
				] satisfies RunnerArtifact[],
			};
		}
		case "worktree": {
			const result = await caller.workspaceCreation.adopt({
				projectId,
				workspaceName: request.display?.name ?? source.path,
				branch: source.expectedBranch ?? "",
				worktreePath: source.path,
			});
			return {
				projectId,
				workspaceId: result.workspace.id,
				disposition: "adopted",
				launches,
				warnings,
				artifacts: [
					{
						kind: "worktree",
						identity: source.path,
						ownership: "adopted",
					},
				] satisfies RunnerArtifact[],
			};
		}
		case "pull-request": {
			const result = await caller.workspaces.create({
				projectId,
				pr: source.number,
				taskId: request.display?.taskId,
				name: request.display?.name,
			});
			return {
				projectId,
				workspaceId: result.workspace.id,
				disposition: result.alreadyExists ? "reused" : "created",
				launches,
				warnings,
				artifacts: [
					{
						kind: "worktree",
						identity:
							ctx.db.query.workspaces
								.findFirst({
									where: (w, { eq }) => eq(w.id, result.workspace.id),
								})
								.sync()?.worktreePath ?? "",
						ownership: result.alreadyExists ? "adopted" : "created",
					},
				] satisfies RunnerArtifact[],
			};
		}
	}
};

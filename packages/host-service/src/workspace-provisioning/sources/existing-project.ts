import type { RunnerArtifact } from "../workspace-provisioning";
import { materializeExistingProjectSource } from "./git-materializer";
import type { SourceHandler } from "./types";

/**
 * `ProjectTarget.existing` — the project row lives in Catalog already.
 * Dispatches on `WorkspaceSource`; Git materialization is direct and
 * checkpointed in `git-materializer.ts`.
 */
export const existingProjectHandler: SourceHandler = async (context) => {
	const { request, ctx, launches, warnings } = context;
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
			const result = await materializeExistingProjectSource(context);
			return {
				projectId,
				workspaceId: result.workspaceId,
				disposition: result.disposition,
				launches,
				warnings,
				artifacts: result.artifacts satisfies RunnerArtifact[],
			};
		}
		case "worktree": {
			const result = await materializeExistingProjectSource(context);
			return {
				projectId,
				workspaceId: result.workspaceId,
				disposition: "adopted",
				launches,
				warnings,
				artifacts: result.artifacts satisfies RunnerArtifact[],
			};
		}
		case "pull-request": {
			const result = await materializeExistingProjectSource(context);
			return {
				projectId,
				workspaceId: result.workspaceId,
				disposition: result.disposition,
				launches,
				warnings,
				artifacts: result.artifacts satisfies RunnerArtifact[],
			};
		}
	}
};

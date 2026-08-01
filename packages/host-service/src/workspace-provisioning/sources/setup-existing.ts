import type { RunnerArtifact } from "../workspace-provisioning";
import type { SourceHandler } from "./types";

/**
 * `ProjectTarget.setup-existing` — the Project ID already exists in
 * Catalog (typically minted on another host) and needs to be set up on
 * this device by either cloning or importing an existing local repo.
 * Delegates to `project.setup` which handles the Catalog commit + main
 * workspace atomically.
 */
export const setupExistingHandler: SourceHandler = async ({
	request,
	ctx,
	caller,
	launches,
	warnings,
}) => {
	if (request.project.kind !== "setup-existing") {
		throw new Error(
			`setupExistingHandler cannot handle project.kind='${request.project.kind}'`,
		);
	}
	const projectId = request.project.projectId;
	const alreadyConfigured = ctx.catalog
		.snapshot()
		.projects.some((project) => project.id === projectId);
	const setup = await caller.project.setup({
		projectId,
		origin: {
			repoCloneUrl: request.project.origin.repoUrl ?? null,
			name: request.project.origin.name,
		},
		mode:
			request.project.mode.kind === "clone"
				? {
						kind: "clone",
						parentDir: request.project.mode.parentDirectory,
					}
				: {
						kind: "import",
						repoPath: request.project.mode.path,
						allowRelocate: request.project.mode.allowRelocate ?? false,
					},
	});
	if (!setup.mainWorkspaceId) {
		throw new Error("project.setup returned no mainWorkspaceId");
	}
	return {
		projectId,
		workspaceId: setup.mainWorkspaceId,
		disposition: "created",
		launches,
		warnings,
		artifacts: [
			{
				kind: "repo-dir",
				identity: setup.repoPath,
				ownership: alreadyConfigured ? "adopted" : "created",
			},
		] satisfies RunnerArtifact[],
	};
};

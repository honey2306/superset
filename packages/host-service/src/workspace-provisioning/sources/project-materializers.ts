import type { SourceHandler } from "./types";

/**
 * Shared entry point for the four `ProjectTarget` kinds whose Catalog
 * commit goes through `project.create`: clone / empty / import /
 * template. Each maps its wire-shape request onto the tRPC mode
 * discriminator; the Catalog commit and main-workspace insert already
 * happen inside `project.create` on the host side.
 */
export const projectMaterializerHandler: SourceHandler = async ({
	request,
	caller,
	launches,
	warnings,
}) => {
	const project = request.project;
	if (
		project.kind !== "import" &&
		project.kind !== "clone" &&
		project.kind !== "empty" &&
		project.kind !== "template"
	) {
		throw new Error(
			`projectMaterializerHandler cannot handle project.kind='${project.kind}'`,
		);
	}

	const created = await caller.project.create({
		name: project.name,
		mode:
			project.kind === "import"
				? {
						kind: "importLocal",
						repoPath: project.path,
						initIfNeeded: project.git === "initialize-with-consent",
					}
				: project.kind === "clone"
					? {
							kind: "clone",
							parentDir: project.parentDirectory,
							url: project.url,
						}
					: project.kind === "empty"
						? { kind: "empty", parentDir: project.parentDirectory }
						: {
								kind: "template",
								parentDir: project.parentDirectory,
								url: project.url,
							},
	});
	return {
		projectId: created.projectId,
		workspaceId: created.mainWorkspaceId,
		disposition: "created",
		launches,
		warnings,
	};
};

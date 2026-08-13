import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { basename, resolve as resolvePath } from "node:path";
import { parseGitHubRemote } from "@superset/shared/github-remote";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { projects } from "../../db/schema";
import { ensureMainWorkspaceStrict } from "../../trpc/router/project/utils/ensure-main-workspace";
import { persistLocalProject } from "../../trpc/router/project/utils/persist-project";
import {
	cloneRepoInto,
	cloneTemplateInto,
	deriveCloneDirectoryName,
	initEmptyRepo,
	initLocalRepoInPlace,
	type ResolvedRepo,
	resolveLocalRepo,
	resolveMatchingSlug,
	tryRevParseGitRoot,
} from "../../trpc/router/project/utils/resolve-repo";
import type { RunnerArtifact } from "../workspace-provisioning";
import {
	runCatalogCommitStep,
	runReconciledSourceStep,
	runSourceStep,
	type SourceHandler,
} from "./types";

/**
 * Direct ProjectTarget materialization. Repository preparation and Catalog
 * commit are separate durable steps, so a retry can reuse a completed clone,
 * import, init, or template repository without invoking a legacy tRPC route.
 */
export const projectMaterializerHandler: SourceHandler = async (context) => {
	const project = context.request.project;
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

	const prepared = await runPreparedRepository(context, project);
	const preparedArtifact: RunnerArtifact = {
		kind: "repo-dir",
		identity: prepared.repoPath,
		ownership: project.kind === "import" ? "adopted" : "created",
	};
	if (preparedArtifact.ownership === "created") {
		context.journal.recordArtifacts(context.operationId, [preparedArtifact]);
	}
	const identity = await runSourceStep(
		context,
		"project-identity",
		{ projectKind: project.kind },
		async () => ({ projectId: randomUUID() }),
	);
	const catalog = await commitProject(context, {
		projectId: identity.projectId,
		prepared,
		name: project.name,
	});
	const artifacts: RunnerArtifact[] = [preparedArtifact];
	return {
		projectId: catalog.projectId,
		workspaceId: catalog.workspaceId,
		disposition: catalog.disposition,
		launches: context.launches,
		warnings: context.warnings,
		artifacts,
	};
};

async function runPreparedRepository(
	context: Parameters<SourceHandler>[0],
	project: Extract<
		Parameters<SourceHandler>[0]["request"]["project"],
		{ kind: "import" | "clone" | "empty" | "template" }
	>,
): Promise<ResolvedRepo> {
	const input = {
		projectKind: project.kind,
		path:
			project.kind === "import"
				? project.path
				: project.kind === "clone" || project.kind === "template"
					? project.parentDirectory
					: project.parentDirectory,
	};
	return runReconciledSourceStep<ResolvedRepo>(
		context,
		"prepare-repository",
		input,
		async (receipt) => {
			if (!existsSync(receipt.repoPath)) return false;
			return (await tryRevParseGitRoot(receipt.repoPath)) === receipt.repoPath;
		},
		async () => {
			switch (project.kind) {
				case "import":
					return project.git === "initialize-with-consent"
						? initLocalRepoInPlace(project.path)
						: resolveLocalRepo(project.path);
				case "clone": {
					const target = resolvePath(
						project.parentDirectory,
						deriveCloneDirectoryName(project.url),
					);
					const existingRoot = await tryRevParseGitRoot(target);
					return existingRoot
						? resolveLocalRepo(existingRoot)
						: cloneRepoInto(
								project.url,
								project.parentDirectory,
								context.ctx.credentials,
							);
				}
				case "empty": {
					const directory = directoryNameForEmpty(project.name);
					const target = resolvePath(project.parentDirectory, directory);
					const existingRoot = await tryRevParseGitRoot(target);
					return existingRoot
						? resolveLocalRepo(existingRoot)
						: initEmptyRepo(project.parentDirectory, directory);
				}
				case "template": {
					const directory = directoryNameForEmpty(project.name);
					const target = resolvePath(project.parentDirectory, directory);
					const existingRoot = await tryRevParseGitRoot(target);
					return existingRoot
						? resolveLocalRepo(existingRoot)
						: cloneTemplateInto(
								project.url,
								project.parentDirectory,
								directory,
								context.ctx.credentials,
							);
				}
			}
		},
	);
}

/** Direct setup-existing materializer; project ID is supplied by the caller. */
export const setupExistingHandler: SourceHandler = async (context) => {
	const project = context.request.project;
	if (project.kind !== "setup-existing") {
		throw new Error(
			`setupExistingHandler cannot handle project.kind='${project.kind}'`,
		);
	}

	const prepared = await runReconciledSourceStep<ResolvedRepo>(
		context,
		"prepare-repository",
		{ projectId: project.projectId, mode: project.mode.kind },
		async (receipt) =>
			(await tryRevParseGitRoot(receipt.repoPath)) === receipt.repoPath,
		async () => {
			if (project.mode.kind === "clone") {
				if (!project.origin.repoUrl) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Project has no linked repository and cannot be cloned",
					});
				}
				const target = resolvePath(
					project.mode.parentDirectory,
					deriveCloneDirectoryName(project.origin.repoUrl),
				);
				const existingRoot = await tryRevParseGitRoot(target);
				return existingRoot
					? resolveLocalRepo(existingRoot)
					: cloneRepoInto(
							project.origin.repoUrl,
							project.mode.parentDirectory,
							context.ctx.credentials,
						);
			}
			const origin = project.origin.repoUrl
				? parseGitHubRemote(project.origin.repoUrl)
				: null;
			if (project.mode.kind !== "import") {
				throw new Error("Unsupported setup mode");
			}
			return origin
				? resolveMatchingSlug(
						project.mode.path,
						`${origin.owner}/${origin.name}`,
					)
				: resolveLocalRepo(project.mode.path);
		},
	);

	const existingOwner = context.ctx.db
		.select({ id: projects.id, repoPath: projects.repoPath })
		.from(projects)
		.where(eq(projects.repoPath, prepared.repoPath))
		.get();
	if (existingOwner && existingOwner.id !== project.projectId) {
		throw new TRPCError({
			code: "CONFLICT",
			message:
				"Repository is already set up as another project on this device.",
		});
	}

	const catalog = await runCatalogCommitStep(
		context,
		"materialize",
		{ projectId: project.projectId, repoPath: prepared.repoPath },
		async () => {
			persistLocalProject(context.ctx, project.projectId, prepared, {
				name: project.origin.name ?? basename(prepared.repoPath),
			});
			const main = await ensureMainWorkspaceStrict(
				context.ctx,
				project.projectId,
				prepared.repoPath,
			);
			return { projectId: project.projectId, workspaceId: main.id };
		},
	);
	const artifacts: RunnerArtifact[] = [
		{
			kind: "repo-dir",
			identity: prepared.repoPath,
			ownership: "adopted",
		},
	];
	return {
		projectId: catalog.projectId,
		workspaceId: catalog.workspaceId,
		disposition: "created",
		launches: context.launches,
		warnings: context.warnings,
		artifacts,
	};
};

async function commitProject(
	context: Parameters<SourceHandler>[0],
	args: {
		projectId: string;
		prepared: ResolvedRepo;
		name: string;
	},
): Promise<{
	projectId: string;
	workspaceId: string;
	disposition: "created" | "reused";
}> {
	const existingByPath = context.ctx.db
		.select({ id: projects.id })
		.from(projects)
		.where(eq(projects.repoPath, args.prepared.repoPath))
		.get();
	if (existingByPath && existingByPath.id !== args.projectId) {
		throw new TRPCError({
			code: "CONFLICT",
			message:
				"Repository is already set up as another project on this device.",
		});
	}

	return runCatalogCommitStep(
		context,
		"materialize",
		{
			projectId: args.projectId,
			repoPath: args.prepared.repoPath,
		},
		async () => {
			const existingProject = context.ctx.db.query.projects
				.findFirst({
					where: (project, { eq }) => eq(project.id, args.projectId),
				})
				.sync();
			if (!existingProject) {
				persistLocalProject(context.ctx, args.projectId, args.prepared, {
					name: args.name,
				});
			}
			const main = await ensureMainWorkspaceStrict(
				context.ctx,
				args.projectId,
				args.prepared.repoPath,
			);
			return {
				projectId: args.projectId,
				workspaceId: main.id,
				disposition: existingProject
					? ("reused" as const)
					: ("created" as const),
			};
		},
	);
}

function directoryNameForEmpty(name: string): string {
	const slug = name
		.trim()
		.replace(/[^a-zA-Z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	if (!slug) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Project name must produce a non-empty directory name",
		});
	}
	return slug;
}

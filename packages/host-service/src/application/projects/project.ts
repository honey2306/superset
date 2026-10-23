import { basename } from "node:path";
import { BRANCH_PREFIX_MODES } from "@superset/shared/workspace-launch";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { projects, workspaces } from "../../db/schema";
import {
	createProjectMemory,
	deleteProjectMemory,
	listProjectMemories,
	PROJECT_MEMORY_CATEGORIES,
	updateProjectMemory,
} from "../../project-memories";
import {
	emitProjectChanged,
	toProjectSnapshot,
	updateLocalProject,
} from "../../projects/local-project-store";
import type { HostServiceContext } from "../../types";
import { deleteLocalWorkspace } from "../../workspaces/local-workspace-store";
import { HostOperationError } from "../errors";
import {
	normalizeSparseCheckoutPaths,
	parseSparseCheckoutPaths,
	serializeSparseCheckoutPaths,
} from "../workspaces/shared/sparse-checkout";
import { normalizeWorktreeBaseDir } from "../workspaces/shared/worktree-paths";
import {
	resolveLocalRepo,
	tryRevParseGitRoot,
	validateDirectoryPath,
} from "./utils/resolve-repo";

export const operationInputs = {
	update: z.object({
		projectId: z.string().uuid(),
		name: z.string().min(1),
	}),
	get: z.object({ projectId: z.string().uuid() }),
	listMemories: z.object({
		projectId: z.string().uuid().nullable(),
		query: z.string().max(500).optional(),
		includeDisabled: z.boolean().default(true),
		limit: z.number().int().min(1).max(500).default(200),
	}),
	createMemory: z.object({
		projectId: z.string().uuid().nullable(),
		title: z.string().trim().min(1).max(200),
		content: z.string().trim().min(1).max(20_000),
		category: z.enum(PROJECT_MEMORY_CATEGORIES).default("other"),
		pinned: z.boolean().default(false),
	}),
	updateMemory: z.object({
		projectId: z.string().uuid().nullable(),
		memoryId: z.string().uuid(),
		patch: z
			.object({
				title: z.string().trim().min(1).max(200).optional(),
				content: z.string().trim().min(1).max(20_000).optional(),
				category: z.enum(PROJECT_MEMORY_CATEGORIES).optional(),
				pinned: z.boolean().optional(),
				enabled: z.boolean().optional(),
			})
			.refine((patch) => Object.keys(patch).length > 0, "Empty patch"),
	}),
	deleteMemory: z.object({
		projectId: z.string().uuid().nullable(),
		memoryId: z.string().uuid(),
	}),
	setSparseCheckoutPaths: z.object({
		projectId: z.string().uuid(),
		paths: z.array(z.string().max(1024)).max(1000),
	}),
	setWorktreeBaseDir: z.object({
		projectId: z.string().uuid(),
		path: z.string().nullable(),
	}),
	setBranchPrefix: z.object({
		projectId: z.string().uuid(),
		mode: z.enum(BRANCH_PREFIX_MODES).nullable(),
		customPrefix: z.string().nullable().optional(),
	}),
	findBackfillConflict: z.object({
		projectId: z.string().uuid(),
		repoPath: z.string().min(1),
	}),
	findByPath: z.object({ repoPath: z.string().min(1) }),
	remove: z.object({ projectId: z.string().uuid() }),
};
export const operations = {
	list: ({ ctx }: { ctx: HostServiceContext; signal?: AbortSignal }) => {
		return ctx.db
			.select()
			.from(projects)
			.all()
			.map((row) => ({
				id: row.id,
				// Empty until the backfill sweep fills it; folder name is the
				// honest fallback (same rule as toProjectSnapshot).
				name: row.name || basename(row.repoPath),
				repoPath: row.repoPath,
				repoOwner: row.repoOwner,
				repoName: row.repoName,
				repoUrl: row.repoUrl,
				worktreeBaseDir: row.worktreeBaseDir,
				createdAt: row.createdAt,
				updatedAt: row.updatedAt || row.createdAt,
			}));
	},
	update: ({
		ctx,
		input,
	}: {
		ctx: HostServiceContext;
		input: z.output<typeof operationInputs.update>;
		signal?: AbortSignal;
	}) => {
		const row = updateLocalProject(
			{ db: ctx.db, eventBus: ctx.eventBus, catalog: ctx.catalog },
			input.projectId,
			{ name: input.name },
		);
		if (!row) {
			throw new HostOperationError({
				code: "NOT_FOUND",
				message: "Project is not set up on this host",
			});
		}
		return toProjectSnapshot(row);
	},
	get: ({
		ctx,
		input,
	}: {
		ctx: HostServiceContext;
		input: z.output<typeof operationInputs.get>;
		signal?: AbortSignal;
	}) => {
		const row = ctx.db
			.select()
			.from(projects)
			.where(eq(projects.id, input.projectId))
			.get();
		if (!row) return null;
		return {
			id: row.id,
			// Same fallback rule as project.list / toProjectSnapshot.
			name: row.name || basename(row.repoPath),
			repoPath: row.repoPath,
			repoOwner: row.repoOwner,
			repoName: row.repoName,
			repoUrl: row.repoUrl,
			worktreeBaseDir: row.worktreeBaseDir,
			branchPrefixMode: row.branchPrefixMode,
			branchPrefixCustom: row.branchPrefixCustom,
			sparseCheckoutPaths: parseSparseCheckoutPaths(row.sparseCheckoutPaths),
		};
	},
	listMemories: ({
		ctx,
		input,
	}: {
		ctx: HostServiceContext;
		input: z.output<typeof operationInputs.listMemories>;
		signal?: AbortSignal;
	}) =>
		listProjectMemories(ctx.db, input).map((memory) => ({
			...memory,
			scope:
				memory.projectId === null ? ("global" as const) : ("project" as const),
		})),
	createMemory: ({
		ctx,
		input,
	}: {
		ctx: HostServiceContext;
		input: z.output<typeof operationInputs.createMemory>;
		signal?: AbortSignal;
	}) => {
		const result = createProjectMemory(ctx.db, {
			...input,
			source: "manual",
		});
		return {
			...result,
			memory: {
				...result.memory,
				scope:
					result.memory.projectId === null
						? ("global" as const)
						: ("project" as const),
			},
		};
	},
	updateMemory: ({
		ctx,
		input,
	}: {
		ctx: HostServiceContext;
		input: z.output<typeof operationInputs.updateMemory>;
		signal?: AbortSignal;
	}) => {
		const memory = updateProjectMemory(
			ctx.db,
			input.projectId,
			input.memoryId,
			input.patch,
		);
		if (!memory) {
			throw new HostOperationError({
				code: "NOT_FOUND",
				message: "Project memory not found",
			});
		}
		return {
			...memory,
			scope:
				memory.projectId === null ? ("global" as const) : ("project" as const),
		};
	},
	deleteMemory: ({
		ctx,
		input,
	}: {
		ctx: HostServiceContext;
		input: z.output<typeof operationInputs.deleteMemory>;
		signal?: AbortSignal;
	}) => ({
		deleted: deleteProjectMemory(ctx.db, input.projectId, input.memoryId),
	}),
	setSparseCheckoutPaths: ({
		ctx,
		input,
	}: {
		ctx: HostServiceContext;
		input: z.output<typeof operationInputs.setSparseCheckoutPaths>;
		signal?: AbortSignal;
	}) => {
		const paths = normalizeSparseCheckoutPaths(input.paths);
		const updated = ctx.catalog.updateProject(input.projectId, {
			sparseCheckoutPaths: serializeSparseCheckoutPaths(paths),
		});
		if (!updated)
			throw new HostOperationError({
				code: "NOT_FOUND",
				message: "Project is not set up on this host",
			});
		return { sparseCheckoutPaths: paths };
	},
	setWorktreeBaseDir: ({
		ctx,
		input,
	}: {
		ctx: HostServiceContext;
		input: z.output<typeof operationInputs.setWorktreeBaseDir>;
		signal?: AbortSignal;
	}) => {
		const worktreeBaseDir = normalizeWorktreeBaseDir(input.path);
		const project = ctx.catalog.updateProject(input.projectId, {
			worktreeBaseDir,
		});
		if (!project) {
			throw new HostOperationError({
				code: "NOT_FOUND",
				message: "Project is not set up on this host",
			});
		}

		return {
			id: project.id,
			worktreeBaseDir: project.worktreeBaseDir ?? null,
		};
	},
	setBranchPrefix: ({
		ctx,
		input,
	}: {
		ctx: HostServiceContext;
		input: z.output<typeof operationInputs.setBranchPrefix>;
		signal?: AbortSignal;
	}) => {
		const updated = ctx.catalog.updateProject(input.projectId, {
			branchPrefixMode: input.mode,
			branchPrefixCustom: input.customPrefix ?? null,
		});
		if (!updated) {
			throw new HostOperationError({
				code: "NOT_FOUND",
				message: `Project not set up locally: ${input.projectId}`,
			});
		}
		return { success: true as const };
	},
	findBackfillConflict: () => {
		// Multiple v2 projects may point at the same GitHub URL, so a matching
		// repo URL is no longer a conflict. Kept for backwards-compatible
		// clients while older settings screens still call the endpoint.
		return { conflict: null };
	},
	findByPath: async ({
		ctx,
		input,
	}: {
		ctx: HostServiceContext;
		input: z.output<typeof operationInputs.findByPath>;
		signal?: AbortSignal;
	}) => {
		// Detect "folder isn't a git repo yet" without throwing, so the import
		// UI can offer to initialize it instead of dead-ending on BAD_REQUEST.
		const root = await tryRevParseGitRoot(input.repoPath);
		if (root === null) {
			validateDirectoryPath(input.repoPath, "Path");
			return { candidates: [], needsGitInit: true as const };
		}

		const { repoPath: gitRoot } = await resolveLocalRepo(root);
		const localProject = ctx.db.query.projects
			.findFirst({ where: eq(projects.repoPath, gitRoot) })
			.sync();
		if (!localProject) return { candidates: [] };

		return {
			candidates: [
				{
					id: localProject.id,
					name: localProject.name || localProject.repoName || basename(gitRoot),
				},
			],
		};
	},
	remove: async ({
		ctx,
		input,
	}: {
		ctx: HostServiceContext;
		input: z.output<typeof operationInputs.remove>;
		signal?: AbortSignal;
	}) => {
		const localProject = ctx.db.query.projects
			.findFirst({ where: eq(projects.id, input.projectId) })
			.sync();
		if (!localProject) return { success: true, repoPath: null };
		let releaseTaskReservation: (() => void) | undefined;
		try {
			releaseTaskReservation = ctx.runtime?.tasks?.store.reserveRemoval({
				projectId: input.projectId,
			});
		} catch (error) {
			throw new HostOperationError({
				code: "BAD_REQUEST",
				message: error instanceof Error ? error.message : String(error),
			});
		}
		try {
			const localWorkspaces = ctx.db
				.select()
				.from(workspaces)
				.where(eq(workspaces.projectId, input.projectId))
				.all();

			for (const ws of localWorkspaces) {
				if (ws.worktreePath === localProject.repoPath) continue;
				try {
					const git = await ctx.git(localProject.repoPath);
					await git.raw(["worktree", "remove", ws.worktreePath]);
				} catch (err) {
					console.warn("[project.remove] failed to remove worktree", {
						projectId: input.projectId,
						worktreePath: ws.worktreePath,
						err,
					});
				}
			}

			try {
				// Route both cascade deletes and the project delete through
				// the Catalog so the journal reflects one atomic clear.
				for (const ws of localWorkspaces) {
					deleteLocalWorkspace(
						{ db: ctx.db, eventBus: ctx.eventBus, catalog: ctx.catalog },
						ws.id,
					);
				}
				ctx.catalog.deleteProject(input.projectId);
				emitProjectChanged(ctx.eventBus, "deleted", input.projectId);
			} catch (err) {
				throw new HostOperationError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Failed to delete project locally: ${err instanceof Error ? err.message : String(err)}`,
				});
			}

			return { success: true, repoPath: localProject.repoPath };
		} finally {
			releaseTaskReservation?.();
		}
	},
};

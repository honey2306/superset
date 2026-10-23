import { eq } from "drizzle-orm";
import { z } from "zod";
import { projects } from "../../db/schema";
import type { HostServiceContext } from "../../types";
import { getLocalWorkspace } from "../../workspaces/local-workspace-store";
import { HostOperationError } from "../errors";
import { requireLocalProject } from "./shared/local-project";
import { generateBranchNameFromPrompt } from "./utils/ai-branch-name";
import { applyAiWorkspaceRename } from "./utils/ai-workspace-names";
import { listBranchNames } from "./utils/list-branch-names";

export const operationInputs = {
	aiRename: z.object({
		workspaceId: z.string().uuid(),
		prompt: z.string().min(1),
	}),
	generateBranchName: z.object({
		projectId: z.string(),
		prompt: z.string().min(1),
	}),
};
export const operations = {
	aiRename: async ({
		ctx,
		input,
	}: {
		ctx: HostServiceContext;
		input: z.output<typeof operationInputs.aiRename>;
		signal?: AbortSignal;
	}) => {
		const local = getLocalWorkspace(ctx.db, input.workspaceId);
		if (!local) {
			throw new HostOperationError({
				code: "NOT_FOUND",
				message: `Workspace not found: ${input.workspaceId}`,
			});
		}
		const project = ctx.db.query.projects
			.findFirst({ where: eq(projects.id, local.projectId) })
			.sync();
		if (!project) {
			throw new HostOperationError({
				code: "NOT_FOUND",
				message: "Local project not found for workspace",
			});
		}
		void applyAiWorkspaceRename({
			ctx,
			workspaceId: input.workspaceId,
			repoPath: project.repoPath ?? "",
			worktreePath: local.worktreePath,
			oldBranchName: local.branch,
			oldWorkspaceName: local.name || local.branch,
			prompt: input.prompt,
			renameTitle: true,
			renameBranch: true,
		}).catch((err) => {
			console.warn("[workspaces.aiRename] failed", err);
		});
		return { success: true as const };
	},
	generateBranchName: async ({
		ctx,
		input,
	}: {
		ctx: HostServiceContext;
		input: z.output<typeof operationInputs.generateBranchName>;
		signal?: AbortSignal;
	}) => {
		const localProject = requireLocalProject(ctx, input.projectId);
		const existingBranches = await listBranchNames(ctx, localProject.repoPath);
		const branchName = await generateBranchNameFromPrompt(
			input.prompt,
			existingBranches,
		);
		return { branchName };
	},
};

import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { projects } from "../../../db/schema";
import { getLocalWorkspace } from "../../../workspaces/local-workspace-store";
import { protectedProcedure, router } from "../../index";
import { requireLocalProject } from "../workspace-creation/shared/local-project";
import { generateBranchNameFromPrompt } from "../workspace-creation/utils/ai-branch-name";
import { applyAiWorkspaceRename } from "../workspace-creation/utils/ai-workspace-names";
import { listBranchNames } from "../workspace-creation/utils/list-branch-names";

export const workspacesRouter = router({
	aiRename: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				prompt: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const local = getLocalWorkspace(ctx.db, input.workspaceId);
			if (!local) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Workspace not found: ${input.workspaceId}`,
				});
			}
			const project = ctx.db.query.projects
				.findFirst({ where: eq(projects.id, local.projectId) })
				.sync();
			if (!project) {
				throw new TRPCError({
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
		}),

	generateBranchName: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				prompt: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const localProject = requireLocalProject(ctx, input.projectId);
			const existingBranches = await listBranchNames(
				ctx,
				localProject.repoPath,
			);
			const branchName = await generateBranchNameFromPrompt(
				input.prompt,
				existingBranches,
			);
			return { branchName };
		}),
});

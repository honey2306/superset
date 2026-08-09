import { z } from "zod";
import { protectedProcedure, router } from "../../index";
import { getContent } from "./procedures/get-content";

export const pullRequestsRouter = router({
	unlinkFromWorkspace: protectedProcedure
		.input(z.object({ workspaceId: z.string() }))
		.mutation(({ ctx, input }) => {
			ctx.runtime.pullRequests.unlinkWorkspacePullRequest(input.workspaceId);
			return { ok: true };
		}),
	restoreToWorkspace: protectedProcedure
		.input(z.object({ workspaceId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			await ctx.runtime.pullRequests.restoreWorkspacePullRequest(
				input.workspaceId,
			);
			return { ok: true };
		}),
	getByWorkspaces: protectedProcedure
		.input(
			z.object({
				workspaceIds: z.array(z.string()),
			}),
		)
		.query(async ({ ctx, input }) => {
			const workspaces =
				await ctx.runtime.pullRequests.getPullRequestsByWorkspaces(
					input.workspaceIds,
				);
			return { workspaces };
		}),
	refreshByWorkspaces: protectedProcedure
		.input(
			z.object({
				workspaceIds: z.array(z.string()),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await ctx.runtime.pullRequests.refreshPullRequestsByWorkspaces(
				input.workspaceIds,
			);
			return { ok: true };
		}),
	getContent,
});

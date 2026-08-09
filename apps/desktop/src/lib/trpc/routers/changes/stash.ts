import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	gitStashApplyAt,
	gitStashDropAt,
	gitStashFileList,
	gitStashFileVersions,
	gitStashList,
	gitStashPopAt,
	type StashEntry,
} from "./security/git-commands";
import { clearStatusCacheForWorktree } from "./utils/status-cache";

const stashIndexInput = z.object({
	worktreePath: z.string(),
	index: z.number().int().min(0),
});

export const createStashRouter = () => {
	return router({
		stashList: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.query(async ({ input }): Promise<StashEntry[]> => {
				return gitStashList(input.worktreePath);
			}),

		stashApplyAt: publicProcedure
			.input(stashIndexInput)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				await gitStashApplyAt(input.worktreePath, input.index);
				clearStatusCacheForWorktree(input.worktreePath);
				return { success: true };
			}),

		stashPopAt: publicProcedure
			.input(stashIndexInput)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				await gitStashPopAt(input.worktreePath, input.index);
				clearStatusCacheForWorktree(input.worktreePath);
				return { success: true };
			}),

		stashDropAt: publicProcedure
			.input(stashIndexInput)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				await gitStashDropAt(input.worktreePath, input.index);
				clearStatusCacheForWorktree(input.worktreePath);
				return { success: true };
			}),

		stashFiles: publicProcedure
			.input(stashIndexInput)
			.query(
				async ({ input }): Promise<Array<{ path: string; status: string }>> => {
					return gitStashFileList(input.worktreePath, input.index);
				},
			),

		stashFileVersions: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					index: z.number().int().min(0),
					filePath: z.string(),
				}),
			)
			.query(async ({ input }): Promise<{ before: string; after: string }> => {
				return gitStashFileVersions(
					input.worktreePath,
					input.index,
					input.filePath,
				);
			}),
	});
};

import { z } from "zod";

export const searchBranchesInputSchema = z.object({
	projectId: z.string(),
	query: z.string().optional(),
	cursor: z.string().optional(),
	limit: z.number().min(1).max(200).optional(),
	refresh: z.boolean().optional(),
	filter: z.enum(["all", "worktree"]).optional(),
});

export const githubSearchInputSchema = z.object({
	projectId: z.string(),
	query: z.string().optional(),
	limit: z.number().min(1).max(100).optional(),
	includeClosed: z.boolean().optional(),
	page: z.number().int().min(1).optional(),
});

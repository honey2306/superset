import { z } from "zod";
import { publicProcedure, router } from "../..";
import { gitFileLog, gitLog } from "./security/git-commands";

export interface LogEntry {
	hash: string;
	shortHash: string;
	message: string;
	author: string;
	date: number;
}

export const createLogRouter = () => {
	return router({
		listLog: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					limit: z.number().int().min(1).max(500).default(50),
					skip: z.number().int().min(0).default(0),
					grep: z.string().optional(),
					author: z.string().optional(),
				}),
			)
			.query(async ({ input }): Promise<LogEntry[]> => {
				return gitLog(input.worktreePath, {
					limit: input.limit,
					skip: input.skip,
					grep: input.grep,
					author: input.author,
				});
			}),

		getFileHistory: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
					limit: z.number().int().min(1).max(200).default(100),
				}),
			)
			.query(async ({ input }): Promise<LogEntry[]> => {
				return gitFileLog(input.worktreePath, input.filePath, {
					limit: input.limit,
				});
			}),
	});
};

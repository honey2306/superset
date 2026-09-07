import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	globalMcpConfigPath,
	globalMcpServerInputSchema,
	readGlobalMcpServers,
	removeGlobalMcpServer,
	replaceGlobalMcpServer,
	upsertGlobalMcpServer,
} from "../../../global-mcp";
import { protectedProcedure, router } from "../../index";

function readServers() {
	try {
		return readGlobalMcpServers();
	} catch (error) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: error instanceof Error ? error.message : String(error),
		});
	}
}

export const globalMcpRouter = router({
	list: protectedProcedure.query(() => ({
		configPath: globalMcpConfigPath(),
		servers: readServers(),
	})),

	upsert: protectedProcedure
		.input(
			z
				.object({
					originalName: z.string().trim().min(1).max(64).optional(),
					server: globalMcpServerInputSchema,
				})
				.strict(),
		)
		.mutation(({ input }) => {
			try {
				const server = input.originalName
					? replaceGlobalMcpServer(input.originalName, input.server)
					: upsertGlobalMcpServer(input.server);
				return { server, servers: readGlobalMcpServers() };
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}),

	remove: protectedProcedure
		.input(z.object({ name: z.string().trim().min(1).max(64) }).strict())
		.mutation(({ input }) => {
			try {
				return {
					removed: removeGlobalMcpServer(input.name),
					servers: readGlobalMcpServers(),
				};
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}),
});

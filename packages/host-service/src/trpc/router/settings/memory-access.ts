import { basename } from "node:path";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { projects } from "../../../db/schema";
import {
	memoryAccessSettingsSchema,
	readMemoryAccessSettings,
	writeMemoryAccessSettings,
} from "../../../project-memories";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, router } from "../../index";

function listRepositoryProjects(ctx: HostServiceContext) {
	return ctx.db
		.select({
			id: projects.id,
			name: projects.name,
			repoPath: projects.repoPath,
		})
		.from(projects)
		.where(eq(projects.kind, "repository"))
		.all()
		.map((project) => ({
			...project,
			name: project.name || basename(project.repoPath),
		}));
}

function readSettings(organizationId: string) {
	try {
		return readMemoryAccessSettings(organizationId);
	} catch (error) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: error instanceof Error ? error.message : String(error),
		});
	}
}

export const memoryAccessRouter = router({
	get: protectedProcedure.query(({ ctx }) => ({
		...readSettings(ctx.organizationId),
		projects: listRepositoryProjects(ctx),
	})),

	set: protectedProcedure
		.input(memoryAccessSettingsSchema)
		.mutation(({ ctx, input }) => {
			if (input.projectIds.length > 0) {
				const matchingProjects = ctx.db
					.select({ id: projects.id })
					.from(projects)
					.where(
						and(
							eq(projects.kind, "repository"),
							inArray(projects.id, input.projectIds),
						),
					)
					.all();
				if (matchingProjects.length !== input.projectIds.length) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							"One or more selected projects are unavailable on this host.",
					});
				}
			}
			try {
				return writeMemoryAccessSettings(ctx.organizationId, input);
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}),
});

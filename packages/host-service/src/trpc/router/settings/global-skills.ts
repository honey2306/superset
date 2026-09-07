import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	globalSkillInputSchema,
	globalSkillsDir,
	readGlobalSkills,
	removeGlobalSkill,
	upsertGlobalSkill,
} from "../../../global-skills";
import { protectedProcedure, router } from "../../index";

function listSkills() {
	try {
		return readGlobalSkills();
	} catch (error) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: error instanceof Error ? error.message : String(error),
		});
	}
}

export const globalSkillsRouter = router({
	list: protectedProcedure.query(() => ({
		directory: globalSkillsDir(),
		skills: listSkills(),
	})),

	upsert: protectedProcedure
		.input(
			z
				.object({
					previousName: z.string().trim().min(1).max(64).optional(),
					skill: globalSkillInputSchema,
				})
				.strict(),
		)
		.mutation(({ input }) => {
			try {
				const skill = upsertGlobalSkill(input.skill, {
					previousName: input.previousName,
				});
				return { skill, skills: readGlobalSkills() };
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
					removed: removeGlobalSkill(input.name),
					skills: readGlobalSkills(),
				};
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}),
});

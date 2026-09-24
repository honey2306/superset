import {
	copySkillSchema,
	saveSkillSchema,
	skillRefSchema,
	skillRevisionSchema,
	skillScopeSchema,
} from "@superset/shared/skills";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	SkillConflictError,
	SkillLibrary,
} from "../../../skills/skill-library";
import { protectedProcedure, router } from "../../index";

function perform<T>(action: () => T): T {
	try {
		return action();
	} catch (error) {
		throw new TRPCError({
			code: error instanceof SkillConflictError ? "CONFLICT" : "BAD_REQUEST",
			message: error instanceof Error ? error.message : String(error),
		});
	}
}
/** Same files used by Agent Skills; no runtime-specific registry or DB. */
export const skillsRouter = router({
	list: protectedProcedure
		.input(z.object({ scope: skillScopeSchema }).strict())
		.query(({ ctx, input }) =>
			perform(() => new SkillLibrary(ctx.db).list(input.scope)),
		),
	get: protectedProcedure
		.input(skillRefSchema)
		.query(({ ctx, input }) =>
			perform(() => new SkillLibrary(ctx.db).get(input.scope, input.name)),
		),
	readFile: protectedProcedure
		.input(skillRefSchema.extend({ path: z.string().min(1).max(1024) }))
		.query(({ ctx, input }) =>
			perform(() =>
				new SkillLibrary(ctx.db).readFile(input.scope, input.name, input.path),
			),
		),
	save: protectedProcedure
		.input(saveSkillSchema)
		.mutation(({ ctx, input }) =>
			perform(() => new SkillLibrary(ctx.db).save(input)),
		),
	remove: protectedProcedure
		.input(skillRefSchema.extend({ expectedRevision: skillRevisionSchema }))
		.mutation(({ ctx, input }) =>
			perform(() =>
				new SkillLibrary(ctx.db).remove(
					input.scope,
					input.name,
					input.expectedRevision,
				),
			),
		),
	copy: protectedProcedure
		.input(copySkillSchema)
		.mutation(({ ctx, input }) =>
			perform(() => new SkillLibrary(ctx.db).copy(input)),
		),
});

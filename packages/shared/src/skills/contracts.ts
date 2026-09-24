import { z } from "zod";

export const skillScopeSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("global") }).strict(),
	z
		.object({
			kind: z.literal("project"),
			projectId: z.string().min(1).max(256),
		})
		.strict(),
]);
export type SkillScope = z.infer<typeof skillScopeSchema>;
export const skillNameSchema = z
	.string()
	.trim()
	.min(1)
	.max(64)
	.regex(/^[a-z0-9][a-z0-9-]*$/);
export const skillDraftSchema = z
	.object({
		name: skillNameSchema,
		description: z.string().trim().min(1).max(1_024),
		instructions: z.string().trim().min(1).max(100_000),
		invocation: z.enum(["auto", "manual"]).default("auto"),
	})
	.strict();
export type SkillDraft = z.infer<typeof skillDraftSchema>;
export interface SkillSummary {
	name: string;
	description: string;
	filePath: string;
	invocation: "auto" | "manual";
}
export interface SkillFile {
	path: string;
	size: number;
	executable: boolean;
}
export interface SkillDetail extends SkillSummary {
	instructions: string;
	/** Hash of the entire bundle, not just SKILL.md, to protect companion files. */
	revision: string;
	files: SkillFile[];
}
export const skillRevisionSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const skillRefSchema = z
	.object({ scope: skillScopeSchema, name: skillNameSchema })
	.strict();
export const saveSkillSchema = z
	.object({
		scope: skillScopeSchema,
		previousName: skillNameSchema.optional(),
		expectedRevision: skillRevisionSchema.nullable(),
		skill: skillDraftSchema,
	})
	.strict();
export const copySkillSchema = z
	.object({
		source: skillRefSchema,
		expectedRevision: skillRevisionSchema,
		target: skillRefSchema,
	})
	.strict();

import { z } from "zod";

const stepped = (min: number, max: number, factor: number) =>
	z
		.number()
		.min(min)
		.max(max)
		.refine(
			(value) => Math.abs(value * factor - Math.round(value * factor)) < 1e-9,
		);
const fontWeight = z
	.number()
	.int()
	.min(100)
	.max(900)
	.refine((value) => value % 100 === 0);

export const setFontSettingsSchema = z.object({
	terminalFontFamily: z.string().max(500).nullable().optional(),
	terminalFontSize: stepped(10, 24, 2).nullable().optional(),
	terminalLineHeight: stepped(1, 2.5, 10).nullable().optional(),
	terminalLetterSpacing: stepped(-2, 4, 10).nullable().optional(),
	terminalFontWeight: fontWeight.nullable().optional(),
	terminalLigatures: z.boolean().nullable().optional(),
	terminalMinimumContrast: z
		.union([z.literal(1), z.literal(3), z.literal(4.5), z.literal(7)])
		.nullable()
		.optional(),
	terminalCursorStyle: z
		.enum(["block", "bar", "underline"])
		.nullable()
		.optional(),
	terminalCursorBlink: z.boolean().nullable().optional(),
	editorFontFamily: z.string().max(500).nullable().optional(),
	editorFontSize: stepped(10, 24, 2).nullable().optional(),
	editorLineHeight: stepped(1, 2.5, 10).nullable().optional(),
	editorLetterSpacing: stepped(-2, 4, 10).nullable().optional(),
	editorFontWeight: fontWeight.nullable().optional(),
	editorLigatures: z.boolean().nullable().optional(),
});

export type SetFontSettingsInput = z.infer<typeof setFontSettingsSchema>;

export function transformFontSettings(
	input: SetFontSettingsInput,
): Record<string, boolean | string | number | null> {
	const set: Record<string, boolean | string | number | null> = {};

	if (input.terminalFontFamily !== undefined) {
		set.terminalFontFamily = input.terminalFontFamily?.trim() || null;
	}
	if (input.terminalFontSize !== undefined) {
		set.terminalFontSize = input.terminalFontSize;
	}
	for (const key of [
		"terminalLineHeight",
		"terminalLetterSpacing",
		"terminalFontWeight",
		"terminalLigatures",
		"terminalMinimumContrast",
		"terminalCursorStyle",
		"terminalCursorBlink",
		"editorLineHeight",
		"editorLetterSpacing",
		"editorFontWeight",
		"editorLigatures",
	] as const)
		if (input[key] !== undefined) set[key] = input[key];
	if (input.editorFontFamily !== undefined) {
		set.editorFontFamily = input.editorFontFamily?.trim() || null;
	}
	if (input.editorFontSize !== undefined) {
		set.editorFontSize = input.editorFontSize;
	}

	return set;
}

import { todoModeValues } from "@superset/db/schema";
import { z } from "zod";

function isValidIanaTimezone(timezone: string): boolean {
	try {
		new Intl.DateTimeFormat(undefined, { timeZone: timezone });
		return true;
	} catch {
		return false;
	}
}

const iana = z
	.string()
	.min(1)
	.refine(isValidIanaTimezone, "Invalid IANA timezone name");

const modeSchema = z.enum(todoModeValues);

export const createTodoSchema = z
	.object({
		title: z.string().min(1).max(200),
		note: z.string().max(10_000).nullish(),
		mode: modeSchema,
		dueAt: z.coerce.date(),
		timezone: iana,
		v2ProjectId: z.string().uuid().nullish(),
		v2WorkspaceId: z.string().uuid().nullish(),
		targetHostId: z.string().min(1).nullish(),
		agent: z.string().min(1).max(200).nullish(),
		prompt: z.string().max(100_000).nullish(),
	})
	.refine(
		(input) => {
			if (input.mode !== "auto") return true;
			return Boolean(
				input.agent &&
					input.prompt &&
					input.prompt.trim().length > 0 &&
					input.targetHostId &&
					(input.v2ProjectId || input.v2WorkspaceId),
			);
		},
		{
			message:
				"auto mode requires agent, prompt, targetHostId, and project or workspace",
			path: ["mode"],
		},
	);

export const updateTodoSchema = z.object({
	id: z.string().uuid(),
	title: z.string().min(1).max(200).optional(),
	note: z.string().max(10_000).nullish(),
	mode: modeSchema.optional(),
	dueAt: z.coerce.date().optional(),
	timezone: iana.optional(),
	v2ProjectId: z.string().uuid().nullish(),
	v2WorkspaceId: z.string().uuid().nullish(),
	targetHostId: z.string().min(1).nullish(),
	agent: z.string().min(1).max(200).nullish(),
	prompt: z.string().max(100_000).nullish(),
});

export const snoozeTodoSchema = z.object({
	id: z.string().uuid(),
	dueAt: z.coerce.date(),
});

export type CreateTodoInput = z.infer<typeof createTodoSchema>;
export type UpdateTodoInput = z.infer<typeof updateTodoSchema>;

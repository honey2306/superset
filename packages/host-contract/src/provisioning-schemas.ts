import { z } from "zod";

// Wire schemas mirroring the discriminated-union types in
// `workspace-provisioning/types.ts`. Duplicated for tRPC's runtime
// validation surface; the types module is the compile-time peer.

const projectTargetSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("existing"), projectId: z.string().uuid() }),
	z.object({
		kind: z.literal("setup-existing"),
		projectId: z.string().uuid(),
		origin: z.object({
			repoUrl: z.string().optional(),
			name: z.string().optional(),
		}),
		mode: z.discriminatedUnion("kind", [
			z.object({
				kind: z.literal("clone"),
				parentDirectory: z.string().min(1),
			}),
			z.object({
				kind: z.literal("import"),
				path: z.string().min(1),
				allowRelocate: z.boolean().optional(),
			}),
		]),
	}),
	z.object({
		kind: z.literal("import"),
		path: z.string().min(1),
		name: z.string().min(1),
		git: z.enum(["require", "initialize-with-consent"]),
	}),
	z.object({
		kind: z.literal("clone"),
		url: z.string().min(1),
		parentDirectory: z.string().min(1),
		name: z.string().min(1),
	}),
	z.object({
		kind: z.literal("empty"),
		parentDirectory: z.string().min(1),
		name: z.string().min(1),
	}),
	z.object({
		kind: z.literal("template"),
		url: z.string().min(1),
		parentDirectory: z.string().min(1),
		name: z.string().min(1),
	}),
	z.object({
		kind: z.literal("temporary"),
		singletonKey: z.literal("default"),
	}),
]);

const workspaceSourceSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("main") }),
	z.object({
		kind: z.literal("branch"),
		name: z.discriminatedUnion("kind", [
			z.object({ kind: z.literal("explicit"), value: z.string().min(1) }),
			z.object({
				kind: z.literal("generated"),
				prompt: z.string().optional(),
			}),
		]),
		from: z.discriminatedUnion("kind", [
			z.object({ kind: z.literal("default") }),
			z.object({ kind: z.literal("ref"), value: z.string().min(1) }),
		]),
	}),
	z.object({
		kind: z.literal("worktree"),
		path: z.string().min(1),
		expectedBranch: z.string().optional(),
	}),
	z.object({
		kind: z.literal("pull-request"),
		provider: z.literal("github"),
		number: z.number().int().positive(),
	}),
]);

const initialSessionIntentSchema = z.discriminatedUnion("kind", [
	z.object({
		key: z.string().min(1),
		kind: z.literal("setup"),
		requirement: z.enum(["required", "best-effort"]),
	}),
	z.object({
		key: z.string().min(1),
		kind: z.literal("shell"),
		label: z.string().optional(),
		requirement: z.enum(["required", "best-effort"]),
	}),
	z.object({
		key: z.string().min(1),
		kind: z.literal("command"),
		command: z.string().min(1),
		label: z.string().optional(),
		requirement: z.enum(["required", "best-effort"]),
	}),
	z.object({
		key: z.string().min(1),
		kind: z.literal("agent"),
		agent: z.string().min(1),
		prompt: z.string(),
		attachmentIds: z.array(z.string().uuid()).optional(),
		model: z.string().optional(),
		effort: z.string().optional(),
		requirement: z.enum(["required", "best-effort"]),
	}),
]);

export const provisionRequestSchema = z.object({
	idempotencyKey: z.string().min(1).max(200),
	project: projectTargetSchema,
	source: workspaceSourceSchema,
	display: z
		.object({
			name: z.string().optional(),
			taskId: z.string().optional(),
		})
		.optional(),
	existing: z
		.object({
			workspace: z.enum(["reuse", "fail"]).optional(),
			worktree: z.enum(["adopt", "fail"]).optional(),
		})
		.optional(),
	initialSessions: z.array(initialSessionIntentSchema).optional(),
});

export const listInputSchema = z.object({
	states: z
		.array(
			z.enum([
				"queued",
				"running",
				"compensating",
				"succeeded",
				"failed",
				"cancelled",
			]),
		)
		.optional(),
});

export const actInputSchema = z.object({
	operationId: z.string().uuid(),
	action: z.enum(["retry", "cancel"]),
});

export const getInputSchema = z.object({
	operationId: z.string().uuid(),
});

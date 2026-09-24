import { z } from "zod";
import { ACP_HARNESSES } from "../agent-catalog";

export const taskStrategySchema = z.enum([
	"auto",
	"direct",
	"standard",
	"deep",
]);
export type TaskStrategy = z.infer<typeof taskStrategySchema>;
export type TaskStatus =
	| "queued"
	| "running"
	| "blocked"
	| "pausing"
	| "paused"
	| "cancelling"
	| "recovering"
	| "awaiting_review"
	| "succeeded"
	| "failed"
	| "cancelled";
export type TaskPhase =
	| "preparing"
	| "executing"
	| "verifying"
	| "review"
	| "delivering"
	| "finished";
export type TaskDesiredState = "running" | "paused" | "cancelled";
export type TaskCheckStatus =
	| "running"
	| "passed"
	| "failed"
	| "cancelled"
	| "unknown"
	| "stale";

export const taskCheckSpecSchema = z
	.object({
		name: z.string().trim().min(1).max(200),
		command: z.string().trim().min(1).max(8_000),
		timeoutMs: z.number().int().min(1_000).max(600_000).default(120_000),
		reuse: z.boolean().optional(),
	})
	.strict();
export type TaskCheckSpec = z.infer<typeof taskCheckSpecSchema>;

const gitBranchSchema = z
	.string()
	.trim()
	.min(1)
	.max(240)
	.refine(
		(value) =>
			!value.startsWith("-") &&
			!value.startsWith("/") &&
			!value.endsWith("/") &&
			!value.endsWith(".") &&
			!value.includes("..") &&
			!value.includes("@{") &&
			![...value].some(
				(char) =>
					char.charCodeAt(0) <= 32 ||
					char.charCodeAt(0) === 127 ||
					"~^:?*[\\".includes(char),
			) &&
			value
				.split("/")
				.every(
					(part) => part && !part.startsWith(".") && !part.endsWith(".lock"),
				),
		"Use a valid branch name, not an option or refspec",
	);
export const taskDeliverySchema = z.discriminatedUnion("mode", [
	z.object({ mode: z.literal("none") }).strict(),
	z
		.object({
			mode: z.literal("commit"),
			branch: gitBranchSchema,
			message: z.string().trim().min(1).max(2_000),
		})
		.strict(),
	z
		.object({
			mode: z.literal("push"),
			branch: gitBranchSchema,
			message: z.string().trim().min(1).max(2_000),
			remote: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/),
			remoteBranch: gitBranchSchema,
			targetHash: z.string().regex(/^[a-f0-9]{64}$/),
		})
		.strict(),
]);
export type TaskDelivery = z.infer<typeof taskDeliverySchema>;
export const taskEditSchema = z
	.object({
		path: z.string().min(1).max(4_096),
		before: z.string().nullable(),
		after: z.string().nullable(),
		toolCallId: z.string().min(1).max(300),
		reliable: z.boolean(),
	})
	.strict();
export type TaskEditObservation = z.infer<typeof taskEditSchema>;
export type DeliveryOperationStatus =
	| "prepared"
	| "submitted"
	| "confirmed"
	| "failed"
	| "unknown";
export interface GitDeliveryPlan {
	root: string;
	gitDir: string;
	ref: string;
	parentOid: string;
	treeOid: string;
	paths: string[];
	verifiedFingerprint: string;
	beforeChanges: Record<string, string>;
	expectedIndexHash: string;
	expectedIndexEntriesHash?: string;
	indexHash: string;
	indexPath: string;
	lockPath: string;
	lockIdentity?: string;
	tempDir: string;
	tempIndex: string;
	message: string;
	// These contain no embedded credentials; transport authentication remains in Git.
	remoteUrl?: string;
	remoteBranch?: string;
	remoteHash?: string;
	remoteBefore?: string;
}

export const taskContractSchema = z
	.object({
		goal: z.string().trim().min(1).max(50_000),
		acceptance: z.string().trim().max(10_000).default(""),
		strategy: taskStrategySchema.default("auto"),
		// Keep the provider explicit; do not inherit the legacy Claude default.
		harness: z.enum(ACP_HARNESSES).default("pi-acp"),
		model: z.string().trim().min(1).max(256).optional(),
		checks: z.array(taskCheckSpecSchema).max(20).default([]),
		delivery: taskDeliverySchema.optional(),
		// Opt-in: these commands must represent the user's complete acceptance criteria.
		completion: z.enum(["review", "checks"]).default("review"),
		maxRepairs: z.number().int().min(0).max(8).default(2),
		// Progress continuations are distinct from failed-check repairs.
		maxContinuations: z.number().int().min(0).max(20).optional(),
		timeoutMs: z.number().int().min(30_000).max(14_400_000).default(1_800_000),
	})
	.strict()
	.refine((input) => input.completion !== "checks" || input.checks.length > 0, {
		message:
			"Automatic acceptance requires at least one explicit acceptance check",
		path: ["checks"],
	});
export const projectTaskCheckSchema = taskCheckSpecSchema
	.extend({
		id: z
			.string()
			.trim()
			.regex(/^[a-zA-Z0-9_-]+$/)
			.max(80),
		// A small documented glob dialect: *, ** and ?. Empty means always.
		paths: z
			.array(
				z
					.string()
					.trim()
					.min(1)
					.max(300)
					.refine(
						(value) =>
							!value.startsWith("/") &&
							!value.split("/").includes("..") &&
							!/[\\!{}[\]]/.test(value),
						"Use project-relative *, ** and ? patterns only",
					),
			)
			.max(30)
			.default([]),
	})
	.strict();
export type ProjectTaskCheck = z.infer<typeof projectTaskCheckSchema>;
export const taskProfileSchema = z
	.object({
		instructions: z.string().trim().max(10_000).default(""),
		checks: z.array(projectTaskCheckSchema).max(30).default([]),
		completion: z.enum(["review", "checks"]).default("review"),
	})
	.strict()
	.refine(
		(value) =>
			new Set(value.checks.map((check) => check.id)).size ===
			value.checks.length,
		{ message: "Check ids must be unique", path: ["checks"] },
	)
	.refine((value) => value.completion !== "checks" || value.checks.length > 0, {
		message: "Automatic project acceptance requires checks",
		path: ["completion"],
	});
export type TaskProfile = z.infer<typeof taskProfileSchema>;
export interface TaskProfileSnapshot {
	revision: number;
	config: TaskProfile;
}
export type EffectiveTaskStrategy = Exclude<TaskStrategy, "auto">;
export interface SelectedTaskCheck extends TaskCheckSpec {
	key: string;
	reason: string;
}
export interface TaskMetrics {
	preparingMs: number;
	executingMs: number;
	verifyingMs: number;
	snapshotsMs: number;
	deliveringMs?: number;
}

export type TaskContract = z.infer<typeof taskContractSchema>;
export const createTaskSchema = z
	.object({
		id: z.string().uuid(),
		projectId: z.string().min(1),
		workspaceId: z.string().min(1).optional(),
		// Omitted preserves older callers. New UI explicitly chooses project defaults.
		acceptanceMode: z.enum(["project", "review", "checks"]).optional(),
		expectedProfileRevision: z.number().int().min(0).optional(),
		contract: taskContractSchema,
	})
	.strict();

// Normal chat currently produces text and pasted images. Preserve them across
// task admission/recovery; unsupported content must be rejected, never dropped.
export const taskImageSchema = z
	.object({
		type: z.literal("image"),
		data: z
			.string()
			.min(1)
			.max(8 * 1024 * 1024),
		mimeType: z.string().regex(/^image\/[a-zA-Z0-9.+-]+$/),
	})
	.passthrough();
export type TaskImage = z.infer<typeof taskImageSchema>;
export const taskChatBlocksSchema = z
	.array(
		z.union([
			z
				.object({ type: z.literal("text"), text: z.string().max(50_000) })
				.passthrough(),
			taskImageSchema,
		]),
	)
	.min(1)
	.max(12)
	.refine(
		(blocks) => JSON.stringify(blocks).length <= 12 * 1024 * 1024,
		"Message exceeds 12 MiB",
	);
export const startConversationTaskSchema = z
	.object({
		id: z.string().uuid(),
		sessionId: z.string().min(1).max(256),
		prompt: taskChatBlocksSchema,
		acceptanceMode: z.enum(["project", "review"]).default("project"),
		strategy: taskStrategySchema.default("auto"),
		acceptance: z.string().trim().max(10000).default(""),
	})
	.strict()
	.refine(
		(value) =>
			value.prompt.some((block) => block.type === "text" && block.text.trim()),
		{ message: "Describe a task goal alongside attachments", path: ["prompt"] },
	);

export interface TaskRequirement {
	id: string;
	description: string;
}
export const taskCriterionSchema = z
	.object({
		id: z.string().min(1).max(100),
		status: z.enum(["satisfied", "unfinished", "unverified"]),
		// A model-authored rationale, explicitly not execution evidence by itself.
		evidence: z.string().trim().min(1).max(4000),
		checkIds: z.array(z.string().min(1).max(100)).max(30).default([]),
	})
	.strict();
export type TaskCriterion = z.infer<typeof taskCriterionSchema>;

// A candidate is a claim by the agent, NEVER an executed verification result.
export const taskCandidateSchema = z
	.object({
		runId: z.string().uuid(),
		iteration: z.number().int().min(0),
		revision: z.number().int().min(0).default(0),
		additionalCheckIds: z.array(z.string().max(80)).max(30).default([]),
		outcome: z.enum(["ready", "blocked", "continue"]),
		criteria: z.array(taskCriterionSchema).max(90).optional(),
		summary: z.string().trim().min(1).max(12_000),
		remaining: z.string().trim().max(6_000).default(""),
	})
	.strict()
	.refine(
		(value) => value.outcome !== "ready" || value.remaining.length === 0,
		{
			message: "A ready result cannot have unresolved requirements",
			path: ["remaining"],
		},
	)
	.refine(
		(value) =>
			value.outcome !== "continue" || value.remaining.trim().length > 0,
		{
			message: "A continuation must identify the remaining work",
			path: ["remaining"],
		},
	)
	.refine(
		(value) =>
			new Set(value.criteria?.map((item) => item.id) ?? []).size ===
			(value.criteria?.length ?? 0),
		{
			message: "Each requirement may be reported only once",
			path: ["criteria"],
		},
	);
export type TaskCandidate = z.infer<typeof taskCandidateSchema>;
export function isTaskTerminal(status: TaskStatus): boolean {
	return (
		status === "succeeded" || status === "failed" || status === "cancelled"
	);
}

export const taskGuidanceSchema = z
	.object({
		id: z.string().uuid(),
		runId: z.string().uuid(),
		expectedRevision: z.number().int().min(0),
		text: z.string().trim().min(1).max(12_000),
		kind: z.enum(["guidance", "constraint"]).default("guidance"),
		attachments: z.array(taskImageSchema).max(6).optional(),
	})
	.strict()
	.refine(
		(value) => JSON.stringify(value).length <= 12 * 1024 * 1024,
		"Guidance exceeds 12 MiB",
	);
export type TaskGuidanceInput = z.infer<typeof taskGuidanceSchema>;

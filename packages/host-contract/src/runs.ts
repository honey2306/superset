import { z } from "zod";

export const runKindSchema = z.enum(["task", "automation", "discussion"]);
export type RunKind = z.infer<typeof runKindSchema>;
export const runReferenceSchema = z.object({
	kind: runKindSchema,
	id: z.string().min(1).max(256),
});
export type RunReference = z.infer<typeof runReferenceSchema>;
export const listRunsSchema = z.object({
	workspaceId: z.string().min(1),
	kinds: z.array(runKindSchema).optional(),
	limit: z.number().int().min(1).max(100).default(20),
});
export type RunStatus =
	| "queued"
	| "running"
	| "waiting"
	| "paused"
	| "stopping"
	| "recovering"
	| "succeeded"
	| "failed"
	| "cancelled"
	| "dispatched"
	| "unknown";
export type RunResult =
	| {
			kind: "accepted";
			summary: string | null;
			source: "checks" | "user" | null;
	  }
	| {
			kind: "dispatch";
			sessionId: string | null;
			sessionKind: "acp" | "terminal" | null;
	  }
	| {
			kind: "discussion";
			positions: { sessionId: string; label: string; response: string }[];
	  };

/** One operational contract, backed by each owner's existing durable record.
 * `dispatched` means the scheduler handed off work, never accepted agent output. */
export interface ExecutionRun {
	ref: RunReference;
	key: string;
	workspaceId: string | null;
	ownerId: string;
	title: string;
	status: RunStatus;
	phase: string;
	terminal: boolean;
	completionPolicy: "task-acceptance" | "dispatch" | "discussion-rounds";
	sessionIds: string[];
	sourceSessionId: string | null;
	createdAt: number;
	updatedAt: number;
	endedAt: number | null;
	reason: string | null;
	result: RunResult | null;
	capabilities: { cancel: boolean; pause: boolean };
	recovery: "reconcile" | "fail-interrupted" | "dispatch-record";
}
export function runKey(ref: RunReference): string {
	return `${ref.kind}:${ref.id}`;
}

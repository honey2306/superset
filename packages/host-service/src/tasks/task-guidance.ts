import { createHash } from "node:crypto";
import {
	isTaskTerminal,
	type TaskGuidanceInput,
	taskGuidanceSchema,
} from "@superset/shared/tasks";
import { asc, eq } from "drizzle-orm";
import { taskGuidance } from "../db/schema";
import type { TaskStore } from "./task-store";

export type GuidanceRecord = typeof taskGuidance.$inferSelect;
/** Owns user intent, not the model's message queue. At-most-once dispatch on
 * ambiguous acknowledgements, with explicit continuation for recovery. */
export class TaskGuidanceStore {
	constructor(private readonly store: TaskStore) {}
	list(runId: string) {
		return this.store.db
			.select()
			.from(taskGuidance)
			.where(eq(taskGuidance.runId, runId))
			.orderBy(asc(taskGuidance.revision))
			.all();
	}
	unresolved(runId: string) {
		return this.list(runId).filter((item) =>
			["pending", "sending", "unknown"].includes(item.status),
		);
	}
	add(value: TaskGuidanceInput) {
		const input = taskGuidanceSchema.parse(value);
		const hash = createHash("sha256")
			.update(JSON.stringify(input))
			.digest("hex");
		return this.store.db.transaction(() => {
			const existing = this.store.db
				.select()
				.from(taskGuidance)
				.where(eq(taskGuidance.id, input.id))
				.get();
			if (existing) {
				if (existing.requestHash !== hash)
					throw new Error("Guidance id was reused with different input");
				return existing;
			}
			const run = this.store.getRun(input.runId);
			if (isTaskTerminal(run.status) || run.desiredState === "cancelled")
				throw new Error(
					"This task is stopped; start a new attempt rather than steering it",
				);
			if (run.phase === "delivering")
				throw new Error(
					"Git delivery is in progress. Pause or revoke delivery; do not mix new Agent work into an accepted commit",
				);
			if (run.revision !== input.expectedRevision)
				throw new Error(
					"Task requirements changed; refresh before sending guidance",
				);
			const previous = this.list(run.id);
			if (
				previous.length >= 80 ||
				previous.reduce((size, item) => size + item.text.length, 0) +
					input.text.length >
					64_000
			)
				throw new Error(
					"Task guidance budget reached; start a new task with a concise goal",
				);
			if (
				previous.reduce(
					(size, item) => size + JSON.stringify(item.attachments ?? []).length,
					0,
				) +
					JSON.stringify(input.attachments ?? []).length >
				32 * 1024 * 1024
			)
				throw new Error(
					"Task attachment budget reached; use file references rather than repeating image payloads",
				);
			const revision = run.revision + 1;
			this.store.db
				.insert(taskGuidance)
				.values({
					id: input.id,
					runId: run.id,
					revision,
					kind: input.kind,
					text: input.text,
					attachments: input.attachments ?? null,
					status: "pending",
					requestHash: hash,
					createdAt: Date.now(),
				})
				.run();
			this.store.patch(
				run.id,
				{
					revision,
					candidate: null,
					candidateFingerprint: null,
					verifiedFingerprint: null,
					...(input.kind === "constraint"
						? { acceptanceMode: "review" as const, deliveryRevoked: true }
						: {}),
					...(run.status === "awaiting_review" ||
					(run.status === "blocked" && !run.leasePath)
						? { status: "queued" as const, phase: "review" as const }
						: {}),
				},
				`User ${input.kind} recorded as revision ${revision}; older candidates can no longer complete this task`,
			);
			const record = this.store.db
				.select()
				.from(taskGuidance)
				.where(eq(taskGuidance.id, input.id))
				.get();
			if (!record) throw new Error("Guidance was not persisted");
			return record;
		});
	}
	mark(
		id: string,
		status: GuidanceRecord["status"],
		deliveryMode?: GuidanceRecord["deliveryMode"],
	) {
		this.store.db.transaction(() => {
			const item = this.store.db
				.select()
				.from(taskGuidance)
				.where(eq(taskGuidance.id, id))
				.get();
			if (!item || item.status === "cancelled") return;
			this.store.db
				.update(taskGuidance)
				.set({
					status,
					...(deliveryMode ? { deliveryMode } : {}),
					...(status === "delivered" ? { deliveredAt: Date.now() } : {}),
				})
				.where(eq(taskGuidance.id, id))
				.run();
		});
	}
	cancelPending(runId: string) {
		for (const item of this.unresolved(runId)) this.mark(item.id, "cancelled");
	}
	context(runId: string): string {
		return this.list(runId)
			.filter((item) => item.status !== "cancelled")
			.map((item) => `[revision ${item.revision}, ${item.kind}] ${item.text}`)
			.join("\n\n");
	}
}

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { workspaceOperations } from "../db/schema";
import type {
	InitialLaunchResult,
	WorkspaceOperation,
	WorkspaceOperationFailure,
	WorkspaceOperationStage,
	WorkspaceOperationState,
} from "./types";

/**
 * Read/write the durable Provisioning journal. All state transitions go
 * through here so the resume worker and tRPC procedures see the same
 * update path.
 */
export class OperationJournal {
	constructor(private readonly db: HostDb) {}

	create(args: {
		idempotencyKey: string;
		requestHash: string;
		requestJson: string;
		launchPayloadJson: string | null;
		requestedByMachineId?: string;
	}): string {
		const now = Date.now();
		const id = randomUUID();
		this.db
			.insert(workspaceOperations)
			.values({
				id,
				idempotencyKey: args.idempotencyKey,
				requestHash: args.requestHash,
				requestJson: args.requestJson,
				launchPayloadJson: args.launchPayloadJson,
				requestedByMachineId: args.requestedByMachineId ?? null,
				state: "queued",
				stage: null,
				revision: 1,
				createdAt: now,
				updatedAt: now,
			})
			.run();
		return id;
	}

	findByIdempotencyKey(
		key: string,
	): typeof workspaceOperations.$inferSelect | undefined {
		return this.db.query.workspaceOperations
			.findFirst({ where: eq(workspaceOperations.idempotencyKey, key) })
			.sync();
	}

	get(id: string): typeof workspaceOperations.$inferSelect | undefined {
		return this.db.query.workspaceOperations
			.findFirst({ where: eq(workspaceOperations.id, id) })
			.sync();
	}

	listByMachine(
		machineId: string,
	): (typeof workspaceOperations.$inferSelect)[] {
		return this.db
			.select()
			.from(workspaceOperations)
			.where(eq(workspaceOperations.requestedByMachineId, machineId))
			.all();
	}

	patch(
		id: string,
		patch: Partial<{
			state: WorkspaceOperationState;
			stage: WorkspaceOperationStage | null;
			projectId: string | null;
			workspaceId: string | null;
			plannedProjectId: string | null;
			plannedWorkspaceId: string | null;
			catalogCommittedAt: number | null;
			cancelRequestedAt: number | null;
			failureCode: string | null;
			failureClass: string | null;
			failureRetryable: number | null;
			failureMessage: string | null;
			cleanupState: string | null;
			resultJson: string | null;
			completedAt: number | null;
			launchPayloadJson: string | null;
		}>,
	): void {
		const existing = this.get(id);
		if (!existing) return;
		this.db
			.update(workspaceOperations)
			.set({
				...patch,
				revision: existing.revision + 1,
				updatedAt: Date.now(),
			})
			.where(eq(workspaceOperations.id, id))
			.run();
	}

	toWireOperation(
		row: typeof workspaceOperations.$inferSelect,
	): WorkspaceOperation {
		const parsedResult = row.resultJson
			? (JSON.parse(row.resultJson) as {
					launches?: InitialLaunchResult[];
					warnings?: Array<{ code: string; message: string }>;
					disposition?: "created" | "adopted" | "reused" | "repaired";
				})
			: {};
		const failure: WorkspaceOperationFailure | undefined = row.failureCode
			? {
					code: row.failureCode as WorkspaceOperationFailure["code"],
					class:
						(row.failureClass as WorkspaceOperationFailure["class"]) ??
						"transient",
					retryable: !!row.failureRetryable,
					message: row.failureMessage ?? "",
					cleanup:
						(row.cleanupState as WorkspaceOperationFailure["cleanup"]) ??
						"not-needed",
					workspaceId: row.workspaceId ?? undefined,
				}
			: undefined;
		return {
			id: row.id,
			revision: row.revision,
			state: row.state,
			stage: row.stage ?? undefined,
			projectId: row.projectId ?? undefined,
			workspaceId: row.workspaceId ?? undefined,
			disposition: parsedResult.disposition,
			launches: parsedResult.launches ?? [],
			warnings: parsedResult.warnings ?? [],
			failure,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			completedAt: row.completedAt ?? undefined,
		};
	}
}

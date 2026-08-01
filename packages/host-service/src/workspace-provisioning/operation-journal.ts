import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { workspaceOperationSteps, workspaceOperations } from "../db/schema";
import type {
	InitialLaunchResult,
	ProvisionWorkspaceRequest,
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
			.onConflictDoNothing()
			.run();
		const row = this.findByIdempotencyKey(args.idempotencyKey);
		if (!row) {
			throw new Error(
				`Operation journal insert failed for idempotency key ${args.idempotencyKey}`,
			);
		}
		return row.id;
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

	/** Reconstruct a restart-safe request from the redacted request and the
	 * separately persisted launch payload. Sensitive command/prompt bodies are
	 * retained only in launchPayloadJson, while identity fields stay in the
	 * canonical request record used for idempotency checks. */
	readRequest(
		row: typeof workspaceOperations.$inferSelect,
	): ProvisionWorkspaceRequest | null {
		if (!row.requestJson) return null;
		try {
			const parsed = JSON.parse(row.requestJson) as {
				project?: unknown;
				source?: unknown;
				idempotencyKey?: unknown;
			};
			if (
				typeof parsed.project !== "object" ||
				parsed.project === null ||
				typeof parsed.source !== "object" ||
				parsed.source === null ||
				typeof parsed.idempotencyKey !== "string"
			) {
				return null;
			}
			const request = parsed as ProvisionWorkspaceRequest;
			if (row.launchPayloadJson) {
				const payload = JSON.parse(row.launchPayloadJson) as {
					initialSessions?: ProvisionWorkspaceRequest["initialSessions"];
				};
				if (payload.initialSessions) {
					request.initialSessions = payload.initialSessions;
				}
			}
			return request;
		} catch {
			return null;
		}
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

	/**
	 * Journal or replay a per-intent terminal id. On first attempt this
	 * mints a fresh UUID and writes a step row; on retry it returns the
	 * previously journaled id so the Terminal Runtime Adapter adopts the
	 * live daemon session instead of spawning a duplicate.
	 */
	ensureTerminalId(operationId: string, intentKey: string): string {
		const stepKey = `terminal:${intentKey}`;
		const existing = this.db
			.select()
			.from(workspaceOperationSteps)
			.where(
				and(
					eq(workspaceOperationSteps.operationId, operationId),
					eq(workspaceOperationSteps.stepKey, stepKey),
				),
			)
			.get();
		if (existing?.inputJson) {
			try {
				const parsed = JSON.parse(existing.inputJson) as {
					terminalId?: unknown;
				};
				if (typeof parsed.terminalId === "string" && parsed.terminalId) {
					return parsed.terminalId;
				}
			} catch {
				// fall through and re-mint
			}
		}
		const terminalId = randomUUID();
		this.db
			.insert(workspaceOperationSteps)
			.values({
				operationId,
				stepKey,
				status: "planned",
				attempt: (existing?.attempt ?? 0) + 1,
				inputJson: JSON.stringify({ terminalId }),
				startedAt: Date.now(),
			})
			.onConflictDoUpdate({
				target: [
					workspaceOperationSteps.operationId,
					workspaceOperationSteps.stepKey,
				],
				set: {
					attempt: (existing?.attempt ?? 0) + 1,
					inputJson: JSON.stringify({ terminalId }),
					startedAt: Date.now(),
				},
			})
			.run();
		return terminalId;
	}

	markStepComplete(
		operationId: string,
		stepKey: string,
		output?: Record<string, unknown>,
	): void {
		this.db
			.update(workspaceOperationSteps)
			.set({
				status: "completed",
				outputJson: output ? JSON.stringify(output) : null,
				completedAt: Date.now(),
			})
			.where(
				and(
					eq(workspaceOperationSteps.operationId, operationId),
					eq(workspaceOperationSteps.stepKey, stepKey),
				),
			)
			.run();
	}
}

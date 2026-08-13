import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { HostDb } from "../db";
import {
	workspaceOperationArtifacts,
	workspaceOperationSteps,
	workspaceOperations,
} from "../db/schema";
import type {
	InitialLaunchResult,
	ProvisionWorkspaceRequest,
	WorkspaceOperation,
	WorkspaceOperationFailure,
	WorkspaceOperationStage,
	WorkspaceOperationState,
} from "./types";
import type { RunnerArtifact } from "./workspace-provisioning";

type OperationStep = typeof workspaceOperationSteps.$inferSelect;

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

	/**
	 * Atomically record a best-effort cancellation request while the operation
	 * is still pre-commit. The runner owns the terminal transition: it must stop
	 * external work, compensate owned artifacts, and only then mark cancelled.
	 */
	requestCancellation(id: string): "cancelled" | "too-late" | "not-found" {
		const existing = this.get(id);
		if (!existing) return "not-found";
		const now = Date.now();
		const result = this.db
			.update(workspaceOperations)
			.set({
				cancelRequestedAt: existing.cancelRequestedAt ?? now,
				revision: existing.revision + 1,
				updatedAt: now,
			})
			.where(
				and(
					eq(workspaceOperations.id, id),
					isNull(workspaceOperations.catalogCommittedAt),
					inArray(workspaceOperations.state, ["queued", "running"]),
				),
			)
			.run();
		if (result.changes === 1) return "cancelled";
		return "too-late";
	}

	isCancellationRequested(id: string): boolean {
		const row = this.get(id);
		return (
			row?.state === "cancelled" ||
			(row?.cancelRequestedAt !== null && row?.catalogCommittedAt === null)
		);
	}

	markCompensating(id: string): void {
		this.patch(id, { state: "compensating", stage: "compensating" });
	}

	finalizeCancellation(
		id: string,
		cleanup: "not-needed" | "complete" | "incomplete",
	): void {
		const now = Date.now();
		if (cleanup === "incomplete") {
			this.patch(id, {
				state: "failed",
				stage: null,
				failureCode: "COMPENSATION_INCOMPLETE",
				failureClass: "transient",
				failureRetryable: 1,
				failureMessage:
					"Cancellation stopped provisioning, but compensation was incomplete",
				cleanupState: "incomplete",
				completedAt: now,
				launchPayloadJson: null,
			});
			return;
		}
		this.patch(id, {
			state: "cancelled",
			stage: null,
			failureCode: null,
			failureClass: null,
			failureRetryable: null,
			failureMessage: null,
			cleanupState: cleanup,
			completedAt: now,
			launchPayloadJson: null,
		});
	}

	/** Claim the Catalog commit boundary before entering its external transaction. */
	beginCatalogCommit(id: string): boolean {
		return this.patchActive(id, { stage: "cataloging" });
	}

	/** Mark a completed Catalog commit without overwriting cancellation. */
	markCatalogCommitted(
		id: string,
		args: { projectId: string; workspaceId: string },
	): boolean {
		const existing = this.get(id);
		if (!existing) return false;
		const result = this.db
			.update(workspaceOperations)
			.set({
				stage: "starting-runtime",
				projectId: args.projectId,
				workspaceId: args.workspaceId,
				catalogCommittedAt: Date.now(),
				revision: existing.revision + 1,
				updatedAt: Date.now(),
			})
			.where(
				and(
					eq(workspaceOperations.id, id),
					eq(workspaceOperations.state, "running"),
					isNull(workspaceOperations.cancelRequestedAt),
				),
			)
			.run();
		return result.changes === 1;
	}

	/** Finalize only if cancellation did not win the race. */
	patchActive(
		id: string,
		patch: Parameters<OperationJournal["patch"]>[1],
	): boolean {
		const existing = this.get(id);
		if (!existing) return false;
		const result = this.db
			.update(workspaceOperations)
			.set({
				...patch,
				revision: existing.revision + 1,
				updatedAt: Date.now(),
			})
			.where(
				and(
					eq(workspaceOperations.id, id),
					inArray(workspaceOperations.state, ["queued", "running"]),
					isNull(workspaceOperations.cancelRequestedAt),
				),
			)
			.run();
		return result.changes === 1;
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
			cancelRequestedAt: row.cancelRequestedAt ?? undefined,
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

	/**
	 * Mark a non-terminal provisioning step as in flight before invoking its
	 * external materializer. A `running` row is deliberately retryable: a
	 * crash before completion leaves the step available for the source handler
	 * to reconcile, while a completed row lets resume skip work that already
	 * returned successfully but whose parent operation had not yet advanced.
	 */
	markStepStarted(
		operationId: string,
		stepKey: string,
		input?: Record<string, unknown>,
	): void {
		const existing = this.getStep(operationId, stepKey);
		const now = Date.now();
		this.db
			.insert(workspaceOperationSteps)
			.values({
				operationId,
				stepKey,
				status: "running",
				attempt: (existing?.attempt ?? 0) + 1,
				inputJson: input ? JSON.stringify(input) : null,
				outputJson: null,
				startedAt: now,
				completedAt: null,
			})
			.onConflictDoUpdate({
				target: [
					workspaceOperationSteps.operationId,
					workspaceOperationSteps.stepKey,
				],
				set: {
					status: "running",
					attempt: (existing?.attempt ?? 0) + 1,
					inputJson: input ? JSON.stringify(input) : null,
					outputJson: null,
					startedAt: now,
					completedAt: null,
				},
			})
			.run();
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

	getStep(operationId: string, stepKey: string): OperationStep | undefined {
		return this.db
			.select()
			.from(workspaceOperationSteps)
			.where(
				and(
					eq(workspaceOperationSteps.operationId, operationId),
					eq(workspaceOperationSteps.stepKey, stepKey),
				),
			)
			.get();
	}

	getCompletedStepOutput<T extends object>(
		operationId: string,
		stepKey: string,
	): T | null {
		const step = this.getStep(operationId, stepKey);
		if (!step || step.status !== "completed" || !step.outputJson) {
			return null;
		}
		try {
			return JSON.parse(step.outputJson) as T;
		} catch {
			return null;
		}
	}

	/**
	 * Persist ownership as soon as a materializer creates an external
	 * artifact. The outer runner writes the final outcome too, but a crash
	 * between `git worktree add`/`git clone` and that outcome must still leave
	 * compensation enough information to clean up only what this operation
	 * owns.
	 */
	recordArtifacts(
		operationId: string,
		artifacts: ReadonlyArray<RunnerArtifact>,
	): void {
		const now = Date.now();
		for (const artifact of artifacts) {
			this.db
				.insert(workspaceOperationArtifacts)
				.values({
					id: randomUUID(),
					operationId,
					kind: artifact.kind,
					identity: artifact.identity,
					ownership: artifact.ownership,
					expectedHeadSha: artifact.expectedHeadSha ?? null,
					cleanupState: "not-needed",
					createdAt: now,
					updatedAt: now,
				})
				.onConflictDoNothing()
				.run();
		}
	}
}

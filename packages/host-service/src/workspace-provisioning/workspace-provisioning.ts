import { randomUUID } from "node:crypto";
import type { HostDb } from "../db";
import { workspaceOperationArtifacts } from "../db/schema";
import type { EventBus } from "../events";
import type { WorkspaceCatalog } from "../workspace-catalog";
import {
	canonicalizeProvisionRequest,
	ProvisioningInputError,
	stableJson,
} from "./canonical-request";
import {
	acquireLeases,
	deriveNaturalLockKeys,
	releaseOperationLocks,
} from "./leases";
import { OperationJournal } from "./operation-journal";
import type {
	InitialLaunchResult,
	ProvisionWorkspaceRequest,
	WorkspaceOperation,
	WorkspaceOperationFailure,
} from "./types";

export interface ProvisioningRunnerContext {
	request: ProvisionWorkspaceRequest;
	operationId: string;
	journal: OperationJournal;
	broadcast: (operation: WorkspaceOperation) => void;
}

export interface ProvisioningRunnerOutcome {
	workspaceId: string;
	projectId: string;
	disposition: "created" | "adopted" | "reused" | "repaired";
	launches: InitialLaunchResult[];
	warnings: Array<{ code: string; message: string }>;
	/**
	 * Filesystem/git/terminal artifacts the runner touched. Written to
	 * `workspace_operation_artifacts` before final commit and consulted
	 * by compensation on failure — only ownership='created' rows may be
	 * removed by rollback.
	 */
	artifacts?: RunnerArtifact[];
}

export interface RunnerArtifact {
	kind: "repo-dir" | "worktree" | "branch" | "terminal";
	identity: string;
	ownership: "created" | "adopted";
	expectedHeadSha?: string;
}

/**
 * Callback that performs the actual Git + filesystem + Catalog + Terminal
 * work for one operation. Injected so the Provisioning Module can stay
 * pure and unit-testable, while production wires it to the existing
 * mutation handlers under `trpc/router/workspaces` and
 * `trpc/router/project`. See `workspace-provisioning-runner.ts` for the
 * production adapter.
 */
export type ProvisioningRunner = (
	ctx: ProvisioningRunnerContext,
) => Promise<ProvisioningRunnerOutcome>;

export interface WorkspaceProvisioningDeps {
	db: HostDb;
	catalog: WorkspaceCatalog;
	eventBus: EventBus | null;
	runner: ProvisioningRunner;
}

/**
 * Workspace Provisioning Module (M2). Owns idempotency, the operation
 * journal, and the state machine. The actual materialization is
 * delegated to an injected runner so tests can substitute a
 * deterministic fake.
 */
export class WorkspaceProvisioning {
	readonly journal: OperationJournal;
	constructor(private readonly deps: WorkspaceProvisioningDeps) {
		this.journal = new OperationJournal(deps.db);
	}

	async begin(
		request: ProvisionWorkspaceRequest,
		options?: { requestedByMachineId?: string },
	): Promise<{ operationId: string; operation: WorkspaceOperation }> {
		let canonical: ReturnType<typeof canonicalizeProvisionRequest>;
		try {
			canonical = canonicalizeProvisionRequest(request);
		} catch (err) {
			if (err instanceof ProvisioningInputError) {
				throw err;
			}
			throw new ProvisioningInputError(
				"INVALID_SOURCE",
				err instanceof Error ? err.message : String(err),
			);
		}

		// Idempotency lookup — before minting any operation row.
		const existing = this.journal.findByIdempotencyKey(request.idempotencyKey);
		if (existing) {
			if (existing.requestHash !== canonical.hash) {
				throw new ProvisioningInputError(
					"IDEMPOTENCY_CONFLICT",
					`idempotencyKey ${request.idempotencyKey} already used with a different request`,
				);
			}
			// Same key + same hash → return the running/committed operation.
			return {
				operationId: existing.id,
				operation: this.journal.toWireOperation(existing),
			};
		}

		const launchPayload = stableJson({
			initialSessions: request.initialSessions ?? [],
		});

		const operationId = this.journal.create({
			idempotencyKey: request.idempotencyKey,
			requestHash: canonical.hash,
			requestJson: stableJson(canonical.redacted),
			launchPayloadJson: launchPayload,
			requestedByMachineId: options?.requestedByMachineId,
		});
		this.broadcast(operationId);

		// Claim natural-identity leases before any git/filesystem work.
		// A conflict here means a different active operation is already
		// touching the same identity — reject synchronously without
		// letting the saga leave partial state behind.
		let leases: ReturnType<typeof acquireLeases>;
		try {
			leases = acquireLeases({
				db: this.deps.db,
				operationId,
				keys: deriveNaturalLockKeys(request),
			});
		} catch (err) {
			// Fold RESOURCE_BUSY into the operation row so the caller sees a
			// failed operation instead of a bare throw — the id is already
			// minted and the client can distinguish this from a hard error.
			if (
				err instanceof ProvisioningInputError &&
				err.code === "RESOURCE_BUSY"
			) {
				this.journal.patch(operationId, {
					state: "failed",
					stage: null,
					failureCode: "RESOURCE_BUSY",
					failureClass: "conflict",
					failureRetryable: 1,
					failureMessage: err.message,
					cleanupState: "not-needed",
					completedAt: Date.now(),
					launchPayloadJson: null,
				});
				this.broadcast(operationId);
				return {
					operationId,
					operation: this.getRequired(operationId),
				};
			}
			throw err;
		}

		// Run the saga synchronously — M2 MVP does not defer to a resume
		// worker. Recovery of an interrupted operation happens on the next
		// `begin` with the same idempotency key or `get`.
		this.journal.patch(operationId, { state: "running", stage: "resolving" });
		this.broadcast(operationId);
		try {
			const outcome = await this.deps.runner({
				request,
				operationId,
				journal: this.journal,
				broadcast: () => this.broadcast(operationId),
			});
			// Record artifacts BEFORE marking succeeded so compensation on a
			// crash right here still knows what to look at. Journalled ids
			// have no FK back to Catalog, so a later Workspace delete does
			// not erase this receipt.
			if (outcome.artifacts?.length) {
				recordArtifacts(this.deps.db, operationId, outcome.artifacts);
			}
			this.journal.patch(operationId, {
				state: "succeeded",
				stage: null,
				projectId: outcome.projectId,
				workspaceId: outcome.workspaceId,
				catalogCommittedAt: Date.now(),
				completedAt: Date.now(),
				launchPayloadJson: null,
				resultJson: stableJson({
					disposition: outcome.disposition,
					launches: outcome.launches,
					warnings: outcome.warnings,
				}),
			});
			this.broadcast(operationId);
			leases.release();
			return {
				operationId,
				operation: this.getRequired(operationId),
			};
		} catch (err) {
			const failure = classifyFailure(err);
			this.journal.patch(operationId, {
				state: "failed",
				stage: null,
				failureCode: failure.code,
				failureClass: failure.class,
				failureRetryable: failure.retryable ? 1 : 0,
				failureMessage: failure.message,
				cleanupState: failure.cleanup,
				completedAt: Date.now(),
			});
			this.broadcast(operationId);
			leases.release();
			return {
				operationId,
				operation: this.getRequired(operationId),
			};
		}
	}

	get(operationId: string): WorkspaceOperation | undefined {
		const row = this.journal.get(operationId);
		return row ? this.journal.toWireOperation(row) : undefined;
	}

	list(args: {
		requestedByMachineId: string;
		states?: WorkspaceOperation["state"][];
	}): WorkspaceOperation[] {
		const rows = this.journal.listByMachine(args.requestedByMachineId);
		const filtered = args.states
			? rows.filter((r) => args.states?.includes(r.state))
			: rows;
		return filtered.map((r) => this.journal.toWireOperation(r));
	}

	act(args: {
		operationId: string;
		action: "retry" | "cancel";
	}): WorkspaceOperation {
		const row = this.journal.get(args.operationId);
		if (!row) {
			throw new ProvisioningInputError(
				"INVALID_SOURCE",
				`Operation ${args.operationId} not found`,
			);
		}
		if (args.action === "cancel") {
			if (row.state === "succeeded") {
				throw new ProvisioningInputError(
					"INVALID_SOURCE",
					"TOO_LATE_TO_CANCEL",
				);
			}
			this.journal.patch(args.operationId, {
				state: "cancelled",
				cancelRequestedAt: Date.now(),
				completedAt: Date.now(),
				launchPayloadJson: null,
			});
			this.broadcast(args.operationId);
			return this.getRequired(args.operationId);
		}
		// retry — only meaningful on a `failed` operation with retryable=true
		if (row.state !== "failed" || !row.failureRetryable) {
			return this.journal.toWireOperation(row);
		}
		// MVP: mark queued and let the caller re-invoke begin with the same
		// idempotency key. A proper resume worker will pick this up in the
		// completion of M2.
		this.journal.patch(args.operationId, {
			state: "queued",
			failureCode: null,
			failureClass: null,
			failureRetryable: null,
			failureMessage: null,
			completedAt: null,
		});
		this.broadcast(args.operationId);
		return this.getRequired(args.operationId);
	}

	private getRequired(id: string): WorkspaceOperation {
		const row = this.journal.get(id);
		if (!row) throw new Error(`Operation not found: ${id}`);
		return this.journal.toWireOperation(row);
	}

	private broadcast(operationId: string): void {
		if (!this.deps.eventBus) return;
		const row = this.journal.get(operationId);
		if (!row) return;
		this.deps.eventBus.broadcastWorkspaceOperationChanged(
			this.journal.toWireOperation(row),
		);
	}
}

function classifyFailure(err: unknown): WorkspaceOperationFailure {
	if (err instanceof ProvisioningInputError) {
		return {
			code: err.code,
			class:
				err.code === "IDEMPOTENCY_CONFLICT" || err.code === "RESOURCE_BUSY"
					? "conflict"
					: "precondition",
			retryable: err.code === "RESOURCE_BUSY",
			message: err.message,
			cleanup: "not-needed",
		};
	}
	const message = err instanceof Error ? err.message : String(err);
	return {
		code: "TERMINAL_UNAVAILABLE",
		class: "transient",
		retryable: true,
		message,
		cleanup: "pending",
	};
}

function recordArtifacts(
	db: HostDb,
	operationId: string,
	artifacts: RunnerArtifact[],
): void {
	const now = Date.now();
	for (const a of artifacts) {
		db.insert(workspaceOperationArtifacts)
			.values({
				id: randomUUID(),
				operationId,
				kind: a.kind,
				identity: a.identity,
				ownership: a.ownership,
				expectedHeadSha: a.expectedHeadSha ?? null,
				cleanupState: "not-needed",
				createdAt: now,
				updatedAt: now,
			})
			.onConflictDoNothing()
			.run();
	}
}

/**
 * Boot-time resume sweep. Every operation left in `queued` or `running`
 * from a previous host process is dead — the runtime that owned its
 * in-memory saga is gone. Mark them `failed` with `RESOURCE_BUSY`
 * (retryable) and release any lock rows they held, so a client that
 * calls `begin` again with the same idempotency key gets a fresh
 * operation to work with. Compensation of any partial artifacts is left
 * for the next full-saga resume-worker landing; MVP simply unblocks
 * identity so the user isn't stuck.
 */
export function runProvisioningResumeSweep(deps: {
	db: HostDb;
	journal: OperationJournal;
	eventBus: EventBus | null;
}): void {
	const orphans = deps.db.query.workspaceOperations
		.findMany({
			where: (op, { or, eq }) =>
				or(eq(op.state, "queued"), eq(op.state, "running")),
		})
		.sync();
	if (orphans.length === 0) return;
	for (const op of orphans) {
		releaseOperationLocks(deps.db, op.id);
		deps.journal.patch(op.id, {
			state: "failed",
			stage: null,
			failureCode: "COMPENSATION_INCOMPLETE",
			failureClass: "transient",
			failureRetryable: 1,
			failureMessage: "Host restarted while operation was in flight",
			cleanupState: "pending",
			completedAt: Date.now(),
			launchPayloadJson: null,
		});
		if (deps.eventBus) {
			const refreshed = deps.journal.get(op.id);
			if (refreshed) {
				deps.eventBus.broadcastWorkspaceOperationChanged(
					deps.journal.toWireOperation(refreshed),
				);
			}
		}
	}
	console.warn(
		`[workspace-provisioning] resume sweep marked ${orphans.length} orphan operation(s) as failed(retryable=true)`,
	);
}

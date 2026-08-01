import type { HostDb } from "../db";
import type { EventBus } from "../events";
import type { WorkspaceCatalog } from "../workspace-catalog";
import {
	canonicalizeProvisionRequest,
	ProvisioningInputError,
	stableJson,
} from "./canonical-request";
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
			class: err.code === "IDEMPOTENCY_CONFLICT" ? "conflict" : "precondition",
			retryable: false,
			message: err.message,
			cleanup: "not-needed",
		};
	}
	const message = err instanceof Error ? err.message : String(err);
	// The runner surfaces well-formed failure codes; when it just throws
	// (unmapped), classify as transient/retryable so the client can retry.
	return {
		code: "TERMINAL_UNAVAILABLE",
		class: "transient",
		retryable: true,
		message,
		cleanup: "pending",
	};
}

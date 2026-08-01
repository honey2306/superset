import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { workspaceOperationArtifacts } from "../db/schema";
import type { EventBus } from "../events";
import type { GitFactory } from "../runtime/git";
import type { WorkspaceCatalog } from "../workspace-catalog";
import {
	canonicalizeProvisionRequest,
	ProvisioningInputError,
	stableJson,
} from "./canonical-request";
import { compensateOperation } from "./compensation";
import {
	acquireLeases,
	deriveNaturalLockKeys,
	releaseOperationLocks,
} from "./leases";
import { OperationJournal } from "./operation-journal";
import type { TerminalRuntimeAdapter } from "./terminal-runtime-adapter";
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
	/**
	 * Terminal Runtime Adapter (optional). When absent, `initialSessions`
	 * requests are silently ignored — the operation still returns
	 * succeeded with the journaled workspace id. Production wires the
	 * `createProductionTerminalRuntime` here; tests may swap in
	 * `createInMemoryTerminalRuntime` to exercise post-commit failure.
	 */
	terminalRuntime?: TerminalRuntimeAdapter;
	/**
	 * Git factory reused by pre-commit compensation for `worktree` /
	 * `branch` artifacts. Optional in tests where the fake runner never
	 * produces those artifact kinds.
	 */
	gitFactory?: GitFactory;
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

			// Catalog commit already happened inside the runner. Journal it
			// before starting Terminal Runtime so a post-commit terminal
			// failure still keeps the workspace routable (execplan §Operation
			// state machine: `workspaceId` is exposed as soon as commit
			// succeeds, even while initial sessions are starting).
			this.journal.patch(operationId, {
				stage: "starting-runtime",
				projectId: outcome.projectId,
				workspaceId: outcome.workspaceId,
				catalogCommittedAt: Date.now(),
			});
			this.broadcast(operationId);

			// Start initial sessions if configured. Failures on required
			// intents produce a retryable-failed operation with workspaceId
			// still populated; best-effort failures accumulate as warnings.
			const {
				launches: journaledLaunches,
				warnings: launchWarnings,
				failure: requiredFailure,
			} = await this.startInitialSessions(
				operationId,
				request,
				outcome.workspaceId,
				outcome.artifacts,
			);
			const launches = [...outcome.launches, ...journaledLaunches];
			const warnings = [...outcome.warnings, ...launchWarnings];

			if (requiredFailure) {
				// Post-commit failure: workspaceId remains populated so the
				// renderer can navigate to the committed Workspace and offer
				// retry — do NOT delete the Catalog row.
				this.journal.patch(operationId, {
					state: "failed",
					stage: null,
					failureCode: requiredFailure.code,
					failureClass: requiredFailure.class,
					failureRetryable: requiredFailure.retryable ? 1 : 0,
					failureMessage: requiredFailure.message,
					cleanupState: requiredFailure.cleanup,
					completedAt: Date.now(),
					resultJson: stableJson({
						disposition: outcome.disposition,
						launches,
						warnings,
					}),
				});
				this.broadcast(operationId);
				leases.release();
				return {
					operationId,
					operation: this.getRequired(operationId),
				};
			}

			this.journal.patch(operationId, {
				state: "succeeded",
				stage: null,
				completedAt: Date.now(),
				launchPayloadJson: null,
				resultJson: stableJson({
					disposition: outcome.disposition,
					launches,
					warnings,
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
			// Run compensation on any pre-commit failure (workspaceId still
			// null in the journal). Post-commit failures are handled by the
			// separate `required` intent branch above and never reach here.
			const currentRow = this.journal.get(operationId);
			let cleanupState = failure.cleanup;
			if (
				currentRow &&
				!currentRow.catalogCommittedAt &&
				this.deps.gitFactory
			) {
				try {
					const compensationOutcome = await compensateOperation(
						{
							db: this.deps.db,
							git: this.deps.gitFactory,
							repoRoot: this.resolveRepoRootForOperation(operationId),
						},
						operationId,
					);
					if (compensationOutcome.state === "incomplete") {
						cleanupState = "incomplete";
					} else if (compensationOutcome.state === "complete") {
						cleanupState = "complete";
					}
				} catch (compensationErr) {
					console.warn(
						`[workspace-provisioning] compensation threw for ${operationId}:`,
						compensationErr,
					);
					cleanupState = "incomplete";
				}
			}
			this.journal.patch(operationId, {
				state: "failed",
				stage: null,
				failureCode: failure.code,
				failureClass: failure.class,
				failureRetryable: failure.retryable ? 1 : 0,
				failureMessage: failure.message,
				cleanupState,
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

	/**
	 * Drive the Terminal Runtime Adapter after Catalog commit. Journals a
	 * stable terminal id per intent BEFORE the spawn attempt (so retries
	 * adopt the same daemon session), records a `terminal` artifact per
	 * successful spawn, and separates required-intent failure from
	 * best-effort warnings.
	 */
	private async startInitialSessions(
		operationId: string,
		request: ProvisionWorkspaceRequest,
		workspaceId: string,
		existingArtifacts:
			| ReadonlyArray<{
					kind: "repo-dir" | "worktree" | "branch" | "terminal";
					identity: string;
					ownership: "created" | "adopted";
			  }>
			| undefined,
	): Promise<{
		launches: InitialLaunchResult[];
		warnings: Array<{ code: string; message: string }>;
		failure?: WorkspaceOperationFailure;
	}> {
		const intents = request.initialSessions ?? [];
		if (intents.length === 0 || !this.deps.terminalRuntime) {
			return { launches: [], warnings: [] };
		}
		const worktreePath = this.resolveWorktreePath(workspaceId);
		if (!worktreePath) {
			// Should never happen — the Catalog just committed the row.
			return {
				launches: [],
				warnings: [
					{
						code: "WORKSPACE_MISSING",
						message: `Committed workspace ${workspaceId} not readable in Catalog`,
					},
				],
			};
		}
		const launches: InitialLaunchResult[] = [];
		const warnings: Array<{ code: string; message: string }> = [];
		let requiredFailure: WorkspaceOperationFailure | undefined;

		for (const intent of intents) {
			const terminalId = this.journal.ensureTerminalId(operationId, intent.key);
			try {
				const result = await this.deps.terminalRuntime.startInitialSession({
					intent,
					terminalId,
					workspaceId,
					worktreePath,
				});
				launches.push(result);
				this.journal.markStepComplete(operationId, `terminal:${intent.key}`, {
					sessionId: terminalId,
				});
				// Journal a `terminal` artifact — future compensation only
				// touches ownership='created' rows, so a re-attach on retry
				// is safe (it never gets removed).
				recordArtifacts(this.deps.db, operationId, [
					{
						kind: "terminal",
						identity: terminalId,
						ownership: "created",
					},
				]);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				if (intent.requirement === "required") {
					requiredFailure = {
						code: "TERMINAL_UNAVAILABLE",
						class: "transient",
						retryable: true,
						message,
						cleanup: "pending",
						workspaceId,
					};
					// Required failure short-circuits the remaining intents —
					// a retry will restart them from the journaled state.
					break;
				}
				warnings.push({
					code: "TERMINAL_BEST_EFFORT_FAILED",
					message,
				});
			}
		}

		// Silence the unused-param linter — kept for future compensation
		// hooks that may cross-check terminal launches against runner
		// artifacts.
		void existingArtifacts;

		return { launches, warnings, failure: requiredFailure };
	}

	private resolveWorktreePath(workspaceId: string): string | null {
		const row = this.deps.db.query.workspaces
			.findFirst({
				where: (w, { eq }) => eq(w.id, workspaceId),
			})
			.sync();
		return row?.worktreePath ?? null;
	}

	/**
	 * Best-effort repo root lookup for pre-commit compensation. Falls
	 * back to `null` when the operation's artifacts are all path-pinned
	 * (repo-dir / worktree by absolute path) and no git bookkeeping is
	 * required.
	 */
	private resolveRepoRootForOperation(operationId: string): string | undefined {
		const artifacts = this.deps.db
			.select()
			.from(workspaceOperationArtifacts)
			.where(eq(workspaceOperationArtifacts.operationId, operationId))
			.all();
		const repoDir = artifacts.find((a) => a.kind === "repo-dir");
		if (repoDir) return repoDir.identity;
		// Worktree artifacts alone don't tell us the parent repo — the
		// production runner never emits one without the corresponding
		// `repo-dir` today. Leave undefined and let removeArtifact() take
		// the filesystem-only path.
		return undefined;
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
/**
 * Boot-time resume sweep. Distinguishes two flavors of orphan:
 *
 *   1. Pre-commit orphan (catalog_committed_at IS NULL) — the previous
 *      process died before Catalog materialization. Any partial fs/git
 *      artifacts are stale; queue compensation as `pending`, clear
 *      identity leases, and mark the operation failed(retryable=true)
 *      with `COMPENSATION_INCOMPLETE`.
 *
 *   2. Post-commit orphan (catalog_committed_at IS NOT NULL) — the
 *      Workspace itself is real and routable; only Terminal Runtime
 *      never got to finish. Preserve `workspaceId` so the renderer
 *      can navigate immediately, mark the operation failed(retryable=
 *      true) with `TERMINAL_UNAVAILABLE`, and leave the identity lease
 *      released so a retry can adopt the journaled terminal ids.
 *
 * Both flavors ship `launchPayloadJson=null` — the payload is only
 * kept while the operation might resume; a boot-time crash counts as
 * a final failure until the user or client explicitly re-issues begin.
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
	let preCommit = 0;
	let postCommit = 0;
	for (const op of orphans) {
		releaseOperationLocks(deps.db, op.id);
		const isPostCommit = op.catalogCommittedAt !== null;
		if (isPostCommit) {
			postCommit++;
			deps.journal.patch(op.id, {
				state: "failed",
				stage: null,
				failureCode: "TERMINAL_UNAVAILABLE",
				failureClass: "transient",
				failureRetryable: 1,
				failureMessage:
					"Host restarted while starting the initial workspace sessions",
				// Terminal sessions are user-visible; execplan §Commit and
				// compensation forbids removing them from compensation.
				cleanupState: "not-needed",
				completedAt: Date.now(),
				launchPayloadJson: null,
			});
		} else {
			preCommit++;
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
		}
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
		`[workspace-provisioning] resume sweep: ${preCommit} pre-commit + ${postCommit} post-commit orphan(s) marked failed(retryable=true)`,
	);
}

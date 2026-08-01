import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { workspaceOperationLocks as locksTable } from "../db/schema";
import { canonicalizeHostPath } from "../workspace-catalog/canonical-path";
import { ProvisioningInputError } from "./canonical-request";
import type { ProvisionWorkspaceRequest } from "./types";

/**
 * Natural-identity lock keys derived from a canonical request. See the
 * execplan §Canonicalization for the exact list. Existing-project requests
 * add a `git-repo:*` key at execution time after resolving the Catalog path;
 * path-based materializers already have an equivalent `project-path:*` key.
 */
export function deriveNaturalLockKeys(
	request: ProvisionWorkspaceRequest,
): string[] {
	const keys: string[] = [];
	switch (request.project.kind) {
		case "temporary":
			keys.push(`temporary:${request.project.singletonKey}`);
			break;
		case "import":
			keys.push(`project-path:${canonicalizeHostPath(request.project.path)}`);
			break;
		case "clone":
		case "empty":
		case "template":
			keys.push(
				`project-path:${canonicalizeHostPath(
					`${request.project.parentDirectory}/${request.project.name}`,
				)}`,
			);
			break;
		case "setup-existing":
			// The mode determines the canonical target path (clone or import).
			if (request.project.mode.kind === "clone") {
				keys.push(
					`project-path:${canonicalizeHostPath(
						`${request.project.mode.parentDirectory}/${
							request.project.origin.name ?? request.project.projectId
						}`,
					)}`,
				);
			} else {
				keys.push(
					`project-path:${canonicalizeHostPath(request.project.mode.path)}`,
				);
			}
			break;
	}
	if ("projectId" in request.project) {
		const projectId = request.project.projectId;
		switch (request.source.kind) {
			case "main":
				keys.push(`project:${projectId}:main`);
				break;
			case "branch":
				if (request.source.name.kind === "explicit") {
					keys.push(
						`project:${projectId}:branch:${request.source.name.value.trim()}`,
					);
				}
				// generated branch names have no identity lease — they get a
				// unique name at materialize time.
				break;
			case "worktree":
				keys.push(
					`project:${projectId}:worktree:${canonicalizeHostPath(
						request.source.path,
					)}`,
				);
				break;
			case "pull-request":
				keys.push(
					`project:${projectId}:pr:${request.source.provider}:${request.source.number}`,
				);
				break;
		}
	}
	return keys;
}

export interface LeaseAcquisition {
	release(): void;
}

/**
 * Try to claim every key atomically inside a single SQLite transaction.
 * If any key is already held by a live operation, the whole set is
 * rolled back and `RESOURCE_BUSY` is thrown carrying the offending
 * operation id — the caller (`begin`) surfaces it as a
 * `ProvisioningInputError` with the same code and never journals a new
 * operation row.
 */
export function acquireLeases(args: {
	db: HostDb;
	operationId: string;
	keys: string[];
	leaseSeconds?: number;
}): LeaseAcquisition {
	if (args.keys.length === 0) {
		return { release: () => {} };
	}
	const owner = randomUUID();
	const expiresAt = Date.now() + (args.leaseSeconds ?? 300) * 1000;
	const sorted = [...new Set(args.keys)].sort();
	args.db.transaction((tx) => {
		for (const key of sorted) {
			const existing = tx
				.select()
				.from(locksTable)
				.where(eq(locksTable.lockKey, key))
				.get();
			if (existing) {
				// Expired lease: reclaim. Otherwise this key belongs to another
				// active operation and we must refuse.
				if (existing.leaseExpiresAt < Date.now()) {
					tx.delete(locksTable).where(eq(locksTable.lockKey, key)).run();
				} else {
					throw new ProvisioningInputError(
						"RESOURCE_BUSY",
						`Resource busy (${key}), held by operation ${existing.operationId}`,
					);
				}
			}
			tx.insert(locksTable)
				.values({
					lockKey: key,
					operationId: args.operationId,
					leaseOwner: owner,
					leaseExpiresAt: expiresAt,
				})
				.run();
		}
	});
	return {
		release: () => {
			for (const key of sorted) {
				args.db
					.delete(locksTable)
					.where(
						and(eq(locksTable.lockKey, key), eq(locksTable.leaseOwner, owner)),
					)
					.run();
			}
		},
	};
}

/**
 * Release every lock row owned by an operation, regardless of key or
 * lease owner. Used on final cleanup and by the boot-time resume sweep.
 */
export function releaseOperationLocks(db: HostDb, operationId: string): void {
	db.delete(locksTable).where(eq(locksTable.operationId, operationId)).run();
}

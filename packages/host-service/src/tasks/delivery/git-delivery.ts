import { randomUUID } from "node:crypto";
import {
	copyFile,
	mkdir,
	open,
	readFile,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import type { GitDeliveryPlan } from "@superset/shared/tasks";
import { eq } from "drizzle-orm";
import { taskOperations } from "../../db/schema";
import { isProcessGroupAlive } from "../checks/check-runner";
import { changedTaskPaths } from "../checks/check-selection";
import { fingerprintWorktree } from "../checks/worktree-fingerprint";
import type { TaskRun, TaskStore } from "../task-store";
import { contentIdentity, observeFile } from "./file-observation";
import { deliveryTarget, gitCommand, gitText, hashBytes } from "./git-io";
import type { TaskDeliveryCapability } from "./task-delivery-capability";

export type GitOperation = typeof taskOperations.$inferSelect;
const errorText = (error: unknown) =>
	error instanceof Error ? error.message : String(error);
async function bytesHash(file: string) {
	try {
		return hashBytes(await readFile(file));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}
function mapEqual(a: Record<string, string>, b: Record<string, string>) {
	return (
		JSON.stringify(Object.entries(a).sort()) ===
		JSON.stringify(Object.entries(b).sort())
	);
}

/** Git owns commit hooks, signing and refs. A private index contains only this
 * task's proved edits. The real index is locked and atomically reconciled, keeping
 * unrelated staged hunks. No reset, stash, force push or inferred publication. */
export class GitTaskDelivery implements TaskDeliveryCapability {
	async execute(
		run: TaskRun,
		signal: AbortSignal,
	): Promise<{ summary: string } | null> {
		let operation = await this.prepare(run, signal);
		operation = await this.commit(run, operation, signal);
		if (operation.status !== "confirmed")
			throw new Error(operation.error || "Task commit was not confirmed");
		if (signal.aborted || this.store.getRun(run.id).desiredState !== "running")
			return null;
		await this.validateAfterCommit(operation);
		if (run.contract.delivery?.mode === "push") {
			const pushed = await this.push(run, operation, signal);
			if (pushed.status !== "confirmed")
				throw new Error(
					pushed.error || "Push was not confirmed at the destination",
				);
		}
		return {
			summary:
				run.contract.delivery?.mode === "push"
					? `Verified commit ${operation.commitOid} confirmed at the selected remote branch`
					: `Task commit ${operation.commitOid} created locally; acceptance was evaluated in the working directory`,
		};
	}
	hasUnresolved(run: TaskRun) {
		return this.store
			.operations(run.id)
			.some(
				(op) =>
					op.status === "unknown" ||
					op.status === "submitted" ||
					Boolean(op.leaseKey),
			);
	}

	constructor(private store: TaskStore) {}
	private update(
		id: string,
		patch: Partial<typeof taskOperations.$inferInsert>,
	) {
		this.store.db
			.update(taskOperations)
			.set({ ...patch, updatedAt: Date.now() })
			.where(eq(taskOperations.id, id))
			.run();
		return this.get(id);
	}
	private get(id: string) {
		const op = this.store.db
			.select()
			.from(taskOperations)
			.where(eq(taskOperations.id, id))
			.get();
		if (!op) throw new Error("Delivery operation not found");
		return op;
	}
	private active(run: TaskRun) {
		const current = this.store.getRun(run.id);
		if (current.deadlineAt && Date.now() >= current.deadlineAt)
			throw new Error(
				"Git delivery time budget exceeded; no further side effects are allowed",
			);
		if (
			current.desiredState !== "running" ||
			current.deliveryRevoked ||
			current.revision !== run.revision ||
			current.acceptedRevision !== run.revision ||
			this.store.guidance.unresolved(run.id).length
		)
			throw new Error(
				"Delivery authorization changed; no new Git side effect is allowed",
			);
	}
	private async remoteHead(plan: GitDeliveryPlan, signal?: AbortSignal) {
		if (!plan.remoteUrl || !plan.remoteBranch)
			throw new Error("Missing pinned remote destination");
		const result = (
			await gitCommand(
				plan.root,
				[
					"ls-remote",
					"--refs",
					"--",
					plan.remoteUrl,
					`refs/heads/${plan.remoteBranch}`,
				],
				{ signal },
			)
		).stdout
			.toString()
			.trim();
		const [oid, ref] = result.split(/\s+/);
		if (!oid || ref !== `refs/heads/${plan.remoteBranch}`)
			throw new Error(
				"Remote target branch must already exist; automatic creation/history publication is not enabled",
			);
		return oid;
	}
	async prepare(run: TaskRun, signal?: AbortSignal): Promise<GitOperation> {
		const previous = this.store
			.operations(run.id)
			.find((op) => op.kind === "commit");
		if (previous) return previous;
		this.active(run);
		const delivery = run.contract.delivery;
		if (!delivery || delivery.mode === "none")
			throw new Error("Git delivery was not authorized");
		if (run.contract.harness !== "pi-acp")
			throw new Error(
				"Automatic Git delivery needs Pi-native file provenance in this version; use manual Git for this ACP engine",
			);
		const snapshot = await fingerprintWorktree(run.cwd);
		if (
			snapshot.fingerprint !== run.verifiedFingerprint ||
			snapshot.ref !== run.baselineRef
		)
			throw new Error(
				"Verified inputs or Git reference changed before delivery",
			);
		const root = await gitText(run.cwd, ["rev-parse", "--show-toplevel"]);
		const gitDir = await gitText(root, ["rev-parse", "--absolute-git-dir"]);
		const common = resolve(
			root,
			await gitText(root, ["rev-parse", "--git-common-dir"]),
		);
		const ref = await gitText(root, ["symbolic-ref", "--quiet", "HEAD"]);
		if (ref !== `refs/heads/${delivery.branch}`)
			throw new Error(
				"Current branch differs from the branch explicitly selected for delivery",
			);
		const parentOid = await gitText(root, ["rev-parse", "--verify", "HEAD"]);
		for (const flag of [
			"MERGE_HEAD",
			"CHERRY_PICK_HEAD",
			"REVERT_HEAD",
			"rebase-merge",
			"rebase-apply",
		]) {
			try {
				await stat(join(gitDir, flag));
				throw new Error(
					`Finish the existing Git operation (${flag}) before task delivery`,
				);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
		}
		const paths = changedTaskPaths(run.baselineChanges, snapshot.changes);
		if (!paths)
			throw new Error(
				"Task changed-file baseline is unavailable; cannot establish commit ownership",
			);
		if (paths.length > 500)
			throw new Error(
				"Automatic delivery is limited to 500 attributable paths",
			);
		// A local selective commit can preserve unrelated dirty work. Publishing
		// it would omit inputs present during verification: fail closed until an
		// isolated exact-tree verification path is available.
		if (
			delivery.mode === "push" &&
			Object.keys(run.baselineChanges ?? {}).length
		)
			throw new Error(
				"Automatic push requires a clean initial working tree: the checks otherwise include pre-existing inputs that would be omitted from the published commit. Preserve them and use isolation/manual Git",
			);
		const allEdits = this.store.edits(run.id);
		for (const path of paths) {
			if (
				path.split("/").includes("..") ||
				isAbsolute(path) ||
				path.split("/").includes(".git")
			)
				throw new Error("Unsafe task path");
			if (run.baselineChanges?.[path])
				throw new Error(
					`Mixed/pre-existing edits in ${path}; automatic commit refused without overwriting user changes`,
				);
			const edits = allEdits.filter(
				(item) => relative(root, item.path) === path,
			);
			if (!edits.length || edits.some((item) => !item.reliable))
				throw new Error(
					`Unattributed changes in ${path}. Shell/external edits require manual Git; they are not silently included`,
				);
			const tree = (
				await gitCommand(root, ["ls-tree", "-z", parentOid, "--", path])
			).stdout.toString();
			let initial: string | null = null;
			if (tree) {
				const [mode, , oid] = tree.split(/[ \t]/);
				if (!oid || (mode !== "100644" && mode !== "100755"))
					throw new Error(`Unsupported Git file mode: ${path}`);
				initial = contentIdentity(
					(await gitCommand(root, ["cat-file", "blob", oid])).stdout,
					mode === "100755",
				);
			}
			let last = initial;
			for (const edit of edits) {
				if (edit.before !== last)
					throw new Error(
						`External or overlapping mutation detected in ${path}; attribution chain is broken`,
					);
				last = edit.after;
			}
			const current = observeFile(join(root, path));
			if (!current.reliable || current.hash !== last)
				throw new Error(
					`File changed outside the task's observed writes: ${path}`,
				);
		}
		const id = randomUUID(),
			tempDir = join(gitDir, "superset-task-delivery", id),
			tempIndex = join(tempDir, "commit-index"),
			indexPath = join(gitDir, "index"),
			lockPath = `${indexPath}.lock`;
		await mkdir(tempDir, { recursive: true, mode: 0o700 });
		try {
			const index = await readFile(indexPath);
			await writeFile(join(tempDir, "original-index"), index, { mode: 0o600 });
			await gitCommand(root, ["read-tree", parentOid], { index: tempIndex });
			const pathFile = join(tempDir, "paths");
			await writeFile(pathFile, Buffer.from(`${paths.join("\0")}\0`));
			if (paths.length)
				await gitCommand(
					root,
					["add", `--pathspec-from-file=${pathFile}`, "--pathspec-file-nul"],
					{ index: tempIndex },
				);
			const treeOid = await gitTextIndex(root, ["write-tree"], tempIndex);
			if (delivery.mode === "push") {
				for (const path of paths) {
					const entry = (
						await gitCommand(root, ["ls-tree", "-z", treeOid, "--", path])
					).stdout.toString();
					const [mode, , oid] = entry.split(/[ \t]/);
					const current = observeFile(join(root, path));
					const staged =
						entry && oid
							? contentIdentity(
									(await gitCommand(root, ["cat-file", "blob", oid])).stdout,
									mode === "100755",
								)
							: null;
					if (!current.reliable || current.hash !== staged)
						throw new Error(
							`Git filters/normalization changed ${path}; the publishable bytes were not the bytes checked. Explicit isolated verification is required`,
						);
				}
				const net = new Map<
					string,
					{ before: string | null; after: string | null }
				>();
				for (const edit of allEdits) {
					const previous = net.get(edit.path);
					net.set(edit.path, {
						before: previous ? previous.before : edit.before,
						after: edit.after,
					});
				}
				for (const [path, change] of net)
					if (
						change.before !== change.after &&
						!paths.includes(relative(root, path))
					)
						throw new Error(
							"Observed non-Git/ignored file changes are outside the publishable tree; isolated verification is required",
						);
			}
			await copyFile(
				join(tempDir, "original-index"),
				join(tempDir, "result-index"),
			);
			const selected = new Map<string, string>();
			if (paths.length) {
				const entries = (
					await gitCommand(
						root,
						["ls-files", "--stage", "-z", "--", ...paths],
						{ index: tempIndex },
					)
				).stdout.toString();
				for (const entry of entries.split("\0").filter(Boolean)) {
					const i = entry.indexOf("\t");
					selected.set(entry.slice(i + 1), entry);
				}
				const info = `${paths
					.map(
						(path) =>
							selected.get(path) ??
							`0 ${"0".repeat(parentOid.length)}\t${path}`,
					)
					.join("\0")}\0`;
				await gitCommand(root, ["update-index", "-z", "--index-info"], {
					index: join(tempDir, "result-index"),
					input: Buffer.from(info),
				});
			}
			const expectedIndexHash = hashBytes(
				await readFile(join(tempDir, "result-index")),
			);
			const plan: GitDeliveryPlan = {
				expectedIndexEntriesHash: hashBytes(
					(
						await gitCommand(root, ["ls-files", "--stage", "-z"], {
							index: join(tempDir, "result-index"),
						})
					).stdout,
				),
				root,
				gitDir,
				ref,
				parentOid,
				treeOid,
				paths,
				verifiedFingerprint: snapshot.fingerprint,
				beforeChanges: snapshot.changes ?? {},
				indexHash: hashBytes(index),
				expectedIndexHash,
				indexPath,
				lockPath,
				tempDir,
				tempIndex,
				message: `${delivery.message}\n\nSuperset-Task-Run: ${run.id}\nSuperset-Delivery: ${id}\n`,
			};
			if (delivery.mode === "push") {
				const target = await deliveryTarget(root, delivery.remote);
				if (target.targetHash !== delivery.targetHash)
					throw new Error(
						"Git remote changed since the user selected it; publication refused",
					);
				plan.remoteUrl = target.url;
				plan.remoteHash = target.targetHash;
				plan.remoteBranch = delivery.remoteBranch;
				plan.remoteBefore = await this.remoteHead(plan, signal);
				if (plan.remoteBefore !== parentOid)
					throw new Error(
						"Remote branch must exactly match this task's initial HEAD. Refusing to publish unrelated local commits or overwrite remote work",
					);
			}
			if (
				(await fingerprintWorktree(run.cwd)).fingerprint !==
					snapshot.fingerprint ||
				(await bytesHash(indexPath)) !== plan.indexHash
			)
				throw new Error("Inputs changed during delivery preparation");
			this.active(run);
			const now = Date.now();
			this.store.db
				.insert(taskOperations)
				.values({
					id,
					runId: run.id,
					revision: run.revision,
					kind: "commit",
					status: "prepared",
					plan,
					leaseKey: common,
					createdAt: now,
					updatedAt: now,
				})
				.run();
			return this.get(id);
		} catch (error) {
			await rm(tempDir, { recursive: true, force: true });
			throw error;
		}
	}
	private async ownLock(plan: GitDeliveryPlan) {
		const existing = await bytesHash(plan.lockPath);
		if (existing !== null) {
			const info = await stat(plan.lockPath);
			if (
				existing !== plan.expectedIndexHash ||
				plan.lockIdentity !== `${info.dev}:${info.ino}`
			)
				throw new Error(
					"Git index is locked by another operation; no lock was removed",
				);
			return;
		}
		if ((await bytesHash(plan.indexPath)) !== plan.indexHash)
			throw new Error("User's staging index changed; no index was overwritten");
		const lock = await open(plan.lockPath, "wx", 0o600);
		try {
			await lock.writeFile(await readFile(join(plan.tempDir, "result-index")));
			await lock.sync();
			const info = await lock.stat();
			plan.lockIdentity = `${info.dev}:${info.ino}`;
			this.update(basename(plan.tempDir), { plan });
		} finally {
			await lock.close();
		}
	}
	private async releaseOwnLock(plan: GitDeliveryPlan) {
		if ((await bytesHash(plan.lockPath)) !== plan.expectedIndexHash) return;
		const info = await stat(plan.lockPath);
		if (plan.lockIdentity === `${info.dev}:${info.ino}`)
			await rm(plan.lockPath);
	}
	private async reconcileCommit(op: GitOperation): Promise<GitOperation> {
		const plan = op.plan,
			head = await gitText(plan.root, ["rev-parse", plan.ref]);
		const currentRef = await gitText(plan.root, [
			"symbolic-ref",
			"--quiet",
			"HEAD",
		]);
		if (currentRef !== plan.ref) {
			await this.releaseOwnLock(plan);
			return this.update(op.id, {
				status: "unknown",
				pid: null,
				error:
					"Current branch changed while Git delivery was in flight. Commit effects need manual inspection; no push or rollback was attempted",
			});
		}
		if (head === plan.parentOid) {
			await this.releaseOwnLock(plan);
			return this.update(op.id, {
				status: "failed",
				pid: null,
				error:
					"Commit was not created. Correct the reported error and explicitly retry delivery",
				leaseKey: null,
			});
		}
		const actual = await gitText(plan.root, [
			"show",
			"-s",
			"--format=%T%n%P%n%B",
			head,
		]);
		const [tree, parents, ...body] = actual.split("\n");
		if (
			tree !== plan.treeOid ||
			parents !== plan.parentOid ||
			!body.join("\n").split("\n").includes(`Superset-Delivery: ${op.id}`)
		) {
			await this.releaseOwnLock(plan);
			return this.update(op.id, {
				status: "unknown",
				pid: null,
				error:
					"HEAD changed but does not match the planned task commit. Inspect hooks/concurrent Git activity; no push or rollback was attempted",
			});
		}
		const index = await bytesHash(plan.indexPath);
		const alreadyReconciled =
			index === plan.expectedIndexHash ||
			(plan.expectedIndexEntriesHash &&
				hashBytes(
					(await gitCommand(plan.root, ["ls-files", "--stage", "-z"])).stdout,
				) === plan.expectedIndexEntriesHash);
		if (!alreadyReconciled) {
			if (index !== plan.indexHash)
				throw new Error(
					"Commit exists, but staging index was modified externally. Reconciliation will not overwrite it",
				);
			await this.ownLock(plan);
			if ((await bytesHash(plan.indexPath)) !== plan.indexHash)
				throw new Error("Staging index changed during reconciliation");
			await rename(plan.lockPath, plan.indexPath);
		} else await this.releaseOwnLock(plan);
		return this.update(op.id, {
			status: "confirmed",
			commitOid: head,
			pid: null,
			error: null,
			leaseKey: null,
		});
	}
	async commit(
		run: TaskRun,
		op: GitOperation,
		signal: AbortSignal,
	): Promise<GitOperation> {
		if (op.status === "confirmed") return op;
		if (op.status === "submitted" || op.status === "unknown") {
			if (op.pid && isProcessGroupAlive(op.pid))
				throw new Error(
					"Previous Git process may still be alive; its operation is not being replayed",
				);
			return this.reconcileCommit(op);
		}
		if (op.status !== "prepared")
			throw new Error(
				"Git delivery failed; use explicit delivery retry, not a new agent execution",
			);
		this.active(run);
		if (
			(await gitText(op.plan.root, ["symbolic-ref", "--quiet", "HEAD"])) !==
				op.plan.ref ||
			(await fingerprintWorktree(run.cwd)).fingerprint !==
				op.plan.verifiedFingerprint
		)
			throw new Error("Verified code or branch changed before commit");
		if (!op.plan.paths.length)
			return this.update(op.id, {
				status: "confirmed",
				commitOid: op.plan.parentOid,
				leaseKey: null,
				output: "No new task changes; no commit created",
			});
		await this.ownLock(op.plan);
		try {
			this.active(run);
			if (signal.aborted) throw new Error("Delivery stopped before commit");
			this.update(op.id, {
				leaseKey: resolve(
					op.plan.root,
					await gitText(op.plan.root, ["rev-parse", "--git-common-dir"]),
				),
			});
			await writeFile(join(op.plan.tempDir, "message"), op.plan.message, {
				mode: 0o600,
			});
			this.update(op.id, { status: "submitted", error: null });
			const result = await gitCommand(
				op.plan.root,
				["commit", "-F", join(op.plan.tempDir, "message")],
				{
					index: op.plan.tempIndex,
					signal,
					timeoutMs: 60_000,
					allowFailure: true,
					onStart: (pid) => {
						this.update(op.id, { pid });
					},
				},
			);
			this.update(op.id, {
				exitCode: result.code,
				output: (result.stdout.toString() + result.stderr).slice(-64 * 1024),
			});
		} catch (error) {
			this.update(op.id, { status: "unknown", error: errorText(error) });
		}
		const current = this.get(op.id);
		if (current.pid && isProcessGroupAlive(current.pid))
			throw new Error(
				"Git process termination is not confirmed; preserve its delivery operation",
			);
		return this.reconcileCommit(current);
	}
	async validateAfterCommit(op: GitOperation) {
		const snapshot = await fingerprintWorktree(op.plan.root);
		if (
			(await gitText(op.plan.root, ["symbolic-ref", "--quiet", "HEAD"])) !==
				op.plan.ref ||
			(await gitText(op.plan.root, ["rev-parse", op.plan.ref])) !== op.commitOid
		)
			throw new Error(
				"Branch changed after the task commit; publication is blocked",
			);
		const remaining = { ...op.plan.beforeChanges };
		for (const path of op.plan.paths) delete remaining[path];
		if (!mapEqual(remaining, snapshot.changes ?? {}))
			throw new Error(
				"Working code changed after verification/commit (possibly by a hook). Existing commit retained; publication is blocked",
			);
	}
	async push(
		run: TaskRun,
		commit: GitOperation,
		signal: AbortSignal,
	): Promise<GitOperation> {
		const delivery = run.contract.delivery;
		if (delivery?.mode !== "push") throw new Error("Push was not authorized");
		let op = this.store.operations(run.id).find((item) => item.kind === "push");
		if (op?.status === "confirmed") return op;
		if (op?.pid && isProcessGroupAlive(op.pid))
			throw new Error(
				"Previous push process may still be alive; not replaying it",
			);
		const head = await this.remoteHead(commit.plan, signal);
		if (op && (op.status === "submitted" || op.status === "unknown")) {
			if (head === commit.commitOid)
				return this.update(op.id, {
					status: "confirmed",
					pid: null,
					error: null,
					leaseKey: null,
				});
			return this.update(op.id, {
				status: "failed",
				pid: null,
				leaseKey: null,
				error:
					head === commit.plan.remoteBefore
						? "Remote still has the prior commit; retry explicitly"
						: "Remote moved independently; automatic overwrite is forbidden",
			});
		}
		this.active(run);
		await this.validateAfterCommit(commit);
		if (
			(await deliveryTarget(commit.plan.root, delivery.remote)).targetHash !==
			delivery.targetHash
		)
			throw new Error("Configured remote changed; refusing publication");
		if (head !== commit.plan.remoteBefore)
			throw new Error(
				"Remote changed since task preparation; no force push is allowed",
			);
		if (!op) {
			const now = Date.now();
			const id = randomUUID();
			this.store.db
				.insert(taskOperations)
				.values({
					id,
					runId: run.id,
					revision: run.revision,
					kind: "push",
					status: "prepared",
					plan: commit.plan,
					commitOid: commit.commitOid,
					createdAt: now,
					updatedAt: now,
				})
				.run();
			op = this.get(id);
		}
		if (op.status !== "prepared")
			throw new Error("Retry the existing push explicitly");
		if (!commit.commitOid || !commit.plan.remoteUrl)
			throw new Error("Missing confirmed commit or pinned remote");
		if (!commit.plan.paths.length)
			return this.update(op.id, {
				status: "confirmed",
				output: "No changes; remote already matches",
				pid: null,
			});
		this.active(run);
		if (signal.aborted) throw new Error("Delivery stopped before push");
		this.update(op.id, {
			status: "submitted",
			leaseKey: resolve(
				commit.plan.root,
				await gitText(commit.plan.root, ["rev-parse", "--git-common-dir"]),
			),
			error: null,
		});
		try {
			const result = await gitCommand(
				commit.plan.root,
				[
					"push",
					"--porcelain",
					"--",
					commit.plan.remoteUrl,
					`${commit.commitOid}:refs/heads/${delivery.remoteBranch}`,
				],
				{
					signal,
					timeoutMs: 90_000,
					allowFailure: true,
					onStart: (pid) => {
						this.update(op.id, { pid });
					},
				},
			);
			this.update(op.id, {
				exitCode: result.code,
				output: (result.stdout.toString() + result.stderr).slice(-64 * 1024),
			});
		} catch (error) {
			this.update(op.id, { status: "unknown", error: errorText(error) });
		}
		const current = this.get(op.id);
		if (current.pid && isProcessGroupAlive(current.pid))
			throw new Error("Push process stop is not confirmed");
		try {
			return this.update(op.id, {
				status:
					(await this.remoteHead(commit.plan)) === commit.commitOid
						? "confirmed"
						: "failed",
				pid: null,
				leaseKey: null,
			});
		} catch {
			return this.update(op.id, {
				status: "unknown",
				pid: null,
				error: "Push result is unknown. Reconcile the remote before retrying",
			});
		}
	}
	async releasePrepared(run: TaskRun) {
		for (const op of this.store.operations(run.id))
			if (op.status === "prepared") {
				if (op.kind === "commit") await this.releaseOwnLock(op.plan);
				this.update(op.id, {
					status: "failed",
					pid: null,
					leaseKey: null,
					error: "Delivery stopped before this operation was dispatched",
				});
			}
	}
	async retry(run: TaskRun) {
		for (const op of this.store.operations(run.id)) {
			if (op.status === "submitted" || op.status === "unknown")
				throw new Error("Reconcile unknown Git operations before retrying");
			if (op.status !== "failed") continue;
			if (op.kind === "commit") {
				if (
					(await fingerprintWorktree(run.cwd)).fingerprint !==
						op.plan.verifiedFingerprint ||
					(await gitText(op.plan.root, ["rev-parse", op.plan.ref])) !==
						op.plan.parentOid
				)
					throw new Error(
						"Inputs changed after failed commit; cannot retry publication without fresh verification",
					);
				// Reset ONLY the private task index to the already verified tree.
				await gitCommand(op.plan.root, ["read-tree", op.plan.treeOid], {
					index: op.plan.tempIndex,
				});
			}
			this.update(op.id, {
				status: "prepared",
				error: null,
				pid: null,
				exitCode: null,
			});
		}
	}
	async reconcile(run: TaskRun) {
		for (const op of this.store.operations(run.id)) {
			if (op.status !== "submitted" && op.status !== "unknown") continue;
			if (op.pid && isProcessGroupAlive(op.pid))
				throw new Error(
					"Previous Git process is still present; no duplicate operation started",
				);
			if (op.kind === "commit") await this.reconcileCommit(op);
			else {
				const remote = await this.remoteHead(op.plan);
				this.update(op.id, {
					status: remote === op.commitOid ? "confirmed" : "failed",
					pid: null,
					leaseKey: null,
					error:
						remote === op.commitOid
							? null
							: "Push not confirmed at target; inspect before retrying",
				});
			}
		}
	}
}
async function gitTextIndex(cwd: string, args: string[], index: string) {
	return (await gitCommand(cwd, args, { index })).stdout.toString().trim();
}

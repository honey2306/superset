import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
	chmodSync,
	copyFileSync,
	existsSync,
	readFileSync,
	realpathSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { taskDeliverySchema } from "@superset/shared/tasks";
import { eq } from "drizzle-orm";
import { taskOperations } from "../../db/schema";
import { eventually, taskFixture } from "../test-fixture";
import { observeFile } from "./file-observation";
import { deliveryTarget } from "./git-io";

type Fixture = Awaited<ReturnType<typeof taskFixture>>;
const fixtures: Fixture[] = [];
afterEach(async () => {
	for (const f of fixtures.splice(0)) await f.close();
});
function git(f: Fixture, ...args: string[]) {
	return execFileSync("git", args, { cwd: f.cwd, encoding: "utf8" }).trim();
}
async function fixture(mode: "commit" | "push" = "commit", review = false) {
	const f = await taskFixture({
		checks: [
			{
				name: "value",
				command: 'test "$(cat value.txt)" = right',
				timeoutMs: 2000,
			},
		],
		completion: review ? "review" : "checks",
	});
	fixtures.push(f);
	git(f, "config", "user.name", "Task Test");
	git(f, "config", "user.email", "task@example.invalid");
	git(f, "config", "commit.gpgsign", "false");
	const branch = git(f, "branch", "--show-current");
	let delivery: ReturnType<typeof taskDeliverySchema.parse> = {
		mode: "commit",
		branch,
		message: "fix(task): correct value",
	};
	if (mode === "push") {
		const remote = join(f.directory, "remote.git");
		git(f, "init", "--bare", "-q", remote);
		git(f, "remote", "add", "task-remote", remote);
		git(f, "push", "-q", "task-remote", `HEAD:refs/heads/${branch}`);
		delivery = {
			mode: "push",
			branch,
			message: "fix(task): correct value",
			remote: "task-remote",
			remoteBranch: branch,
			targetHash: (await deliveryTarget(f.cwd, "task-remote")).targetHash,
		};
	}
	f.store.patch(f.runId, { contract: { ...f.run().contract, delivery } });
	return f;
}
function edit(f: Fixture, path: string, content: string) {
	const absolute = join(realpathSync(f.cwd), path),
		before = observeFile(absolute);
	writeFileSync(absolute, content);
	const after = observeFile(absolute);
	f.store.recordEdit(f.run().sessionId, {
		path: absolute,
		before: before.hash,
		after: after.hash,
		reliable: before.reliable && after.reliable,
		toolCallId: crypto.randomUUID(),
	});
}
async function complete(f: Fixture) {
	await eventually(
		() =>
			[
				"succeeded",
				"failed",
				"blocked",
				"awaiting_review",
				"paused",
				"cancelled",
			].includes(f.run().status),
		() => f.runner.tick(),
		15000,
	);
}
async function ready(f: Fixture) {
	edit(f, "value.txt", "right\n");
	await f.ready();
	await complete(f);
}

describe("actual Git task delivery", () => {
	test("delivery remains opt-in and rejects branch/refspec injection", () => {
		expect(taskDeliverySchema.parse({ mode: "none" })).toEqual({
			mode: "none",
		});
		for (const branch of [
			"-f",
			"a:b",
			"a..b",
			"a.lock",
			"x/y.lock",
			"x\nmain",
		]) {
			expect(() =>
				taskDeliverySchema.parse({ mode: "commit", branch, message: "x" }),
			).toThrow();
		}
	});
	test("confirmed commit contains precisely the verified task tree with normal Git identity", async () => {
		const f = await fixture();
		const parent = git(f, "rev-parse", "HEAD");
		await f.start();
		await ready(f);
		expect(f.run().status).toBe("succeeded");
		const op = f.store.operations(f.runId)[0];
		expect(op?.status).toBe("confirmed");
		expect(op?.commitOid).toBe(git(f, "rev-parse", "HEAD"));
		expect(git(f, "show", "-s", "--format=%P", "HEAD")).toBe(parent);
		expect(git(f, "show", "HEAD:value.txt")).toBe("right");
		expect(git(f, "status", "--porcelain")).toBe("");
		expect(f.driver.submissions).toHaveLength(1);
	});
	test("push is explicit, non-force and confirms the exact commit at an existing destination", async () => {
		const f = await fixture("push");
		await f.start();
		await ready(f);
		expect(f.run().reason).toContain("confirmed at the selected remote branch");
		expect(f.run().status).toBe("succeeded");
		expect(f.store.operations(f.runId).map((op) => op.status)).toEqual([
			"confirmed",
			"confirmed",
		]);
		const remote = git(
			f,
			"ls-remote",
			"task-remote",
			"HEAD",
			`refs/heads/${git(f, "branch", "--show-current")}`,
		);
		expect(remote).toContain(git(f, "rev-parse", "HEAD"));
	});
	test("unrelated staged and unstaged edits survive; they are not committed", async () => {
		const f = await fixture();
		writeFileSync(join(f.cwd, "other.txt"), "base\n");
		git(f, "add", "other.txt");
		git(f, "commit", "-qm", "test baseline");
		writeFileSync(join(f.cwd, "other.txt"), "staged\n");
		git(f, "add", "other.txt");
		writeFileSync(join(f.cwd, "other.txt"), "unstaged\n");
		const staged = git(f, "show", ":other.txt");
		await f.start();
		await ready(f);
		expect(f.run().reason).toContain("created locally");
		expect(f.run().status).toBe("succeeded");
		expect(git(f, "show", ":other.txt")).toBe(staged);
		expect(readFileSync(join(f.cwd, "other.txt"), "utf8")).toBe("unstaged\n");
		expect(git(f, "show", "HEAD:other.txt")).toBe("base");
	});
	test("new files use a private index without staging unrelated untracked files", async () => {
		const f = await fixture();
		writeFileSync(join(f.cwd, "user.txt"), "untracked user work\n");
		await f.start();
		edit(f, "added file.txt", "task-owned\n");
		await ready(f);
		expect(f.run().reason).toContain("created locally");
		expect(f.run().status).toBe("succeeded");
		expect(git(f, "show", "HEAD:added file.txt")).toBe("task-owned");
		expect(git(f, "status", "--porcelain")).toContain("?? user.txt");
	});
	test("pre-existing edits in the same file block commit instead of guessing hunk ownership", async () => {
		const f = await fixture();
		writeFileSync(join(f.cwd, "value.txt"), "user-edit\n");
		const parent = git(f, "rev-parse", "HEAD");
		await f.start();
		await ready(f);
		expect(f.run().status).toBe("blocked");
		expect(f.run().reason).toContain("pre-existing");
		expect(git(f, "rev-parse", "HEAD")).toBe(parent);
	});
	test("external edits to initially clean files cannot sneak into task commits", async () => {
		const f = await fixture();
		await f.start();
		writeFileSync(join(f.cwd, "outsider.txt"), "not the agent\n");
		await ready(f);
		expect(f.run().status).toBe("blocked");
		expect(f.run().reason).toContain("Unattributed");
		expect(f.store.operations(f.runId)).toHaveLength(0);
	});
	test("external changes between two native writes break the attribution chain", async () => {
		const f = await fixture();
		await f.start();
		edit(f, "value.txt", "first\n");
		writeFileSync(join(f.cwd, "value.txt"), "outsider\n");
		await ready(f);
		expect(f.run().status).toBe("blocked");
		expect(f.run().reason).toContain("attribution chain");
	});
	test("existing commit hooks are honored; retry only delivery after fixing a rejected hook", async () => {
		const f = await fixture();
		const hook = join(f.cwd, ".git/hooks/pre-commit");
		writeFileSync(hook, "#!/bin/sh\nexit 1\n");
		chmodSync(hook, 0o755);
		await f.start();
		await ready(f);
		expect(f.run().status).toBe("blocked");
		expect(f.store.operations(f.runId)[0]?.status).toBe("failed");
		writeFileSync(hook, "#!/bin/sh\nexit 0\n");
		await f.runner.retryDelivery(f.runId);
		await complete(f);
		expect(f.run().status).toBe("succeeded");
		expect(f.driver.submissions).toHaveLength(1);
	});
	test("hooks cannot silently substitute an unverified tree and then push it", async () => {
		const f = await fixture("push");
		const parent = git(f, "rev-parse", "HEAD");
		const hook = join(f.cwd, ".git/hooks/pre-commit");
		writeFileSync(
			hook,
			"#!/bin/sh\necho hook-change > value.txt\ngit add value.txt\n",
		);
		chmodSync(hook, 0o755);
		await f.start();
		await ready(f);
		expect(f.run().status).toBe("blocked");
		expect(f.store.operations(f.runId)[0]?.status).toBe("unknown");
		expect(
			git(
				f,
				"ls-remote",
				"task-remote",
				`refs/heads/${git(f, "branch", "--show-current")}`,
			),
		).toContain(parent);
	});
	test("remote-behind state refuses to push unrelated existing local commits", async () => {
		const f = await fixture("push");
		writeFileSync(join(f.cwd, "prior.txt"), "prior\n");
		git(f, "add", "prior.txt");
		git(f, "commit", "-qm", "unrelated prior work");
		await f.start();
		await ready(f);
		expect(f.run().status).toBe("blocked");
		expect(f.run().reason).toContain("unrelated local commits");
		expect(f.store.operations(f.runId)).toHaveLength(0);
	});
	test("remote URL changed after user selection is not treated as authorized", async () => {
		const f = await fixture("push");
		git(
			f,
			"remote",
			"set-url",
			"--push",
			"task-remote",
			join(f.directory, "elsewhere.git"),
		);
		await f.start();
		await ready(f);
		expect(f.run().status).toBe("blocked");
		expect(f.run().reason).toContain("remote changed");
	});
	test("manual acceptance is required before Git side effects in review mode", async () => {
		const f = await fixture("commit", true);
		const parent = git(f, "rev-parse", "HEAD");
		await f.start();
		await ready(f);
		expect(f.run().status).toBe("awaiting_review");
		expect(git(f, "rev-parse", "HEAD")).toBe(parent);
		await f.runner.accept(f.runId);
		await complete(f);
		expect(f.run().status).toBe("succeeded");
		expect(f.run().completionSource).toBe("user");
	});
	test("revocation before acceptance preserves edits-only completion and no Git effects", async () => {
		const f = await fixture();
		const parent = git(f, "rev-parse", "HEAD");
		await f.start();
		f.runner.revokeDelivery(f.runId);
		await ready(f);
		expect(f.run().status).toBe("succeeded");
		expect(git(f, "rev-parse", "HEAD")).toBe(parent);
		expect(f.store.operations(f.runId)).toHaveLength(0);
	});
	test("a lost commit confirmation is reconciled without creating another commit", async () => {
		const f = await fixture();
		await f.start();
		await ready(f);
		expect(f.run().status).toBe("succeeded");
		const op = f.store.operations(f.runId)[0];
		if (!op) throw new Error("no operation");
		f.db
			.update(taskOperations)
			.set({ status: "submitted", pid: null, commitOid: null })
			.where(eq(taskOperations.id, op.id))
			.run();
		await f.delivery.reconcile(f.run());
		expect(f.store.operations(f.runId)[0]?.status).toBe("confirmed");
		expect(op.commitOid).not.toBeNull();
		expect(git(f, "rev-parse", "HEAD")).toBe(op.commitOid as string);
	});
	test("a lost push confirmation checks the remote without a second push", async () => {
		const f = await fixture("push");
		await f.start();
		await ready(f);
		const op = f.store.operations(f.runId).find((item) => item.kind === "push");
		if (!op) throw new Error(f.run().reason || "missing push");
		f.db
			.update(taskOperations)
			.set({ status: "unknown", pid: null })
			.where(eq(taskOperations.id, op.id))
			.run();
		await f.delivery.reconcile(f.run());
		expect(
			f.store.operations(f.runId).find((item) => item.kind === "push")?.status,
		).toBe("confirmed");
	});
	test("push refuses verification inputs that include unrelated pre-existing dirty work", async () => {
		const f = await fixture("push");
		writeFileSync(
			join(f.cwd, "uncommitted-dependency.txt"),
			"not in the remote tree\n",
		);
		await f.start();
		await ready(f);
		expect(f.run().status).toBe("blocked");
		expect(f.run().reason).toContain("clean initial working tree");
		expect(f.store.operations(f.runId)).toHaveLength(0);
	});
	test("an unrelated index lock is neither removed nor overwritten", async () => {
		const f = await fixture();
		await f.start();
		writeFileSync(join(f.cwd, ".git/index.lock"), "another writer");
		await ready(f);
		expect(f.run().status).toBe("blocked");
		expect(readFileSync(join(f.cwd, ".git/index.lock"), "utf8")).toBe(
			"another writer",
		);
		expect(f.store.operations(f.runId)[0]?.leaseKey).toBeNull();
	});
	test("cancel between prepared intent and command dispatch releases only owned resources", async () => {
		const f = await fixture();
		const original = f.delivery.prepare.bind(f.delivery);
		f.delivery.prepare = async (run) => {
			const op = await original(run);
			f.runner.requestStop(run.id, "cancelled");
			return op;
		};
		const parent = git(f, "rev-parse", "HEAD");
		await f.start();
		await ready(f);
		await complete(f);
		expect(f.run().status).toBe("cancelled");
		expect(f.run().leasePath).toBeNull();
		expect(git(f, "rev-parse", "HEAD")).toBe(parent);
		expect(existsSync(join(f.cwd, ".git/index.lock"))).toBe(false);
	});
	test("cancel during a real Git hook stops the owned process and prevents push", async () => {
		const f = await fixture("push");
		const parent = git(f, "rev-parse", "HEAD"),
			hook = join(f.cwd, ".git/hooks/pre-commit");
		writeFileSync(hook, "#!/bin/sh\ntouch .git/hook-started\nsleep 30\n");
		chmodSync(hook, 0o755);
		await f.start();
		edit(f, "value.txt", "right\n");
		await f.ready();
		void f.runner.tick();
		await eventually(
			() => existsSync(join(f.cwd, ".git/hook-started")),
			async () => {
				void f.runner.tick();
			},
			10000,
		);
		f.runner.requestStop(f.runId, "cancelled");
		await complete(f);
		expect(f.run().status).toBe("cancelled");
		expect(git(f, "rev-parse", "HEAD")).toBe(parent);
		expect(
			f.store.operations(f.runId).find((op) => op.kind === "push"),
		).toBeUndefined();
		expect(existsSync(join(f.cwd, ".git/index.lock"))).toBe(false);
	}, 20000);
	test("revoking after local commit retains the commit but never dispatches push", async () => {
		const f = await fixture("push");
		const parent = git(f, "rev-parse", "HEAD"),
			original = f.delivery.commit.bind(f.delivery);
		f.delivery.commit = async (run, op, signal) => {
			const result = await original(run, op, signal);
			if (result.status === "confirmed") f.runner.revokeDelivery(run.id);
			return result;
		};
		await f.start();
		await ready(f);
		await complete(f);
		expect(f.run().status).toBe("paused");
		expect(f.store.operations(f.runId)[0]?.status).toBe("confirmed");
		expect(git(f, "rev-parse", "HEAD")).not.toBe(parent);
		expect(
			git(
				f,
				"ls-remote",
				"task-remote",
				`refs/heads/${git(f, "branch", "--show-current")}`,
			),
		).toContain(parent);
	});
	test("push rejection retries only push, without another commit or Agent run", async () => {
		const f = await fixture("push"),
			hook = join(f.directory, "remote.git/hooks/pre-receive");
		writeFileSync(hook, "#!/bin/sh\nexit 1\n");
		chmodSync(hook, 0o755);
		await f.start();
		await ready(f);
		expect(f.run().status).toBe("blocked");
		const head = git(f, "rev-parse", "HEAD");
		expect(
			f.store.operations(f.runId).find((op) => op.kind === "push")?.status,
		).toBe("failed");
		writeFileSync(hook, "#!/bin/sh\nexit 0\n");
		await f.runner.retryDelivery(f.runId);
		await complete(f);
		expect(f.run().status).toBe("succeeded");
		expect(git(f, "rev-parse", "HEAD")).toBe(head);
		expect(f.driver.submissions).toHaveLength(1);
	});
	test("crash after commit but before real-index replacement reconciles from the planned index", async () => {
		const f = await fixture();
		await f.start();
		await ready(f);
		const op = f.store.operations(f.runId)[0];
		if (!op) throw new Error("missing operation");
		copyFileSync(join(op.plan.tempDir, "original-index"), op.plan.indexPath);
		f.db
			.update(taskOperations)
			.set({ status: "submitted", pid: null, commitOid: null })
			.where(eq(taskOperations.id, op.id))
			.run();
		await f.delivery.reconcile(f.run());
		expect(f.store.operations(f.runId)[0]?.status).toBe("confirmed");
		expect(git(f, "status", "--porcelain")).toBe("");
	});
	test("Git filters that change publishable bytes cannot silently inherit workspace verification", async () => {
		const f = await fixture("push");
		git(f, "config", "filter.change.clean", "sed s/right/transformed/g");
		git(f, "config", "filter.change.smudge", "cat");
		writeFileSync(
			join(f.cwd, ".git/info/attributes"),
			"value.txt filter=change\n",
		);
		await f.start();
		await ready(f);
		expect(f.run().status).toBe("blocked");
		expect(f.run().reason).toContain("filters/normalization");
	});
	test("a branch switch during a commit hook leaves an explicit unknown result, never a push", async () => {
		const f = await fixture("push"),
			parent = git(f, "rev-parse", "HEAD"),
			branch = git(f, "branch", "--show-current");
		git(f, "branch", "other-window");
		const hook = join(f.cwd, ".git/hooks/pre-commit");
		writeFileSync(
			hook,
			"#!/bin/sh\ngit symbolic-ref HEAD refs/heads/other-window\n",
		);
		chmodSync(hook, 0o755);
		await f.start();
		await ready(f);
		expect(f.run().status).toBe("blocked");
		expect(f.store.operations(f.runId)[0]?.status).toBe("unknown");
		expect(f.run().reason).toContain("branch changed");
		expect(
			git(f, "ls-remote", "task-remote", `refs/heads/${branch}`),
		).toContain(parent);
	});
});

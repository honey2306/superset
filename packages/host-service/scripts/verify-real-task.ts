/** Explicit manual smoke: same configured Pi provider, synthetic repositories only.
 * NEVER imported by unit tests; no credential values or model config are logged. */
import "../test/setup-env";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { taskContractSchema } from "@superset/shared/tasks";
import { createTaskTransportFixture } from "../src/tasks/task-transport-fixture";

if (process.env.SUPERSET_TASK_REAL_MODEL !== "1")
	throw new Error(
		"Set SUPERSET_TASK_REAL_MODEL=1 to authorize use of the currently configured Pi provider",
	);
const source = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi/agent");
const settings = JSON.parse(
	readFileSync(join(source, "settings.json"), "utf8"),
) as { defaultProvider: string; defaultModel: string };
const config = JSON.parse(
	readFileSync(join(source, "models.json"), "utf8"),
) as {
	providers: Record<
		string,
		{ models?: Array<{ id: string }>; apiKey?: string }
	>;
};
const provider = config.providers[settings.defaultProvider];
if (!provider)
	throw new Error(
		"Default Pi provider has no local configuration; no fallback to another provider is allowed",
	);
const selected = provider.models?.find(
	(model) => model.id === settings.defaultModel,
);
if (!selected)
	throw new Error("Configured default model is not defined locally");
if (!provider.apiKey || provider.apiKey.startsWith("!"))
	throw new Error(
		"This smoke requires a configured key or environment-key reference, not a credential command",
	);
const providerConfig = {
	...provider,
	models: [selected],
	apiKey: process.env[provider.apiKey] ?? provider.apiKey,
};
const fixture = await createTaskTransportFixture({
	realModel: {
		provider: settings.defaultProvider,
		modelId: settings.defaultModel,
		providerConfig,
	},
});
const artifacts = resolve(import.meta.dir, `../.cache/real-task-${Date.now()}`);
mkdirSync(artifacts, { recursive: true });
const results: Array<Record<string, unknown>> = [];
const git = (...args: string[]) =>
	execFileSync("git", args, { cwd: fixture.cwd, encoding: "utf8" }).trim();
let activeTask: string | undefined;
const started = Date.now();
async function waitForTask(id: string, timeout = 150000) {
	const deadline = Date.now() + timeout;
	for (;;) {
		const detail = await fixture.api.tasks.get.query({ id });
		if (
			detail.run &&
			[
				"succeeded",
				"failed",
				"blocked",
				"awaiting_review",
				"cancelled",
			].includes(detail.run.status)
		)
			return detail;
		if (Date.now() > deadline) {
			if (detail.run)
				await fixture.api.tasks.cancel.mutate({ runId: detail.run.id });
			throw new Error(
				"Real-model task exceeded the verification budget; stop requested",
			);
		}
		await new Promise((done) => setTimeout(done, 400));
	}
}
try {
	git("config", "user.name", "Superset Task Validation");
	git("config", "user.email", "task-validation@example.invalid");
	git("config", "commit.gpgsign", "false");
	writeFileSync(join(fixture.cwd, "label.txt"), "Start running\n");
	writeFileSync(
		join(fixture.cwd, "calc.cjs"),
		"exports.mean = values => values.reduce((a,b)=>a+b,0) / (values.length + 1);\n",
	);
	writeFileSync(
		join(fixture.cwd, "calc.test.cjs"),
		"const a=require('node:assert/strict');const {mean}=require('./calc.cjs');a.equal(mean([2,4]),3);a.equal(mean([0]),0);a.equal(mean([-2,2]),0);a.equal(mean([]),null);\n",
	);
	git("add", "label.txt", "calc.cjs", "calc.test.cjs");
	git("commit", "-qm", "test: add synthetic acceptance scenarios");
	const branch = git("branch", "--show-current"),
		remote = join(fixture.directory, "remote.git");
	git("init", "--bare", "-q", remote);
	git("remote", "add", "validation", remote);
	git("push", "-q", "validation", `HEAD:refs/heads/${branch}`);
	const targets = await fixture.api.tasks.deliveryTargets.query({
		workspaceId: fixture.workspaceId,
	});
	const target = targets.remotes.find((item) => item.remote === "validation");
	if (!target) throw new Error("Local validation remote unavailable");
	const model = `${settings.defaultProvider}/${settings.defaultModel}`;
	const cases = [
		{
			goal: 'Change label.txt from "Start running" to "Start execution". Preserve the trailing newline and all other files. This is a small task; make the edit directly using native edit/write.',
			check: 'test "$(cat label.txt)" = "Start execution"',
			name: "simple-label",
		},
		{
			goal: "Fix the bug in calc.cjs: mean(values) must return the arithmetic mean, and null for an empty array. Preserve calc.test.cjs unchanged. Inspect/reproduce the issue and use native edit/write for modifications. The Host handles commit/push, do not run Git publishing.",
			check: "node calc.test.cjs",
			name: "bug-regression",
		},
	];
	for (const item of cases) {
		const start = Date.now();
		const id = crypto.randomUUID();
		activeTask = id;
		await fixture.api.tasks.create.mutate({
			id,
			projectId: fixture.projectId,
			workspaceId: fixture.workspaceId,
			contract: taskContractSchema.parse({
				goal: item.goal,
				model,
				checks: [{ name: item.name, command: item.check, timeoutMs: 10000 }],
				completion: "checks",
				maxRepairs: 2,
				timeoutMs: 150000,
				delivery: {
					mode: "push",
					branch,
					message: `fix(validation): ${item.name}`,
					remote: "validation",
					remoteBranch: branch,
					targetHash: target.targetHash,
				},
			}),
		});
		const detail = await waitForTask(id);
		const run = detail.run;
		const record = {
			scenario: item.name,
			status: run?.status,
			phase: run?.phase,
			elapsedMs: Date.now() - start,
			repairCount: run?.repairCount,
			checks: detail.checks.map(({ status, exitCode }) => ({
				status,
				exitCode,
			})),
			operations: detail.operations.map(({ kind, status, commitOid }) => ({
				kind,
				status,
				commitOid,
			})),
			observedEdits: run ? fixture.store.edits(run.id).length : 0,
			reason: run?.reason,
		};
		results.push(record);
		console.log(JSON.stringify(record));
		if (run?.status !== "succeeded")
			throw new Error(
				`Scenario ${item.name} did not reach verified delivery; inspect the redacted report`,
			);
		if (git("status", "--porcelain"))
			throw new Error("Unexpected residual changes after delivery");
	}
	// Verify active cancellation against the actual provider, without asking for destructive work.
	fixture.setDelay(0);
	const cancelId = crypto.randomUUID();
	activeTask = cancelId;
	const created = await fixture.api.tasks.create.mutate({
		id: cancelId,
		projectId: fixture.projectId,
		contract: taskContractSchema.parse({
			goal: "Use bash to sleep 20 seconds before inspecting label.txt. Do not change files. This task exercises cancellation.",
			model,
			timeoutMs: 60000,
		}),
	});
	if (!created.run) throw new Error("Missing cancellation run");
	const until = Date.now() + 30000;
	let running = false;
	while (Date.now() < until) {
		const detail = await fixture.api.tasks.get.query({ id: cancelId });
		if (detail.run?.phase === "executing") {
			try {
				running =
					(await fixture.daemon.get(detail.run.sessionId)).status === "running";
			} catch {}
			if (running) break;
		}
		await new Promise((done) => setTimeout(done, 200));
	}
	const cancelStart = Date.now();
	await fixture.api.tasks.cancel.mutate({ runId: created.run.id });
	const stopped = await waitForTask(cancelId, 30000);
	results.push({
		scenario: "real-provider-cancellation",
		observedRunning: running,
		status: stopped.run?.status,
		elapsedMs: Date.now() - cancelStart,
	});
	if (!running || stopped.run?.status !== "cancelled")
		throw new Error("Cancellation was not confirmed from active execution");
	console.log(
		JSON.stringify({
			passed: true,
			provider: settings.defaultProvider,
			model: settings.defaultModel,
			elapsedMs: Date.now() - started,
			artifacts,
		}),
	);
} catch (error) {
	console.error(
		"Real-model verification did not fully pass:",
		error instanceof Error ? error.message : "unknown failure",
	);
	process.exitCode = 1;
} finally {
	writeFileSync(
		join(artifacts, "report.json"),
		JSON.stringify(
			{
				provider: settings.defaultProvider,
				model: settings.defaultModel,
				results,
			},
			null,
			2,
		),
		{ mode: 0o600 },
	);
	if (activeTask)
		try {
			const detail = await fixture.api.tasks.get.query({ id: activeTask });
			if (
				detail.run &&
				!["succeeded", "cancelled", "failed"].includes(detail.run.status)
			)
				await fixture.api.tasks.cancel.mutate({ runId: detail.run.id });
		} catch {}
	await fixture.close();
	console.log(
		"Isolated repositories, configuration copies and owned execution processes cleaned up.",
	);
}

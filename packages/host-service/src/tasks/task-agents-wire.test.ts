import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ACP_AGENT_OPTIONS } from "@superset/shared/agent-catalog";
import { AcpSessionManager } from "../runtime/acp-sessions/acp-sessions";

/** Actual manager and child-process ACP boundary for all catalog identities.
 * Adapter inference is deterministic, not a real-provider certification. */
describe("registered ACP runtimes adopt and release Task mode over stdio", () => {
	for (const agent of ACP_AGENT_OPTIONS) {
		test(`${agent.label}: same conversation, protected ownership, cancellation and release`, async () => {
			const cwd = mkdtempSync(join(tmpdir(), "superset-task-agents-"));
			const adapter = resolve(
				import.meta.dir,
				"../../test/fixtures/fake-acp-adapter.ts",
			);
			const executable = join(cwd, "adapter.sh");
			writeFileSync(
				executable,
				`#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' '${adapter.replaceAll("'", "'\\''")}' "$@"\n`,
			);
			chmodSync(executable, 0o700);
			let owner: { id: string; status: string } | undefined;
			const manager = new AcpSessionManager({
				resolveWorkspaceCwd: () => cwd,
				adapterEntry: adapter,
				codexAdapterEntry: adapter,
				piAdapterEntry: adapter,
				adapterExecPath: process.execPath,
				myflickerAdapterCommand: executable,
				deepseekAdapterCommand: executable,
				adapterEnv: {
					HOME: cwd,
					FAKE_ACP_MCP_REQUEST_LOG: join(cwd, "mcp-setup.jsonl"),
				},
				taskOwner: () => owner,
				idleHibernateMs: null,
				startupTimeoutMs: 10000,
			});
			const sessionId = crypto.randomUUID(),
				workspaceId = crypto.randomUUID(),
				runId = crypto.randomUUID();
			try {
				await manager.create({
					sessionId,
					workspaceId,
					harness: agent.harness,
				});
				await manager.prompt({
					sessionId,
					prompt: [{ type: "text", text: "say prior-context" }],
				}).turn;
				const before = manager.getTranscript({ sessionId });
				const inspected = await manager.setTaskMode({
					sessionId,
					mode: "inspect",
				});
				expect(inspected.harness).toBe(agent.harness);
				owner = { id: runId, status: "running" };
				const claimed = await manager.setTaskMode({
					sessionId,
					mode: "claim",
					runId,
				});
				expect(claimed.sessionId).toBe(sessionId);
				expect(manager.getRole(sessionId)).toBe("task-executor");
				expect(() =>
					manager.prompt({
						sessionId,
						prompt: [{ type: "text", text: "bypass managed task" }],
					}),
				).toThrow("controlled by a Task");
				await manager.prompt({
					sessionId,
					commandId: `${runId}:0`,
					prompt: [{ type: "text", text: "say managed-progress" }],
				}).turn;
				expect(manager.getTranscript({ sessionId }).totalTurns).toBe(
					before.totalTurns + 1,
				);
				const hanging = manager.prompt({
					sessionId,
					commandId: `${runId}:1`,
					prompt: [{ type: "text", text: "hang" }],
				}).turn;
				await new Promise((done) => setTimeout(done, 50));
				await expect(
					manager.setTaskMode({ sessionId, mode: "release", runId }),
				).rejects.toThrow("current conversation turn");
				await manager.cancel({ sessionId });
				await hanging;
				owner.status = "cancelled";
				await manager.setTaskMode({ sessionId, mode: "release", runId });
				owner = undefined;
				expect(manager.getRole(sessionId)).toBe("root-coordinator");
				await manager.prompt({
					sessionId,
					prompt: [{ type: "text", text: "say back-to-chat" }],
				}).turn;
				expect(manager.list({ workspaceId }).items).toHaveLength(1);
				expect(JSON.stringify(manager.getTranscript({ sessionId }))).toContain(
					"prior-context",
				);
			} finally {
				await manager.dispose();
				rmSync(cwd, { recursive: true, force: true });
			}
		}, 20000);
	}
});

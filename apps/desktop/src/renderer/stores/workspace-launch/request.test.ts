import { describe, expect, test } from "bun:test";
import { toProvisionWorkspaceRequest } from "./request";

describe("toProvisionWorkspaceRequest", () => {
	test("maps a generated branch request without creating a local identity row", () => {
		const request = toProvisionWorkspaceRequest({
			id: "request-1",
			projectId: "project-1",
			prompt: "Fix the flaky test",
		});

		expect(request).toEqual({
			idempotencyKey: "workspace-create:request-1",
			project: { kind: "existing", projectId: "project-1" },
			source: {
				kind: "branch",
				name: { kind: "generated", prompt: "Fix the flaky test" },
				from: { kind: "default" },
			},
			display: {},
		});
	});

	test("maps a worktree and initial agent/command sessions", () => {
		const request = toProvisionWorkspaceRequest({
			id: "request-2",
			projectId: "project-2",
			name: "Existing worktree",
			branch: "feature/existing",
			worktreePath: "/tmp/project-worktree",
			agents: [{ agent: "claude", prompt: "Inspect this branch" }],
			command: "bun test",
		});

		expect(request.source).toEqual({
			kind: "worktree",
			path: "/tmp/project-worktree",
			expectedBranch: "feature/existing",
		});
		expect(request.initialSessions).toEqual([
			{
				key: "agent:0:claude",
				kind: "agent",
				agent: "claude",
				prompt: "Inspect this branch",
				requirement: "best-effort",
			},
			{
				key: "command",
				kind: "command",
				command: "bun test",
				requirement: "best-effort",
			},
		]);
	});
});

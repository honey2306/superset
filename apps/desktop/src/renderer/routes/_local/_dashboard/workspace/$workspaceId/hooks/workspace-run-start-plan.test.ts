import { describe, expect, test } from "bun:test";
import { createWorkspaceRunStartPlan } from "./workspace-run-start-plan";

describe("workspace run start plan", () => {
	test("hands a new pane its command as initial data", () => {
		expect(
			createWorkspaceRunStartPlan({
				command: "bun run dev",
				initialCwd: "/repo",
			}),
		).toEqual({
			kind: "new-pane",
			initialCommand: "bun run dev",
			initialCwd: "/repo",
		});
	});

	test("writes the next command to a shell stopped by the user", () => {
		expect(
			createWorkspaceRunStartPlan({
				command: "bun run dev",
				existingPane: { paneId: "pane-1", state: "stopped-by-user" },
			}),
		).toEqual({
			kind: "write-existing",
			paneId: "pane-1",
			data: "bun run dev\n",
		});
	});

	test("does not reuse an exited session or queue a second initial command", () => {
		expect(
			createWorkspaceRunStartPlan({
				command: "bun run dev",
				initialCwd: "/repo",
				existingPane: { paneId: "exited-pane", state: "stopped-by-exit" },
			}),
		).toEqual({
			kind: "new-pane",
			initialCommand: "bun run dev",
			initialCwd: "/repo",
		});
	});
});

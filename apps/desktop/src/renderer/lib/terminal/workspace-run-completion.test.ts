import { describe, expect, test } from "bun:test";
import {
	buildTrackedWorkspaceRunCommand,
	createWorkspaceRunCompletionScanner,
	createWorkspaceRunCompletionWatch,
} from "./workspace-run-completion";

const encoder = new TextEncoder();

describe("workspace run completion", () => {
	test("wraps the run command with an invisible completion marker", () => {
		expect(buildTrackedWorkspaceRunCommand("./run.sh", "run-123")).toBe(
			`{ ./run.sh; }; __superset_workspace_run_exit=$?; printf '\\033]777;superset-workspace-run-complete;run-123;%s\\007' "$__superset_workspace_run_exit"`,
		);
	});

	test("detects a completion marker split across terminal output chunks", () => {
		const scanner = createWorkspaceRunCompletionScanner("run-123");

		expect(
			scanner.push(encoder.encode("service output\n\u001b]777;super")),
		).toBeNull();
		expect(
			scanner.push(
				encoder.encode("set-workspace-run-complete;run-123;3\u0007prompt"),
			),
		).toBe(3);
	});

	test("keeps watching unrelated output and ignores another run marker", () => {
		const scanner = createWorkspaceRunCompletionScanner("current");

		expect(
			scanner.push(
				encoder.encode(
					"\u001b]777;superset-workspace-run-complete;stale;0\u0007",
				),
			),
		).toBeNull();
		expect(
			scanner.push(
				encoder.encode(
					"\u001b]777;superset-workspace-run-complete;current;0\u0007",
				),
			),
		).toBe(0);
	});

	test("completion watch survives until the marker and then unsubscribes", () => {
		const listeners: {
			data?: (data: Uint8Array) => void;
			exit?: () => void;
		} = {};
		let dataUnsubscribed = 0;
		let exitUnsubscribed = 0;
		const completions: number[] = [];

		createWorkspaceRunCompletionWatch({
			marker: "run-123",
			onComplete: (exitCode) => completions.push(exitCode),
			subscribeData: (listener) => {
				listeners.data = listener;
				return () => {
					dataUnsubscribed += 1;
				};
			},
			subscribeExit: (listener) => {
				listeners.exit = listener;
				return () => {
					exitUnsubscribed += 1;
				};
			},
		});

		listeners.data?.(encoder.encode("ordinary output"));
		expect(completions).toEqual([]);
		listeners.data?.(
			encoder.encode(
				"\u001b]777;superset-workspace-run-complete;run-123;3\u0007",
			),
		);
		expect(completions).toEqual([3]);
		expect(dataUnsubscribed).toBe(1);
		expect(exitUnsubscribed).toBe(1);

		listeners.exit?.();
		expect(dataUnsubscribed).toBe(1);
		expect(exitUnsubscribed).toBe(1);
	});
});

import { spawn } from "node:child_process";
import type { TaskCheckSpec } from "@superset/shared/tasks";

export interface CheckResult {
	status: "passed" | "failed" | "cancelled";
	exitCode: number | null;
	output: string;
}
export function isProcessGroupAlive(pid: number): boolean {
	try {
		process.kill(process.platform === "win32" ? pid : -pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code !== "ESRCH";
	}
}

/** Non-interactive, task-owned check. Output is bounded; cancellation reaches
 * the local process group. Detached/remote grandchildren are outside this boundary. */
export function runTaskCheck(input: {
	check: TaskCheckSpec;
	cwd: string;
	signal: AbortSignal;
	onStart: (pid: number) => void;
}): Promise<CheckResult> {
	if (input.signal.aborted)
		return Promise.resolve({
			status: "cancelled",
			exitCode: null,
			output: "Cancelled before start",
		});
	if (process.platform === "win32")
		return Promise.reject(
			new Error("Task check execution currently supports macOS/Linux only"),
		);
	return new Promise((resolve, reject) => {
		const child = spawn(
			"/bin/bash",
			["-o", "pipefail", "-c", input.check.command],
			{
				cwd: input.cwd,
				env: { ...process.env, CI: "1" },
				detached: true,
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		let output = "";
		let timedOut = false;
		let cancelled = false;
		let spawnError: Error | undefined;
		let killTimer: ReturnType<typeof setTimeout> | undefined;
		const append = (data: Buffer) => {
			output = (output + data.toString("utf8")).slice(-64 * 1024);
		};
		const killGroup = (signal: NodeJS.Signals) => {
			if (!child.pid) return;
			try {
				process.kill(-child.pid, signal);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ESRCH")
					append(
						Buffer.from(
							`\nCould not signal check process group: ${String(error)}\n`,
						),
					);
			}
		};
		const stop = () => {
			killGroup("SIGTERM");
			killTimer ??= setTimeout(() => killGroup("SIGKILL"), 750);
		};
		const abort = () => {
			cancelled = true;
			stop();
		};
		input.signal.addEventListener("abort", abort, { once: true });
		const timeout = setTimeout(() => {
			timedOut = true;
			stop();
		}, input.check.timeoutMs);
		child.stdout.on("data", append);
		child.stderr.on("data", append);
		child.on("spawn", () => {
			try {
				if (child.pid) input.onStart(child.pid);
			} catch (error) {
				spawnError = error instanceof Error ? error : new Error(String(error));
				stop();
			}
			if (input.signal.aborted) abort();
		});
		child.on("error", (error) => {
			spawnError = error;
		});
		child.on("close", (code) => {
			clearTimeout(timeout);
			if (killTimer) clearTimeout(killTimer);
			input.signal.removeEventListener("abort", abort);
			// Checks cannot intentionally leave a server behind after closing stdio.
			const leaked = child.pid ? isProcessGroupAlive(child.pid) : false;
			if (leaked) killGroup("SIGKILL");
			if (spawnError) {
				reject(spawnError);
				return;
			}
			if (timedOut) output += "\nCheck timed out.";
			if (leaked)
				output +=
					"\nCheck left background processes; terminated the group. This is not a passing check.";
			resolve({
				status: cancelled
					? "cancelled"
					: !timedOut && !leaked && code === 0
						? "passed"
						: "failed",
				exitCode: code,
				output,
			});
		});
	});
}

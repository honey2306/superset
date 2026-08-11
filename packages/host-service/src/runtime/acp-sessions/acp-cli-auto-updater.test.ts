import { describe, expect, test } from "bun:test";
import {
	AcpCliAutoUpdater,
	acpCliUpdateCommands,
	millisecondsUntilNextLocalHour,
} from "./acp-cli-auto-updater";

class FakeTimer {
	unrefCalled = false;

	unref(): void {
		this.unrefCalled = true;
	}
}

describe("millisecondsUntilNextLocalHour", () => {
	test("targets 02:00 later on the same local day", () => {
		const now = new Date(2026, 0, 15, 1, 30);
		expect(millisecondsUntilNextLocalHour(now)).toBe(30 * 60 * 1_000);
	});

	test("targets the next local day once 02:00 has arrived", () => {
		const now = new Date(2026, 0, 15, 2, 0);
		expect(millisecondsUntilNextLocalHour(now)).toBe(24 * 60 * 60 * 1_000);
	});
});

describe("AcpCliAutoUpdater", () => {
	test("uses resolved Claude Code and MyFlicker executables", () => {
		const commands = acpCliUpdateCommands({
			claude: "/opt/claude/bin/claude",
			mfcli: "/opt/myflicker/bin/mfcli",
		});
		expect(commands[0]).toEqual({
			name: "Claude Code",
			command: "/opt/claude/bin/claude",
			args: ["update"],
		});
		expect(commands[3]).toEqual({
			name: "MyFlicker",
			command: "/opt/myflicker/bin/mfcli",
			args: ["update"],
		});
	});

	test("runs the ACP CLI updates at 02:00 and schedules the following day", async () => {
		let now = new Date(2026, 0, 15, 1, 0);
		const callbacks: Array<() => void> = [];
		const delays: number[] = [];
		const calls: Array<{ command: string; args: string[] }> = [];
		const updater = new AcpCliAutoUpdater({
			commands: [
				{
					name: "MyFlicker",
					command: "/opt/myflicker/mfcli",
					args: ["update"],
				},
			],
			now: () => now,
			run: async (command, args) => {
				calls.push({ command, args });
				return { stdout: "Already up to date", stderr: "" };
			},
			setTimer: (callback, delayMs) => {
				callbacks.push(callback);
				delays.push(delayMs);
				return new FakeTimer();
			},
			clearTimer: () => {},
		});

		updater.start();
		expect(delays).toEqual([60 * 60 * 1_000]);

		now = new Date(2026, 0, 15, 2, 0);
		callbacks[0]?.();
		await new Promise<void>((resolve) => setTimeout(resolve, 0));

		expect(calls).toEqual([
			{ command: "/opt/myflicker/mfcli", args: ["update"] },
		]);
		expect(delays).toEqual([60 * 60 * 1_000, 24 * 60 * 60 * 1_000]);
	});

	test("defaults to self-only updates for each external ACP CLI", async () => {
		let callback: (() => void) | undefined;
		const calls: Array<{ command: string; args: string[] }> = [];
		const updater = new AcpCliAutoUpdater({
			run: async (command, args) => {
				calls.push({ command, args });
				return { stdout: "", stderr: "" };
			},
			setTimer: (scheduledCallback) => {
				callback = scheduledCallback;
				return new FakeTimer();
			},
			clearTimer: () => {},
		});

		updater.start();
		callback?.();
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		expect(calls).toEqual([
			{ command: "claude", args: ["update"] },
			{ command: "codex", args: ["update"] },
			{ command: "pi", args: ["update", "self"] },
			{ command: "mfcli", args: ["update"] },
		]);
		updater.dispose();
	});

	test("continues updating other CLIs when one command fails", async () => {
		let callback: (() => void) | undefined;
		const calls: string[] = [];
		const updater = new AcpCliAutoUpdater({
			commands: [
				{ name: "Codex", command: "codex", args: ["update"] },
				{ name: "Pi", command: "pi", args: ["update"] },
			],
			run: async (command) => {
				calls.push(command);
				if (command === "codex") throw new Error("offline");
				return { stdout: "updated", stderr: "" };
			},
			setTimer: (scheduledCallback) => {
				callback = scheduledCallback;
				return new FakeTimer();
			},
			clearTimer: () => {},
		});

		updater.start();
		callback?.();
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		expect(calls).toEqual(["codex", "pi"]);
		updater.dispose();
	});

	test("dispose cancels the scheduled update", () => {
		const timers: FakeTimer[] = [];
		const cleared: FakeTimer[] = [];
		const updater = new AcpCliAutoUpdater({
			setTimer: () => {
				const timer = new FakeTimer();
				timers.push(timer);
				return timer;
			},
			clearTimer: (timer) => cleared.push(timer as FakeTimer),
		});

		updater.start();
		expect(timers[0]?.unrefCalled).toBe(true);
		updater.dispose();
		expect(cleared).toEqual(timers);
	});
});

import { describe, expect, it, mock } from "bun:test";
import {
	buildTerminalCommand,
	normalizeTerminalCommand,
	writeCommandsInPane,
} from "./launch-command";

describe("normalizeTerminalCommand", () => {
	it("appends exactly one newline", () => {
		expect(normalizeTerminalCommand("echo hello")).toBe("echo hello\n");
		expect(normalizeTerminalCommand("echo hello\n")).toBe("echo hello\n");
	});
});

describe("buildTerminalCommand", () => {
	it("joins commands with shell separators", () => {
		expect(buildTerminalCommand(["echo one", "echo two"])).toBe(
			"echo one && echo two",
		);
	});

	it("returns null for empty commands", () => {
		expect(buildTerminalCommand([])).toBeNull();
		expect(buildTerminalCommand(null)).toBeNull();
		expect(buildTerminalCommand(undefined)).toBeNull();
	});
});

describe("writeCommandsInPane", () => {
	it("writes joined command with newline", async () => {
		const write = mock(async () => ({}));

		await writeCommandsInPane({
			paneId: "pane-1",
			commands: ["echo one", "echo two"],
			write,
		});

		expect(write).toHaveBeenCalledWith({
			paneId: "pane-1",
			data: "echo one && echo two\n",
			throwOnError: true,
		});
	});

	it("does not write when commands are empty", async () => {
		const write = mock(async () => ({}));

		await writeCommandsInPane({
			paneId: "pane-1",
			commands: [],
			write,
		});

		expect(write).not.toHaveBeenCalled();
	});
});

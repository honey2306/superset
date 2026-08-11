import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_UPDATE_HOUR = 2;
const UPDATE_TIMEOUT_MS = 10 * 60 * 1_000;

interface TimerHandle {
	unref(): unknown;
}

type CommandRunner = (
	command: string,
	args: string[],
	options: { timeout: number; windowsHide: boolean },
) => Promise<{ stdout: string; stderr: string }>;

export interface AcpCliUpdateCommand {
	name: string;
	command: string;
	args: string[];
}

export function acpCliUpdateCommands(
	commands: { claude?: string; mfcli?: string } = {},
): AcpCliUpdateCommand[] {
	return [
		{
			name: "Claude Code",
			command: commands.claude ?? "claude",
			args: ["update"],
		},
		{ name: "Codex", command: "codex", args: ["update"] },
		{ name: "Pi", command: "pi", args: ["update", "self"] },
		{
			name: "MyFlicker",
			command: commands.mfcli ?? "mfcli",
			args: ["update"],
		},
	];
}

export interface AcpCliAutoUpdaterOptions {
	commands?: AcpCliUpdateCommand[];
	now?: () => Date;
	run?: CommandRunner;
	setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
	clearTimer?: (timer: TimerHandle) => void;
	updateHour?: number;
}

/** Milliseconds until the next occurrence of a local wall-clock hour. */
export function millisecondsUntilNextLocalHour(
	now: Date,
	hour = DEFAULT_UPDATE_HOUR,
): number {
	const next = new Date(now);
	next.setHours(hour, 0, 0, 0);
	if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
	return next.getTime() - now.getTime();
}

/**
 * Runs self-update commands for the external ACP CLIs every day at 02:00 local
 * time. Existing ACP child processes keep running their loaded version; newly
 * started sessions pick up the updated executable.
 */
export class AcpCliAutoUpdater {
	private readonly commands: AcpCliUpdateCommand[];
	private readonly now: () => Date;
	private readonly run: CommandRunner;
	private readonly setTimer: (
		callback: () => void,
		delayMs: number,
	) => TimerHandle;
	private readonly clearTimer: (timer: TimerHandle) => void;
	private readonly updateHour: number;
	private timer: TimerHandle | null = null;
	private disposed = false;

	constructor(options: AcpCliAutoUpdaterOptions = {}) {
		this.commands = options.commands ?? acpCliUpdateCommands();
		this.now = options.now ?? (() => new Date());
		this.run = options.run ?? defaultCommandRunner;
		this.setTimer =
			options.setTimer ??
			((callback, delayMs) => setTimeout(callback, delayMs));
		this.clearTimer =
			options.clearTimer ?? ((timer) => clearTimeout(timer as NodeJS.Timeout));
		this.updateHour = options.updateHour ?? DEFAULT_UPDATE_HOUR;
	}

	start(): void {
		if (this.disposed || this.timer) return;
		this.scheduleNext();
	}

	dispose(): void {
		this.disposed = true;
		if (this.timer) this.clearTimer(this.timer);
		this.timer = null;
	}

	private scheduleNext(): void {
		if (this.disposed) return;
		const delayMs = millisecondsUntilNextLocalHour(this.now(), this.updateHour);
		this.timer = this.setTimer(() => {
			this.timer = null;
			void this.update().finally(() => this.scheduleNext());
		}, delayMs);
		this.timer.unref();
	}

	private async update(): Promise<void> {
		for (const update of this.commands) {
			try {
				const result = await this.run(update.command, update.args, {
					timeout: UPDATE_TIMEOUT_MS,
					windowsHide: true,
				});
				const output = (result.stdout || result.stderr).trim();
				console.error(
					`[acp-cli-auto-updater] ${update.name} update completed${output ? `: ${output}` : ""}`,
				);
			} catch (error) {
				console.error(
					`[acp-cli-auto-updater] ${update.name} update failed`,
					error,
				);
			}
		}
	}
}

async function defaultCommandRunner(
	command: string,
	args: string[],
	options: { timeout: number; windowsHide: boolean },
): Promise<{ stdout: string; stderr: string }> {
	const result = await execFileAsync(command, args, options);
	return { stdout: result.stdout, stderr: result.stderr };
}

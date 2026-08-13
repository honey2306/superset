export function normalizeTerminalCommand(command: string): string {
	return command.endsWith("\n") ? command : `${command}\n`;
}

interface TerminalWriteInput {
	paneId: string;
	data: string;
	throwOnError?: boolean;
}

interface WriteCommandInPaneOptions {
	paneId: string;
	command: string;
	write: (input: TerminalWriteInput) => Promise<unknown>;
	noExecute?: boolean;
}

interface WriteCommandsInPaneOptions {
	paneId: string;
	commands: string[] | null | undefined;
	write: (input: TerminalWriteInput) => Promise<unknown>;
}

export function buildTerminalCommand(
	commands: string[] | null | undefined,
): string | null {
	if (!Array.isArray(commands) || commands.length === 0) return null;
	return commands.join(" && ");
}

export async function writeCommandInPane({
	paneId,
	command,
	write,
	noExecute,
}: WriteCommandInPaneOptions): Promise<void> {
	const data = noExecute ? command : normalizeTerminalCommand(command);
	await write({
		paneId,
		data,
		throwOnError: true,
	});
}

export async function writeCommandsInPane({
	paneId,
	commands,
	write,
}: WriteCommandsInPaneOptions): Promise<void> {
	const command = buildTerminalCommand(commands);
	if (!command) return;
	await writeCommandInPane({ paneId, command, write });
}

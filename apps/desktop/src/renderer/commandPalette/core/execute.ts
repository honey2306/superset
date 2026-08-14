import { toast } from "@superset/ui/sonner";
import type { Command, CommandContext } from "./types";

export async function executeCommand(
	command: Command,
	context: CommandContext,
): Promise<void> {
	if (!command.run) return;
	try {
		await command.run(context);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		toast.error(`Command "${command.title}" failed: ${message}`);
	}
}

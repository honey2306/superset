#!/usr/bin/env bun

/**
 * `superset` — command-line control surface for the local Superset runtime.
 *
 * Local-only by design: it talks to the host-service the desktop app runs on
 * this machine. There is no login, no organization, and no network dependency.
 */

import { chatCommand } from "./commands/chat";
import { doctorCommand } from "./commands/doctor";
import {
	SESSION_VALUE_OPTIONS,
	sessionsApproveCommand,
	sessionsCancelCommand,
	sessionsCreateCommand,
	sessionsDenyCommand,
	sessionsGetCommand,
	sessionsListCommand,
	sessionsPermissionsCommand,
	sessionsQueueCommand,
	sessionsSendCommand,
	sessionsTranscriptCommand,
} from "./commands/sessions";
import { statusCommand } from "./commands/status";
import {
	projectsListCommand,
	WORKSPACE_VALUE_OPTIONS,
	workspacesGetCommand,
	workspacesListCommand,
} from "./commands/workspaces";
import { parseArgs } from "./lib/args";
import { createContext } from "./lib/context";
import { CliError, EXIT_CODES, usageError } from "./lib/exit-codes";
import { Output } from "./lib/output";
import { CLI_VERSION } from "./lib/version";

/** Options that consume the following argument as their value. */
const VALUE_OPTIONS = new Set<string>([
	...SESSION_VALUE_OPTIONS,
	...WORKSPACE_VALUE_OPTIONS,
	"w",
	"scope",
]);

const HELP = `superset — local Superset runtime control

Usage
  superset <command> [subcommand] [options]

Commands
  (none, on a terminal)            Enter the interactive chat loop
  chat                              Enter the interactive chat loop explicitly
  status                            Show host-service, workspace, session summary
  doctor                            Diagnose connectivity to the local runtime
  projects list                     List projects
  workspaces list                   List workspaces (● marks the current one)
  workspaces get [workspace]        Show one workspace, git status included
  sessions list                     List conversations
  sessions get <session>            Show one conversation's state
  sessions create                   Start a new conversation
  sessions transcript <session>     Read conversation history
  sessions send <session> [text]    Continue a conversation
  sessions permissions <session>    Show pending permission requests
  sessions approve <session>        Approve a pending request
  sessions deny <session>           Deny a pending request
  sessions queue <session>          Inspect or edit queued prompts
  sessions cancel <session>         Interrupt the running turn
  version                           Print the CLI version

Most commands accept a workspace by id prefix, name, or the current directory.

Create options
  --workspace <id|name>     Target workspace (defaults to the current directory)
  --agent <name>            claude, codex, pi, myflicker, deepseek
  --model <id>              Preferred model id

Send options
  --follow                  Stream the reply until the turn finishes
  --wait                    Wait for the turn without streaming output
  --now                     Interrupt the current turn instead of queueing
  --queue                   Always queue, even when the session is idle
  --timeout <duration>      Give up waiting after e.g. 30s, 5m
  --stdin                   Read the message from stdin

Global options
  --json                    Emit a machine-readable JSON document
  --jsonl                   Emit newline-delimited JSON (streaming)
  --quiet                   Suppress non-essential output
  --no-color                Disable ANSI styling
  --help                    Show this help

Exit codes
  0 ok   1 failure   2 usage   3 not found
  4 host unavailable   5 timeout   6 conflict   7 rejected
`;

async function dispatch(argv: readonly string[]): Promise<number> {
	const args = parseArgs(argv, VALUE_OPTIONS);
	const ctx = createContext(args);

	const [command, subcommand] = args.positionals;

	if (!command || args.options.has("help")) {
		if (!command && process.stdin.isTTY && !ctx.out.isMachineReadable) {
			// Bare `superset` on a terminal: the interactive chat loop.
			return await chatCommand(ctx);
		}
		process.stdout.write(HELP);
		return EXIT_CODES.OK;
	}

	switch (command) {
		case "chat":
			return await chatCommand(ctx);

		case "version":
			if (ctx.out.isMachineReadable) ctx.out.json({ version: CLI_VERSION });
			else ctx.out.result(CLI_VERSION);
			return EXIT_CODES.OK;

		case "doctor":
			return await doctorCommand(ctx);

		case "status":
			await statusCommand(ctx);
			return EXIT_CODES.OK;

		case "projects":
			switch (subcommand) {
				case undefined:
				case "list":
					await projectsListCommand(ctx);
					return EXIT_CODES.OK;
				default:
					throw usageError(
						`Unknown subcommand: projects ${subcommand}`,
						"Try: superset projects list",
					);
			}

		case "workspaces":
		case "ws":
			switch (subcommand) {
				case undefined:
				case "list":
					await workspacesListCommand(ctx);
					return EXIT_CODES.OK;
				case "get":
					await workspacesGetCommand(ctx);
					return EXIT_CODES.OK;
				default:
					throw usageError(
						`Unknown subcommand: workspaces ${subcommand}`,
						"Try: superset workspaces list",
					);
			}

		case "sessions":
			switch (subcommand) {
				case undefined:
				case "list":
					await sessionsListCommand(ctx);
					return EXIT_CODES.OK;
				case "get":
					await sessionsGetCommand(ctx);
					return EXIT_CODES.OK;
				case "create":
					await sessionsCreateCommand(ctx);
					return EXIT_CODES.OK;
				case "transcript":
					await sessionsTranscriptCommand(ctx);
					return EXIT_CODES.OK;
				case "permissions":
					await sessionsPermissionsCommand(ctx);
					return EXIT_CODES.OK;
				case "approve":
					await sessionsApproveCommand(ctx);
					return EXIT_CODES.OK;
				case "deny":
					await sessionsDenyCommand(ctx);
					return EXIT_CODES.OK;
				case "queue":
					await sessionsQueueCommand(ctx);
					return EXIT_CODES.OK;
				case "cancel":
					await sessionsCancelCommand(ctx);
					return EXIT_CODES.OK;
				case "send":
					// `send` decides its own exit code: a turn can end in a pending
					// permission or a rejected prompt, which are not plain successes.
					return await sessionsSendCommand(ctx);
				default:
					throw usageError(
						`Unknown subcommand: sessions ${subcommand}`,
						"Try: superset sessions list",
					);
			}

		default:
			throw usageError(
				`Unknown command: ${command}`,
				"Run `superset --help` to see available commands.",
			);
	}
}

async function main(): Promise<void> {
	try {
		process.exitCode = await dispatch(process.argv.slice(2));
	} catch (error) {
		const out = new Output();
		if (error instanceof CliError) {
			out.error(error.message);
			for (const detail of error.details) {
				if (detail) process.stderr.write(`  ${detail}\n`);
			}
			process.exitCode = error.exitCode;
			return;
		}
		out.error(error instanceof Error ? error.message : String(error));
		process.exitCode = EXIT_CODES.FAILURE;
	}
}

await main();

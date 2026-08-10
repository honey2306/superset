#!/usr/bin/env bun

// The single entry point for desktop releases (`bun run release`). Desktop and
// host-service move together; pty-daemon remains on its independent 0.x track.
//
// Agent-friendly: every action is reachable non-interactively via subcommands +
// flags. The interactive menu only runs on a TTY; otherwise usage is printed.

import { runCheck } from "./check-versions.ts";
import { runDesktop } from "./desktop.ts";

function usage(): void {
	console.log(`Usage: bun run release <command> [flags]

Commands:
  desktop [version] [commit] [--publish] [--merge] [--daemon] [--republish]
      New version; desktop + host-service move together.
  check
      Verify versions are unified (exit 1 on drift).

Run with no command for the interactive desktop release flow (TTY only).`);
}

const [sub, ...rest] = process.argv.slice(2);

switch (sub) {
	case "desktop":
		await runDesktop(rest);
		break;
	case "check":
		process.exit((await runCheck()) ? 0 : 1);
		break;
	case "-h":
	case "--help":
	case "help":
		usage();
		break;
	case undefined:
		if (!process.stdin.isTTY) {
			usage();
			process.exit(1);
		}
		await runDesktop([]);
		break;
	default:
		console.error(`Unknown command: ${sub}\n`);
		usage();
		process.exit(1);
}

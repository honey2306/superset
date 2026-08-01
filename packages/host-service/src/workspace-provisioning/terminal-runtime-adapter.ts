import type { HostDb } from "../db";
import type { EventBus } from "../events";
import { createTerminalSessionInternal } from "../terminal/terminal";
import type { InitialLaunchResult, InitialSessionIntent } from "./types";

/**
 * Terminal Runtime Adapter — Seam between the Provisioning saga and the
 * pty daemon session manager. Provisioning journals a caller-supplied
 * terminal id BEFORE spawning (via `OperationJournal.ensureTerminalId`),
 * so on retry the same intent adopts the same daemon session instead of
 * creating a duplicate (execplan §Commit and compensation).
 *
 * Two adapters:
 *   - `createProductionTerminalRuntime` wraps
 *     `createTerminalSessionInternal`.
 *   - `createInMemoryTerminalRuntime` records requests deterministically
 *     for provisioning tests.
 */

export interface StartInitialSessionArgs {
	workspaceId: string;
	worktreePath: string;
	intent: InitialSessionIntent;
	terminalId: string;
}

export interface TerminalRuntimeAdapter {
	startInitialSession(
		args: StartInitialSessionArgs,
	): Promise<InitialLaunchResult>;
}

export interface ProductionTerminalRuntimeDeps {
	db: HostDb;
	eventBus: EventBus;
}

export function createProductionTerminalRuntime(
	deps: ProductionTerminalRuntimeDeps,
): TerminalRuntimeAdapter {
	return {
		async startInitialSession(args) {
			const { intent, terminalId, workspaceId, worktreePath } = args;
			const initialCommand =
				intent.kind === "command" ? intent.command : undefined;
			const label =
				intent.kind === "shell" || intent.kind === "command"
					? intent.label
					: undefined;
			const role: "setup" | "shell" | "command" | "agent" =
				intent.kind === "agent"
					? "agent"
					: intent.kind === "command"
						? "command"
						: intent.kind === "setup"
							? "setup"
							: "shell";
			const result = await createTerminalSessionInternal({
				terminalId,
				workspaceId,
				db: deps.db,
				eventBus: deps.eventBus,
				initialCommand,
				cwd: worktreePath,
			});
			if ("error" in result) {
				throw new Error(`Terminal spawn failed: ${result.error}`);
			}
			return {
				key: intent.key,
				kind: "terminal",
				sessionId: terminalId,
				role,
				label,
				attachable: true,
			};
		},
	};
}

export interface InMemoryTerminalRuntime extends TerminalRuntimeAdapter {
	/** Every session spawn recorded in call order. */
	readonly calls: StartInitialSessionArgs[];
	/**
	 * Scripted failure: if set, `startInitialSession` throws the given
	 * error on the next call (then clears the script). Lets tests exercise
	 * post-commit terminal failure without depending on real pty behavior.
	 */
	failNext(err: Error): void;
}

export function createInMemoryTerminalRuntime(): InMemoryTerminalRuntime {
	const calls: StartInitialSessionArgs[] = [];
	let pendingError: Error | null = null;
	return {
		calls,
		failNext(err) {
			pendingError = err;
		},
		async startInitialSession(args) {
			calls.push(args);
			if (pendingError) {
				const e = pendingError;
				pendingError = null;
				throw e;
			}
			const role: "setup" | "shell" | "command" | "agent" =
				args.intent.kind === "agent"
					? "agent"
					: args.intent.kind === "command"
						? "command"
						: args.intent.kind === "setup"
							? "setup"
							: "shell";
			return {
				key: args.intent.key,
				kind: "terminal",
				sessionId: args.terminalId,
				role,
				attachable: true,
			};
		},
	};
}

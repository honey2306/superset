/**
 * Stable process exit codes.
 *
 * Scripts and coding agents branch on these, so treat them as a public
 * contract: never renumber an existing code, only append.
 */
export const EXIT_CODES = {
	/** Command succeeded. */
	OK: 0,
	/** Generic failure that has no more specific code. */
	FAILURE: 1,
	/** Bad invocation: unknown command, missing or invalid argument. */
	USAGE: 2,
	/** The requested resource does not exist. */
	NOT_FOUND: 3,
	/** No reachable host-service (desktop not running, stale manifest). */
	UNAVAILABLE: 4,
	/** Timed out waiting for a turn, stream, or condition. */
	TIMEOUT: 5,
	/** Resource is busy, or the request conflicts with current state. */
	CONFLICT: 6,
	/** Refused for safety (uncommitted changes, destructive without --force). */
	REJECTED: 7,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

/**
 * An error carrying the exit code the process should terminate with.
 *
 * `details` are printed as indented follow-up lines, used for actionable
 * remediation ("Start the Superset desktop app, or run: superset service start").
 */
export class CliError extends Error {
	readonly exitCode: ExitCode;
	readonly details: readonly string[];

	constructor(
		message: string,
		exitCode: ExitCode = EXIT_CODES.FAILURE,
		details: readonly string[] = [],
	) {
		super(message);
		this.name = "CliError";
		this.exitCode = exitCode;
		this.details = details;
	}
}

export function usageError(message: string, ...details: string[]): CliError {
	return new CliError(message, EXIT_CODES.USAGE, details);
}

export function notFoundError(message: string, ...details: string[]): CliError {
	return new CliError(message, EXIT_CODES.NOT_FOUND, details);
}

export function unavailableError(
	message: string,
	...details: string[]
): CliError {
	return new CliError(message, EXIT_CODES.UNAVAILABLE, details);
}

export function timeoutError(message: string, ...details: string[]): CliError {
	return new CliError(message, EXIT_CODES.TIMEOUT, details);
}

export function conflictError(message: string, ...details: string[]): CliError {
	return new CliError(message, EXIT_CODES.CONFLICT, details);
}

export function rejectedError(message: string, ...details: string[]): CliError {
	return new CliError(message, EXIT_CODES.REJECTED, details);
}

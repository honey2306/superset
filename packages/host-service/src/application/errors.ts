/** Failures from Host operations, independent of HTTP, tRPC or MCP. */
export type HostOperationErrorCode =
	| "BAD_REQUEST"
	| "NOT_FOUND"
	| "CONFLICT"
	| "PRECONDITION_FAILED"
	| "FORBIDDEN"
	| "TOO_MANY_REQUESTS"
	| "INTERNAL_SERVER_ERROR";

export class HostOperationError extends Error {
	readonly code: HostOperationErrorCode;
	constructor(options: {
		code: HostOperationErrorCode;
		message?: string;
		cause?: unknown;
	}) {
		super(options.message ?? options.code, { cause: options.cause });
		this.name = "HostOperationError";
		this.code = options.code;
	}
}

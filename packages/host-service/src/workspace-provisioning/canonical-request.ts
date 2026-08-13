import { createHash } from "node:crypto";
import { canonicalizeHostPath } from "../workspace-catalog/canonical-path";
import type { ProvisionWorkspaceRequest, WorkspaceSource } from "./types";

/**
 * Server-side canonical encoder. Deterministic textual normalization plus
 * host-local `realpath` on any filesystem path the request carries. The
 * hash uses SHA-256 over the JSON-stringified canonical form with keys
 * sorted recursively.
 *
 * Command / prompt payloads are redacted (SHA-256 digest substituted) in
 * the persisted `request_json`, but the ORIGINAL request feeds the hash
 * so a re-entry with different command bodies is correctly treated as an
 * `IDEMPOTENCY_CONFLICT`.
 */
export interface CanonicalRequest {
	hash: string;
	/** JSON-safe redacted form suitable to persist as `request_json`. */
	redacted: unknown;
}

export function canonicalizeProvisionRequest(
	request: ProvisionWorkspaceRequest,
): CanonicalRequest {
	validateCompatibility(request);
	const canonical = normalizeRequest(request);
	const hash = sha256(stableJson(canonical));
	const redacted = redactSensitive(canonical);
	return { hash, redacted };
}

function validateCompatibility(request: ProvisionWorkspaceRequest): void {
	const allowedByProject: Record<string, WorkspaceSource["kind"][]> = {
		existing: ["main", "branch", "worktree", "pull-request"],
		"setup-existing": ["main"],
		import: ["main"],
		clone: ["main"],
		empty: ["main"],
		template: ["main"],
		temporary: ["main"],
	};
	const allowed = allowedByProject[request.project.kind];
	if (!allowed || !allowed.includes(request.source.kind)) {
		throw new ProvisioningInputError(
			"INVALID_SOURCE",
			`Project kind '${request.project.kind}' does not accept source kind '${request.source.kind}'.`,
		);
	}
	if (request.initialSessions) {
		const keys = new Set<string>();
		for (const intent of request.initialSessions) {
			if (keys.has(intent.key)) {
				throw new ProvisioningInputError(
					"INVALID_SOURCE",
					`Duplicate initial session key: ${intent.key}`,
				);
			}
			keys.add(intent.key);
		}
	}
	if (
		request.idempotencyKey.length < 1 ||
		request.idempotencyKey.length > 200
	) {
		throw new ProvisioningInputError(
			"INVALID_SOURCE",
			"idempotencyKey must be 1..200 characters",
		);
	}
}

function normalizeRequest(
	request: ProvisionWorkspaceRequest,
): ProvisionWorkspaceRequest {
	const project = normalizeProject(request.project);
	const source = normalizeSource(request.source);
	const existing = {
		workspace: request.existing?.workspace ?? "reuse",
		worktree: request.existing?.worktree ?? "adopt",
	} as const;
	const display = request.display
		? {
				name: request.display.name?.trim() || undefined,
				taskId: request.display.taskId?.trim() || undefined,
			}
		: undefined;
	return {
		idempotencyKey: request.idempotencyKey.trim(),
		project,
		source,
		existing,
		display,
		initialSessions: request.initialSessions?.map((s) => ({ ...s })),
	};
}

function normalizeProject(target: ProvisionWorkspaceRequest["project"]) {
	switch (target.kind) {
		case "existing":
			return { kind: "existing" as const, projectId: target.projectId };
		case "setup-existing":
			return {
				...target,
				mode:
					target.mode.kind === "clone"
						? {
								kind: "clone" as const,
								parentDirectory: canonicalizeHostPath(
									target.mode.parentDirectory,
								),
							}
						: {
								kind: "import" as const,
								path: canonicalizeHostPath(target.mode.path),
								allowRelocate: !!target.mode.allowRelocate,
							},
			};
		case "import":
			return {
				kind: "import" as const,
				name: target.name.trim(),
				git: target.git,
				path: canonicalizeHostPath(target.path),
			};
		case "clone":
			return {
				kind: "clone" as const,
				url: target.url.trim(),
				name: target.name.trim(),
				parentDirectory: canonicalizeHostPath(target.parentDirectory),
			};
		case "empty":
			return {
				kind: "empty" as const,
				name: target.name.trim(),
				parentDirectory: canonicalizeHostPath(target.parentDirectory),
			};
		case "template":
			return {
				kind: "template" as const,
				url: target.url.trim(),
				name: target.name.trim(),
				parentDirectory: canonicalizeHostPath(target.parentDirectory),
			};
		case "temporary":
			return {
				kind: "temporary" as const,
				singletonKey: target.singletonKey,
			};
	}
}

function normalizeSource(source: WorkspaceSource): WorkspaceSource {
	switch (source.kind) {
		case "main":
			return { kind: "main" };
		case "branch":
			return {
				kind: "branch",
				name:
					source.name.kind === "explicit"
						? {
								kind: "explicit",
								value: source.name.value.trim(),
							}
						: {
								kind: "generated",
								prompt: source.name.prompt?.trim(),
							},
				from:
					source.from.kind === "default"
						? { kind: "default" }
						: { kind: "ref", value: source.from.value.trim() },
			};
		case "worktree":
			return {
				kind: "worktree",
				path: canonicalizeHostPath(source.path),
				expectedBranch: source.expectedBranch?.trim() || undefined,
			};
		case "pull-request":
			return { ...source, number: source.number };
	}
}

function sha256(input: string): string {
	return createHash("sha256").update(input).digest("hex");
}

export function stableJson(value: unknown): string {
	return JSON.stringify(value, (_, v) => sortObject(v));
}

function sortObject(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortObject);
	if (value && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>)
			.filter(([, v]) => v !== undefined)
			.sort(([a], [b]) => a.localeCompare(b));
		return Object.fromEntries(entries.map(([k, v]) => [k, sortObject(v)]));
	}
	return value;
}

function redactSensitive(request: ProvisionWorkspaceRequest): unknown {
	if (!request.initialSessions) return request;
	const initialSessions = request.initialSessions.map((intent) => {
		if (intent.kind === "command") {
			return {
				...intent,
				command: `sha256:${sha256(intent.command)}`,
			};
		}
		if (intent.kind === "agent") {
			return {
				...intent,
				prompt: `sha256:${sha256(intent.prompt)}`,
				attachmentIds: undefined,
			};
		}
		return intent;
	});
	return { ...request, initialSessions };
}

export class ProvisioningInputError extends Error {
	constructor(
		public readonly code:
			| "INVALID_SOURCE"
			| "IDEMPOTENCY_CONFLICT"
			| "RESOURCE_BUSY"
			| "TOO_LATE_TO_CANCEL",
		message: string,
	) {
		super(message);
		this.name = "ProvisioningInputError";
	}
}

/**
 * Wire types the Workspace Provisioning Module exposes to tRPC. These
 * mirror the discriminated unions documented in the execplan; the tRPC
 * schemas in `trpc/router/workspace-provisioning/schemas.ts` are the
 * validated peer.
 */

export type ProjectTarget =
	| { kind: "existing"; projectId: string }
	| {
			kind: "setup-existing";
			projectId: string;
			origin: { repoUrl?: string; name?: string };
			mode:
				| { kind: "clone"; parentDirectory: string }
				| { kind: "import"; path: string; allowRelocate?: boolean };
	  }
	| {
			kind: "import";
			path: string;
			name: string;
			git: "require" | "initialize-with-consent";
	  }
	| { kind: "clone"; url: string; parentDirectory: string; name: string }
	| { kind: "empty"; parentDirectory: string; name: string }
	| { kind: "template"; url: string; parentDirectory: string; name: string }
	| { kind: "temporary"; singletonKey: "default" };

export type WorkspaceSource =
	| { kind: "main" }
	| {
			kind: "branch";
			name:
				| { kind: "explicit"; value: string }
				| { kind: "generated"; prompt?: string };
			from: { kind: "default" } | { kind: "ref"; value: string };
	  }
	| { kind: "worktree"; path: string; expectedBranch?: string }
	| { kind: "pull-request"; provider: "github"; number: number };

export type InitialSessionIntent =
	| { key: string; kind: "setup"; requirement: "required" | "best-effort" }
	| {
			key: string;
			kind: "shell";
			label?: string;
			requirement: "required" | "best-effort";
	  }
	| {
			key: string;
			kind: "command";
			command: string;
			label?: string;
			requirement: "required" | "best-effort";
	  }
	| {
			key: string;
			kind: "agent";
			agent: string;
			prompt: string;
			attachmentIds?: string[];
			model?: string;
			effort?: string;
			requirement: "required" | "best-effort";
	  };

export interface ProvisionWorkspaceRequest {
	idempotencyKey: string;
	project: ProjectTarget;
	source: WorkspaceSource;
	display?: { name?: string; taskId?: string };
	existing?: {
		workspace?: "reuse" | "fail";
		worktree?: "adopt" | "fail";
	};
	initialSessions?: InitialSessionIntent[];
}

export type WorkspaceOperationState =
	| "queued"
	| "running"
	| "compensating"
	| "succeeded"
	| "failed"
	| "cancelled";

export type WorkspaceOperationStage =
	| "resolving"
	| "materializing"
	| "cataloging"
	| "initializing"
	| "starting-runtime"
	| "compensating";

export type InitialLaunchResult =
	| {
			key: string;
			kind: "terminal";
			sessionId: string;
			role: "setup" | "shell" | "command" | "agent";
			label?: string;
			attachable: true;
	  }
	| { key: string; kind: "chat"; sessionId: string; label?: string };

export type WorkspaceOperationFailureCode =
	| "IDEMPOTENCY_CONFLICT"
	| "RESOURCE_BUSY"
	| "INVALID_SOURCE"
	| "PROJECT_NOT_FOUND"
	| "IDENTITY_CONFLICT"
	| "NOT_A_GIT_REPOSITORY"
	| "DETACHED_HEAD"
	| "REF_NOT_FOUND"
	| "BRANCH_CONFLICT"
	| "WORKTREE_CONFLICT"
	| "PR_UNAVAILABLE"
	| "AUTH_REQUIRED"
	| "FILESYSTEM_DENIED"
	| "DISK_FULL"
	| "CATALOG_COMMIT_FAILED"
	| "TERMINAL_UNAVAILABLE"
	| "COMPENSATION_INCOMPLETE"
	| "TOO_LATE_TO_CANCEL";

export interface WorkspaceOperationFailure {
	code: WorkspaceOperationFailureCode;
	class: "precondition" | "conflict" | "transient" | "permanent";
	retryable: boolean;
	message: string;
	cleanup: "not-needed" | "complete" | "pending" | "incomplete";
	workspaceId?: string;
}

export interface WorkspaceOperation {
	id: string;
	revision: number;
	state: WorkspaceOperationState;
	stage?: WorkspaceOperationStage;
	projectId?: string;
	workspaceId?: string;
	disposition?: "created" | "adopted" | "reused" | "repaired";
	progress?: { label: string; completed: number; total?: number };
	launches: InitialLaunchResult[];
	warnings: Array<{ code: string; message: string }>;
	failure?: WorkspaceOperationFailure;
	createdAt: number;
	updatedAt: number;
	/** Present while cancellation is requested but the runner is still stopping
	 * or compensating, and retained on the terminal receipt for auditability. */
	cancelRequestedAt?: number;
	completedAt?: number;
}

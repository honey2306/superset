import type { DetectedPort } from "@superset/port-scanner";
import type { HarnessKind, SessionStatus } from "@superset/session-protocol";
import type { AgentIdentity } from "@superset/shared/agent-identity";
import type { FsWatchEvent } from "@superset/workspace-fs/host";
import type { AgentLifecycleEventType } from "./map-event-type.ts";

// ── Server → Client ────────────────────────────────────────────────

export interface FsEventsMessage {
	type: "fs:events";
	workspaceId: string;
	events: FsWatchEvent[];
}

export interface GitChangedMessage {
	type: "git:changed";
	workspaceId: string;
	/**
	 * Worktree-relative paths that changed when the batch was worktree-only.
	 * Absent means a broad git state change (`.git/` activity — commit, index,
	 * refs, or mixed) — consumers should invalidate everything for the
	 * workspace.
	 */
	paths?: string[];
}

export interface AgentLifecycleMessage {
	type: "agent:lifecycle";
	eventId: string;
	workspaceId: string;
	eventType: AgentLifecycleEventType;
	terminalId: string;
	// Absent when the hook ran without `SUPERSET_AGENT_ID` set (legacy shells
	// or third-party hook configs that bypass our wrappers).
	agent?: AgentIdentity;
	occurredAt: number;
}

export interface TerminalLifecycleMessage {
	type: "terminal:lifecycle";
	workspaceId: string;
	terminalId: string;
	eventType: "exit";
	exitCode: number;
	signal: number;
	occurredAt: number;
}

export interface PortChangedMessage {
	type: "port:changed";
	workspaceId: string;
	eventType: "add" | "remove";
	port: DetectedPort;
	label: string | null;
	occurredAt: number;
}

/**
 * Snapshot of a host-owned workspace row as carried on the event bus.
 * Structural (not the drizzle inferred type) so workspace-client consumers
 * don't couple to the host's schema module.
 */
export interface WorkspaceSnapshot {
	id: string;
	projectId: string;
	name: string;
	branch: string;
	type: "main" | "worktree";
	worktreePath: string;
	taskId: string | null;
	createdAt: number;
	updatedAt: number;
}

export interface WorkspaceChangedMessage {
	type: "workspace:changed";
	workspaceId: string;
	eventType: "created" | "updated" | "deleted";
	/** Null for `deleted` — the row is already gone. */
	workspace: WorkspaceSnapshot | null;
	occurredAt: number;
}

/**
 * Snapshot of a host-owned project row as carried on the event bus.
 * Structural (not the drizzle inferred type) so workspace-client consumers
 * don't couple to the host's schema module.
 */
export interface ProjectSnapshot {
	id: string;
	name: string;
	repoPath: string;
	repoOwner: string | null;
	repoName: string | null;
	repoUrl: string | null;
	worktreeBaseDir: string | null;
	createdAt: number;
	updatedAt: number;
}

export interface ProjectChangedMessage {
	type: "project:changed";
	projectId: string;
	eventType: "created" | "updated" | "deleted";
	/** Null for `deleted` — the row is already gone. */
	project: ProjectSnapshot | null;
	occurredAt: number;
}

/**
 * Wake-up ping for the Workspace Catalog change stream (M1). The revision
 * is the highest committed row in `catalog_changes`; consumers replay from
 * their last cursor by calling `workspaceCatalog.changes`. The event is not
 * the durable payload — dropped events are healed on the next call.
 */
export interface CatalogChangedMessage {
	type: "catalog:changed";
	revision: number;
}

/**
 * Wake-up + payload for a Workspace Provisioning operation state change
 * (M2). Carries the current wire-shape operation so the renderer's Launch
 * Coordinator can update its projection without a separate `get` call.
 * `revision` is the operation's own monotonically incrementing revision
 * (not the Catalog revision).
 */
export interface WorkspaceOperationChangedMessage {
	type: "workspace-operation:changed";
	operationId: string;
	revision: number;
	operation: unknown;
}

/**
 * ACP session status transition — a host-wide broadcast so the sidebar and
 * other passive consumers can react without keeping a per-session WebSocket
 * open. The per-session `/acp-sessions/:sessionId/stream` remains the
 * authoritative channel for pane-level updates; this event is a lightweight
 * fan-in for status only. `eventType: "deleted"` is fired from `close` so
 * subscribers can drop the row without a follow-up list refetch.
 */
export interface AcpSessionChangedMessage {
	type: "acp-session:changed";
	workspaceId: string;
	sessionId: string;
	eventType: "changed" | "deleted";
	/** Absent for `deleted`. */
	status?: SessionStatus;
	occurredAt: number;
}

export interface AcpSessionOpenRequestedMessage {
	type: "acp-session:open-requested";
	workspaceId: string;
	sessionId: string;
	sourceSessionId: string;
	harness: HarnessKind;
	reason: "context_limit" | "parallel_task" | "fresh_start" | "delegation";
	occurredAt: number;
}

export interface EventBusErrorMessage {
	type: "error";
	message: string;
}

export type ServerMessage =
	| FsEventsMessage
	| GitChangedMessage
	| AgentLifecycleMessage
	| TerminalLifecycleMessage
	| PortChangedMessage
	| WorkspaceChangedMessage
	| ProjectChangedMessage
	| CatalogChangedMessage
	| WorkspaceOperationChangedMessage
	| AcpSessionChangedMessage
	| AcpSessionOpenRequestedMessage
	| EventBusErrorMessage;

// ── Client → Server ────────────────────────────────────────────────

export interface FsWatchCommand {
	type: "fs:watch";
	workspaceId: string;
}

export interface FsUnwatchCommand {
	type: "fs:unwatch";
	workspaceId: string;
}

export type ClientMessage = FsWatchCommand | FsUnwatchCommand;

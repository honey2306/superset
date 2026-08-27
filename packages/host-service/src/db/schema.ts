import type {
	HarnessKind,
	StopReason,
	SupersetSessionRole,
	TranscriptTurnStatus,
} from "@superset/session-protocol";
import type {
	AgentDefinitionId,
	AgentIdentityId,
} from "@superset/shared/agent-catalog";
import type { BranchPrefixMode } from "@superset/shared/workspace-launch";
import { sql } from "drizzle-orm";
import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const terminalSessions = sqliteTable(
	"terminal_sessions",
	{
		id: text().primaryKey(),
		originWorkspaceId: text("origin_workspace_id").references(
			() => workspaces.id,
			{ onDelete: "set null" },
		),
		status: text().notNull().default("active"),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		lastAttachedAt: integer("last_attached_at"),
		endedAt: integer("ended_at"),
		/**
		 * Set the moment a dispose is requested — durable intent-to-kill. A
		 * failed kill leaves the row `active` with this stamp, and the reaper
		 * retries it regardless of workspace liveness (a one-shot renderer
		 * broadcast must not be the only chance to kill a session).
		 */
		disposeRequestedAt: integer("dispose_requested_at"),
	},
	(table) => [
		index("terminal_sessions_origin_workspace_id_idx").on(
			table.originWorkspaceId,
		),
		index("terminal_sessions_status_idx").on(table.status),
	],
);

export const terminalAgentBindings = sqliteTable(
	"terminal_agent_bindings",
	{
		terminalId: text("terminal_id")
			.primaryKey()
			.references(() => terminalSessions.id, { onDelete: "cascade" }),
		workspaceId: text("workspace_id").notNull(),
		agentId: text("agent_id").notNull().$type<AgentIdentityId>(),
		agentSessionId: text("agent_session_id"),
		definitionId: text("definition_id").$type<AgentDefinitionId>(),
		startedAt: integer("started_at").notNull(),
		lastEventAt: integer("last_event_at").notNull(),
		lastEventType: text("last_event_type").notNull(),
	},
	(table) => [
		index("terminal_agent_bindings_workspace_id_idx").on(table.workspaceId),
	],
);

export const projects = sqliteTable(
	"projects",
	{
		id: text().primaryKey(),
		repoPath: text("repo_path").notNull(),
		repoProvider: text("repo_provider"),
		repoOwner: text("repo_owner"),
		repoName: text("repo_name"),
		repoUrl: text("repo_url"),
		remoteName: text("remote_name"),
		worktreeBaseDir: text("worktree_base_dir"),
		// Per-project branch-prefix override. A null `branchPrefixMode` means
		// "fall back to the host-wide default" in `host_settings`.
		branchPrefixMode: text("branch_prefix_mode").$type<BranchPrefixMode>(),
		branchPrefixCustom: text("branch_prefix_custom"),
		sparseCheckoutPaths: text("sparse_checkout_paths"),
		// Empty string means "not yet backfilled" — the startup sweep targets
		// these rows (name from cloud legacy row if reachable, else basename).
		name: text().notNull().default(""),
		// Distinguishes long-lived repository Projects from the singleton
		// temporary Project. `kind='temporary'` combined with a fixed
		// `singleton_key` (currently only "default") lets the Provisioning
		// Module route `ProjectTarget.temporary` requests to the one row.
		kind: text().notNull().default("repository"),
		singletonKey: text("singleton_key"),
		// Canonicalized `repoPath` — the per-host identity key. Nullable so
		// the M1 migration does not fail on legacy duplicates; the backfill
		// fills it lazily and records a conflict when it cannot.
		canonicalRepoPath: text("canonical_repo_path"),
		// 0 means "predates local ownership"; write paths always set it.
		updatedAt: integer("updated_at").notNull().default(0),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		index("projects_repo_path_idx").on(table.repoPath),
		uniqueIndex("projects_canonical_repo_path_unique").on(
			table.canonicalRepoPath,
		),
		uniqueIndex("projects_singleton_key_unique")
			.on(table.singletonKey)
			.where(sql`singleton_key IS NOT NULL`),
	],
);

/**
 * Single-row host-wide settings (always `id = 1`). The host-service has no
 * generic settings store yet; this row holds host-wide knobs (worktree base
 * dir, branch-prefix default) that projects fall back to when they have no
 * override of their own.
 */
export const hostSettings = sqliteTable("host_settings", {
	id: integer().primaryKey().default(1),
	worktreeBaseDir: text("worktree_base_dir"),
	branchPrefixMode: text("branch_prefix_mode").$type<BranchPrefixMode>(),
	branchPrefixCustom: text("branch_prefix_custom"),
	delegatedExecutionEnabled: integer("delegated_execution_enabled", {
		mode: "boolean",
	})
		.notNull()
		.default(false),
	delegatedExecutionAgentConfigId: text("delegated_execution_agent_config_id"),
	delegatedExecutionModelId: text("delegated_execution_model_id"),
	/** Ordered user-configurable delegation profiles, encoded as JSON. */
	delegationProfiles: text("delegation_profiles"),
});

/**
 * Desktop-local task records. These intentionally have no organization/user
 * foreign keys: the host database is the ownership boundary and must remain
 * usable when the cloud API is unavailable.
 */
export const localTodos = sqliteTable(
	"local_todos",
	{
		id: text().primaryKey(),
		title: text().notNull(),
		note: text(),
		mode: text().notNull(),
		dueAt: integer("due_at").notNull(),
		timezone: text().notNull(),
		projectId: text("v2_project_id"),
		workspaceId: text("v2_workspace_id"),
		agent: text(),
		prompt: text(),
		status: text().notNull().default("pending"),
		sessionKind: text("session_kind"),
		acpSessionId: text("chat_session_id"),
		terminalSessionId: text("terminal_session_id"),
		notifiedAt: integer("notified_at"),
		dispatchedAt: integer("dispatched_at"),
		doneAt: integer("done_at"),
		error: text(),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		updatedAt: integer("updated_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		index("local_todos_due_idx").on(table.status, table.dueAt),
		index("local_todos_workspace_idx").on(table.workspaceId),
	],
);

export const localAutomations = sqliteTable(
	"local_automations",
	{
		id: text().primaryKey(),
		name: text().notNull(),
		prompt: text().notNull(),
		agent: text().notNull(),
		projectId: text("v2_project_id"),
		workspaceId: text("v2_workspace_id"),
		rrule: text().notNull(),
		dtstart: integer("dtstart").notNull(),
		timezone: text().notNull(),
		enabled: integer({ mode: "boolean" }).notNull().default(true),
		mcpScopeJson: text("mcp_scope_json").notNull().default("[]"),
		nextRunAt: integer("next_run_at").notNull(),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		updatedAt: integer("updated_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		index("local_automations_due_idx").on(table.enabled, table.nextRunAt),
		index("local_automations_workspace_idx").on(table.workspaceId),
	],
);

export const localAutomationRuns = sqliteTable(
	"local_automation_runs",
	{
		id: text().primaryKey(),
		automationId: text("automation_id")
			.notNull()
			.references(() => localAutomations.id, { onDelete: "cascade" }),
		title: text().notNull(),
		scheduledFor: integer("scheduled_for").notNull(),
		workspaceId: text("v2_workspace_id"),
		sessionKind: text("session_kind"),
		acpSessionId: text("chat_session_id"),
		terminalSessionId: text("terminal_session_id"),
		status: text().notNull(),
		error: text(),
		dispatchedAt: integer("dispatched_at"),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		uniqueIndex("local_automation_runs_dedup_idx").on(
			table.automationId,
			table.scheduledFor,
		),
		index("local_automation_runs_history_idx").on(
			table.automationId,
			table.createdAt,
		),
	],
);

export const localAutomationPromptVersions = sqliteTable(
	"local_automation_prompt_versions",
	{
		id: text().primaryKey(),
		automationId: text("automation_id")
			.notNull()
			.references(() => localAutomations.id, { onDelete: "cascade" }),
		content: text().notNull(),
		contentHash: text("content_hash").notNull(),
		source: text().notNull(),
		restoredFromVersionId: text("restored_from_version_id"),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		index("local_automation_prompt_versions_history_idx").on(
			table.automationId,
			table.createdAt,
		),
	],
);

export const pullRequests = sqliteTable(
	"pull_requests",
	{
		id: text().primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		repoProvider: text("repo_provider").notNull(),
		repoOwner: text("repo_owner").notNull(),
		repoName: text("repo_name").notNull(),
		prNumber: integer("pr_number").notNull(),
		url: text().notNull(),
		title: text().notNull(),
		state: text().notNull(),
		isDraft: integer("is_draft", { mode: "boolean" }).notNull().default(false),
		headBranch: text("head_branch").notNull(),
		headSha: text("head_sha").notNull(),
		reviewDecision: text("review_decision"),
		checksStatus: text("checks_status").notNull().default("none"),
		checksJson: text("checks_json").notNull().default("[]"),
		lastFetchedAt: integer("last_fetched_at"),
		error: text(),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		updatedAt: integer("updated_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		index("pull_requests_project_id_idx").on(table.projectId),
		index("pull_requests_repo_branch_idx").on(
			table.repoProvider,
			table.repoOwner,
			table.repoName,
			table.headBranch,
		),
		uniqueIndex("pull_requests_repo_pr_unique").on(
			table.repoProvider,
			table.repoOwner,
			table.repoName,
			table.prNumber,
		),
	],
);

export const hostAgentConfigs = sqliteTable(
	"host_agent_configs",
	{
		id: text().primaryKey(),
		presetId: text("preset_id").notNull(),
		// Optional icon override. When null the client falls back to the icon
		// implied by `presetId`. User-authored ("custom") agents set this to a
		// built-in icon key (e.g. "claude") to pick a recognizable icon.
		iconId: text("icon_id"),
		label: text().notNull(),
		command: text().notNull(),
		argsJson: text("args_json").notNull().default("[]"),
		promptTransport: text("prompt_transport").notNull(),
		promptArgsJson: text("prompt_args_json").notNull().default("[]"),
		envJson: text("env_json").notNull().default("{}"),
		displayOrder: integer("display_order").notNull(),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		updatedAt: integer("updated_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		index("host_agent_configs_display_order_idx").on(table.displayOrder),
	],
);

export const workspaces = sqliteTable(
	"workspaces",
	{
		id: text().primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		worktreePath: text("worktree_path").notNull(),
		branch: text().notNull(),
		headSha: text("head_sha"),
		upstreamOwner: text("upstream_owner"),
		upstreamRepo: text("upstream_repo"),
		upstreamBranch: text("upstream_branch"),
		pullRequestId: text("pull_request_id").references(() => pullRequests.id, {
			onDelete: "set null",
		}),
		suppressedPullRequestId: text("suppressed_pull_request_id").references(
			() => pullRequests.id,
			{ onDelete: "set null" },
		),
		// Empty string means "not yet backfilled from cloud" — the startup
		// backfill sweep targets these rows.
		name: text().notNull().default(""),
		type: text().$type<"main" | "worktree">().notNull().default("worktree"),
		taskId: text("task_id"),
		// Canonicalized `worktreePath` — the per-host identity key.
		// Nullable during migration; new writes always set it.
		canonicalWorktreePath: text("canonical_worktree_path"),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		// 0 means "predates local ownership"; write paths always set it.
		updatedAt: integer("updated_at").notNull().default(0),
	},
	(table) => [
		index("workspaces_project_id_idx").on(table.projectId),
		index("workspaces_upstream_ref_idx").on(
			table.upstreamOwner,
			table.upstreamRepo,
			table.upstreamBranch,
		),
		index("workspaces_pull_request_id_idx").on(table.pullRequestId),
		uniqueIndex("workspaces_one_main_per_project")
			.on(table.projectId)
			.where(sql`type = 'main'`),
		uniqueIndex("workspaces_canonical_worktree_path_unique")
			.on(table.canonicalWorktreePath)
			.where(sql`canonical_worktree_path IS NOT NULL`),
	],
);

/**
 * Records identity collisions the M1 backfill (and future normal writes)
 * refused to auto-resolve. Rows are diagnostic — never delete the losing
 * entity; only fill the winner's canonical column and leave the loser's
 * null with a row here.
 */
export const catalogIdentityConflicts = sqliteTable(
	"catalog_identity_conflicts",
	{
		id: text().primaryKey(),
		entityType: text("entity_type").notNull().$type<"project" | "workspace">(),
		entityId: text("entity_id").notNull(),
		canonicalKey: text("canonical_key").notNull(),
		conflictingId: text("conflicting_id").notNull(),
		reason: text().notNull(),
		detectedAt: integer("detected_at").notNull(),
		resolvedAt: integer("resolved_at"),
	},
	(table) => [
		uniqueIndex("catalog_identity_conflicts_unique").on(
			table.entityType,
			table.entityId,
			table.canonicalKey,
		),
	],
);

/**
 * Append-only journal of every Workspace Catalog mutation. Written in the
 * same SQLite transaction as the entity row so a `catalog:changed`
 * broadcast can never race the corresponding data change. `snapshot_json`
 * is `null` for delete events.
 */
export const catalogChanges = sqliteTable("catalog_changes", {
	revision: integer().primaryKey({ autoIncrement: true }),
	schemaVersion: integer("schema_version").notNull().default(1),
	entityType: text("entity_type").notNull().$type<"project" | "workspace">(),
	entityId: text("entity_id").notNull(),
	eventType: text("event_type")
		.notNull()
		.$type<"created" | "updated" | "deleted">(),
	snapshotJson: text("snapshot_json"),
	occurredAt: integer("occurred_at").notNull(),
});

// ── M2 Provisioning journal ───────────────────────────────────────────

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

/**
 * Durable per-operation row for the Workspace Provisioning saga. IDs on
 * this row deliberately carry NO foreign keys — planned IDs must exist
 * before Catalog rows, and completed receipts must remain interpretable
 * after the Workspace they minted is later deleted.
 */
export const workspaceOperations = sqliteTable(
	"workspace_operations",
	{
		id: text().primaryKey(),
		idempotencyKey: text("idempotency_key").notNull(),
		requestHash: text("request_hash").notNull(),
		requestJson: text("request_json").notNull(),
		launchPayloadJson: text("launch_payload_json"),
		requestedByMachineId: text("requested_by_machine_id"),
		state: text().notNull().$type<WorkspaceOperationState>(),
		stage: text().$type<WorkspaceOperationStage>(),
		revision: integer().notNull().default(1),
		projectId: text("project_id"),
		workspaceId: text("workspace_id"),
		plannedProjectId: text("planned_project_id"),
		plannedWorkspaceId: text("planned_workspace_id"),
		catalogCommittedAt: integer("catalog_committed_at"),
		leaseOwner: text("lease_owner"),
		leaseExpiresAt: integer("lease_expires_at"),
		cancelRequestedAt: integer("cancel_requested_at"),
		failureCode: text("failure_code"),
		failureClass: text("failure_class"),
		failureRetryable: integer("failure_retryable"),
		failureMessage: text("failure_message"),
		cleanupState: text("cleanup_state"),
		resultJson: text("result_json"),
		createdAt: integer("created_at").notNull(),
		updatedAt: integer("updated_at").notNull(),
		completedAt: integer("completed_at"),
	},
	(table) => [
		uniqueIndex("workspace_operations_idempotency_key_unique").on(
			table.idempotencyKey,
		),
		index("workspace_operations_state_idx").on(table.state),
		index("workspace_operations_requested_by_machine_idx").on(
			table.requestedByMachineId,
		),
	],
);

export const workspaceOperationSteps = sqliteTable(
	"workspace_operation_steps",
	{
		operationId: text("operation_id")
			.notNull()
			.references(() => workspaceOperations.id, { onDelete: "cascade" }),
		stepKey: text("step_key").notNull(),
		status: text().notNull(),
		attempt: integer().notNull().default(0),
		inputJson: text("input_json"),
		outputJson: text("output_json"),
		startedAt: integer("started_at"),
		completedAt: integer("completed_at"),
	},
	(table) => [
		uniqueIndex("workspace_operation_steps_pk").on(
			table.operationId,
			table.stepKey,
		),
	],
);

export const workspaceOperationArtifacts = sqliteTable(
	"workspace_operation_artifacts",
	{
		id: text().primaryKey(),
		operationId: text("operation_id")
			.notNull()
			.references(() => workspaceOperations.id, { onDelete: "cascade" }),
		kind: text().notNull(),
		identity: text().notNull(),
		ownership: text().notNull(),
		expectedHeadSha: text("expected_head_sha"),
		cleanupState: text("cleanup_state").notNull(),
		createdAt: integer("created_at").notNull(),
		updatedAt: integer("updated_at").notNull(),
	},
	(table) => [
		uniqueIndex("workspace_operation_artifacts_unique").on(
			table.operationId,
			table.kind,
			table.identity,
		),
		index("workspace_operation_artifacts_operation_idx").on(table.operationId),
	],
);

/**
 * Natural-identity leases plus operation leases. `lock_key` is one of the
 * canonical keys documented in the execplan's canonicalization section
 * (`project-path:<canonical>`, `project:<id>:branch:<explicit>`, etc.);
 * short-lived `git-repo:<canonical>` critical-section leases live here
 * too so the resume worker can inspect held resources on crash recovery.
 */
export const workspaceOperationLocks = sqliteTable(
	"workspace_operation_locks",
	{
		lockKey: text("lock_key").primaryKey(),
		operationId: text("operation_id")
			.notNull()
			.references(() => workspaceOperations.id, { onDelete: "cascade" }),
		leaseOwner: text("lease_owner").notNull(),
		leaseExpiresAt: integer("lease_expires_at").notNull(),
	},
);

export const acpSessions = sqliteTable(
	"acp_sessions",
	{
		sessionId: text("session_id").primaryKey(),
		workspaceId: text("workspace_id").notNull(),
		acpSessionId: text("acp_session_id").notNull(),
		epoch: text().notNull().default("legacy"),
		/** Root sessions coordinate; delegated sessions execute a handoff. */
		role: text()
			.notNull()
			.default("root-coordinator")
			.$type<SupersetSessionRole>(),
		harness: text().notNull().$type<HarnessKind>(),
		cwd: text().notNull(),
		title: text(),
		lastStopReason: text("last_stop_reason").$type<StopReason>(),
		createdAt: integer("created_at").notNull(),
		updatedAt: integer("updated_at").notNull(),
	},
	(table) => [index("acp_sessions_workspace_id_idx").on(table.workspaceId)],
);

/**
 * Durable handoffs created by the `delegate` Superset tool. Unlike the ACP
 * journal, these rows are a queryable parent/child relationship and retain the
 * exact work brief even when either session is restored after a host restart.
 */
export type DelegationRunStatus =
	| "creating"
	| "running"
	| "completed"
	| "cancelled"
	| "interrupted"
	| "failed";

export const delegationRuns = sqliteTable(
	"delegation_runs",
	{
		id: text().primaryKey(),
		parentSessionId: text("parent_session_id").notNull(),
		parentWorkspaceId: text("parent_workspace_id").notNull(),
		childSessionId: text("child_session_id").notNull(),
		childWorkspaceId: text("child_workspace_id").notNull(),
		handoff: text().notNull(),
		profileId: text("profile_id"),
		contextSnapshotJson: text("context_snapshot_json"),
		resultJson: text("result_json"),
		actualAgent: text("actual_agent"),
		actualModel: text("actual_model"),
		harness: text().notNull().$type<HarnessKind>(),
		status: text().notNull().$type<DelegationRunStatus>(),
		failureMessage: text("failure_message"),
		createdAt: integer("created_at").notNull(),
		startedAt: integer("started_at"),
		completedAt: integer("completed_at"),
		failedAt: integer("failed_at"),
		updatedAt: integer("updated_at").notNull(),
	},
	(table) => [
		uniqueIndex("delegation_runs_child_session_id_unique").on(
			table.childSessionId,
		),
		index("delegation_runs_parent_session_history_idx").on(
			table.parentSessionId,
			table.createdAt,
		),
	],
);

export const acpSessionJournal = sqliteTable(
	"acp_session_journal",
	{
		sessionId: text("session_id").notNull(),
		epoch: text().notNull(),
		seq: integer().notNull(),
		ts: integer().notNull(),
		frameJson: text("frame_json").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.sessionId, table.epoch, table.seq] }),
	],
);

/**
 * Compact, user-visible transcript projections. Raw ACP process frames are
 * intentionally not retained here: the manager replaces the journal with a
 * fresh epoch after writing these rows, while this table survives tab close.
 */
export const acpSessionTurns = sqliteTable(
	"acp_session_turns",
	{
		sessionId: text("session_id").notNull(),
		turnNumber: integer("turn_number").notNull(),
		epoch: text().notNull(),
		startSeq: integer("start_seq").notNull(),
		endSeq: integer("end_seq").notNull(),
		userMessageJson: text("user_message_json").notNull(),
		assistantMessageJson: text("assistant_message_json"),
		status: text().notNull().$type<TranscriptTurnStatus>(),
		startedAt: integer("started_at").notNull(),
		completedAt: integer("completed_at").notNull(),
		durationMs: integer("duration_ms").notNull(),
		messageCount: integer("message_count").notNull(),
		toolCallCount: integer("tool_call_count").notNull(),
		toolSummariesJson: text("tool_summaries_json").notNull().default("[]"),
	},
	(table) => [primaryKey({ columns: [table.sessionId, table.turnNumber] })],
);

export const acpSessionCommands = sqliteTable(
	"acp_session_commands",
	{
		sessionId: text("session_id").notNull(),
		commandId: text("command_id").notNull(),
		createdAt: integer("created_at").notNull(),
	},
	(table) => [primaryKey({ columns: [table.sessionId, table.commandId] })],
);

// ── Phone pairing + sessions ─────────────────────────────────────────────
// Short-lived pairing codes minted by the desktop (Settings → Phone access)
// and one-shot redeemed by a phone browser opening `/app/pair?code=…`. On
// redeem, a long-lived `phone_sessions` row is minted and its raw bearer
// token is returned once — thereafter only its SHA-256 hash is stored, so a
// stolen DB never yields usable tokens.

export const phonePairingCodes = sqliteTable("phone_pairing_codes", {
	code: text().primaryKey(),
	createdAt: integer("created_at").notNull(),
	expiresAt: integer("expires_at").notNull(),
	redeemedAt: integer("redeemed_at"),
	redeemedSessionId: text("redeemed_session_id"),
});

export const phoneSessions = sqliteTable(
	"phone_sessions",
	{
		id: text().primaryKey(),
		tokenHash: text("token_hash").notNull(),
		deviceLabel: text("device_label").notNull().default(""),
		createdAt: integer("created_at").notNull(),
		expiresAt: integer("expires_at").notNull(),
		lastSeenAt: integer("last_seen_at").notNull(),
		revokedAt: integer("revoked_at"),
	},
	(table) => [uniqueIndex("phone_sessions_token_hash_idx").on(table.tokenHash)],
);

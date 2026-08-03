import type { electronTrpc } from "renderer/lib/electron-trpc";
import type { z } from "zod";

export interface WorkspaceToolProjection {
	id: string;
	name: string;
	branch: string;
	projectId: string;
	type: "worktree" | "branch";
}

export interface ProjectToolProjection {
	id: string;
	mainRepoPath: string;
	name?: string;
	defaultBranch?: string | null;
	workspaceBaseBranch?: string | null;
	color?: string | null;
	lastOpenedAt?: number | null;
	tabOrder?: number | null;
}

export interface SetActiveWorkspaceMutation {
	mutateAsync: (input: {
		workspaceId: string;
	}) => Promise<{ success: true; workspaceId: string }>;
}

export interface WorkspaceDeleteMutation {
	mutateAsync: (input: {
		id: string;
		deleteLocalBranch?: boolean;
		force?: boolean;
	}) => Promise<{ success: boolean; error?: string }>;
}

export interface WorkspaceUpdateMutation {
	mutateAsync: (input: {
		id: string;
		patch: {
			name?: string;
			branch?: string;
			taskId?: string | null;
		};
	}) => Promise<unknown>;
}

export interface CommandResult<
	TData extends Record<string, unknown> = Record<string, unknown>,
> {
	success: boolean;
	data?: TData;
	error?: string;
}

export interface BulkItemError {
	index: number;
	error: string;
	[key: string]: unknown;
}

export interface CreateWorktreeInput {
	projectId: string;
	name?: string;
	branchName?: string;
	compareBaseBranch?: string;
	sourceWorkspaceId?: string;
}

export interface CreatedWorktree {
	workspace: Pick<WorkspaceToolProjection, "id" | "name" | "branch">;
	worktreePath: string;
	wasExisting: boolean;
}

export function buildBulkResult<T>({
	items,
	errors,
	itemKey,
	allFailedMessage,
	total,
}: {
	items: T[];
	errors: BulkItemError[];
	itemKey: string;
	allFailedMessage: string;
	total: number;
}): CommandResult<Record<string, unknown>> {
	const data: Record<string, unknown> = {
		[itemKey]: items,
		summary: { total, succeeded: items.length, failed: errors.length },
	};
	if (errors.length > 0) data.errors = errors;
	return {
		success: items.length > 0,
		data,
		error: items.length === 0 ? allFailedMessage : undefined,
	};
}

// Available mutations and queries passed to tool handlers
export interface ToolContext {
	hostUrl?: string | null;
	// Mutations
	createWorktree: (input: CreateWorktreeInput) => Promise<CreatedWorktree>;
	setActive: SetActiveWorkspaceMutation;
	deleteWorkspace: WorkspaceDeleteMutation;
	updateWorkspace: WorkspaceUpdateMutation;
	terminalCreateOrAttach: ReturnType<
		typeof electronTrpc.terminal.createOrAttach.useMutation
	>;
	terminalWrite: ReturnType<typeof electronTrpc.terminal.write.useMutation>;
	// Query helpers
	refetchWorkspaces: () => Promise<unknown>;
	getWorkspaces: () => WorkspaceToolProjection[] | undefined;
	getProjects: () => ProjectToolProjection[] | undefined;
	getActiveWorkspaceId: () => string | null;
	getWorktreePathByWorkspaceId: (workspaceId: string) => string | undefined;
}

// Tool definition with schema and execute function
export interface ToolDefinition<
	T extends z.ZodType,
	TResult extends Record<string, unknown> = Record<string, unknown>,
> {
	name: string;
	schema: T;
	execute: (
		params: z.infer<T>,
		ctx: ToolContext,
	) => Promise<CommandResult<TResult>>;
}

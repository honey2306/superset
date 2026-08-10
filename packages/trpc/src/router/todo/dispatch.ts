import { mintUserJwt } from "@superset/auth/server";
import { dbWs } from "@superset/db/client";
import {
	type SelectTodo,
	todos,
	users,
	v2Hosts,
	v2UsersHosts,
} from "@superset/db/schema";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import {
	deduplicateBranchName,
	sanitizeBranchNameWithMaxLength,
	slugifyForBranch,
} from "@superset/shared/workspace-launch";
import { and, eq } from "drizzle-orm";
import { RelayDispatchError, relayMutation } from "../automation/relay-client";

type AgentRunResult =
	| { kind: "terminal"; sessionId: string; label: string }
	| { kind: "chat"; sessionId: string; label: string };

export type TodoDispatchOutcome =
	| { status: "dispatched" }
	| { status: "skipped_offline"; error: string }
	| { status: "dispatch_failed"; error: string };

export interface TodoDispatchOptions {
	todo: SelectTodo;
	relayUrl: string;
}

/**
 * Run one TODO in auto mode: resolve host, create a workspace when needed,
 * start the agent session. Updates the todos row in place (single-shot, no
 * separate runs table).
 */
export async function dispatchTodo(
	opts: TodoDispatchOptions,
): Promise<TodoDispatchOutcome> {
	const { todo, relayUrl } = opts;

	if (todo.mode !== "auto") {
		return {
			status: "dispatch_failed",
			error: "todo mode is not auto",
		};
	}
	if (!todo.agent || !todo.prompt) {
		return {
			status: "dispatch_failed",
			error: "todo missing agent or prompt",
		};
	}

	const host = await resolveTargetHost(todo);
	if (!host) {
		const error = "no host available";
		await dbWs
			.update(todos)
			.set({ status: "skipped_offline", error })
			.where(eq(todos.id, todo.id));
		return { status: "skipped_offline", error };
	}
	if (!host.isOnline) {
		const error = "target host offline";
		await dbWs
			.update(todos)
			.set({ status: "skipped_offline", error })
			.where(eq(todos.id, todo.id));
		return { status: "skipped_offline", error };
	}

	await dbWs
		.update(todos)
		.set({ status: "dispatching", error: null })
		.where(eq(todos.id, todo.id));

	let workspaceId: string | null = todo.v2WorkspaceId;
	try {
		const [owner] = await dbWs
			.select({ email: users.email })
			.from(users)
			.where(eq(users.id, todo.ownerUserId))
			.limit(1);

		const jwt = await mintUserJwt({
			userId: todo.ownerUserId,
			email: owner?.email,
			organizationIds: [todo.organizationId],
			scope: "todo-run",
			runId: todo.id,
			ttlSeconds: 300,
		});

		const routingKey = buildHostRoutingKey(todo.organizationId, host.machineId);

		const createFreshWorkspace = async () => {
			if (!todo.v2ProjectId) {
				throw new Error("todo missing v2ProjectId for fresh workspace");
			}
			const created = await createWorkspaceForTodo({
				relayUrl,
				hostId: routingKey,
				jwt,
				projectId: todo.v2ProjectId,
				todo,
			});
			return created.workspaceId;
		};

		const runAgent = (targetWorkspaceId: string) =>
			runAgentOnHost({
				relayUrl,
				hostId: routingKey,
				jwt,
				workspaceId: targetWorkspaceId,
				// biome-ignore lint/style/noNonNullAssertion: guarded above
				agent: todo.agent!,
				// biome-ignore lint/style/noNonNullAssertion: guarded above
				prompt: todo.prompt!,
			});

		if (workspaceId === null) {
			workspaceId = await createFreshWorkspace();
		}

		let result: AgentRunResult;
		try {
			result = await runAgent(workspaceId);
		} catch (err) {
			const stalePin = todo.v2WorkspaceId;
			const pinGone =
				stalePin !== null &&
				stalePin === workspaceId &&
				err instanceof RelayDispatchError &&
				err.status === 404 &&
				err.message.includes(stalePin);
			if (!pinGone) throw err;
			workspaceId = null;
			workspaceId = await createFreshWorkspace();
			result = await runAgent(workspaceId);
		}

		await dbWs
			.update(todos)
			.set({
				status: "dispatched",
				sessionKind: result.kind,
				chatSessionId: result.kind === "chat" ? result.sessionId : null,
				terminalSessionId: result.kind === "terminal" ? result.sessionId : null,
				v2WorkspaceId: workspaceId,
				dispatchedAt: new Date(),
				error: null,
			})
			.where(eq(todos.id, todo.id));
	} catch (err) {
		const error = describeError(err, "dispatch");
		await dbWs
			.update(todos)
			.set({
				status: "dispatch_failed",
				v2WorkspaceId: workspaceId,
				error,
			})
			.where(eq(todos.id, todo.id));
		return { status: "dispatch_failed", error };
	}

	return { status: "dispatched" };
}

async function resolveTargetHost(
	todo: SelectTodo,
): Promise<typeof v2Hosts.$inferSelect | null> {
	if (todo.targetHostId) {
		const [host] = await dbWs
			.select()
			.from(v2Hosts)
			.where(
				and(
					eq(v2Hosts.organizationId, todo.organizationId),
					eq(v2Hosts.machineId, todo.targetHostId),
				),
			)
			.limit(1);
		return host ?? null;
	}

	const [host] = await dbWs
		.select({
			organizationId: v2Hosts.organizationId,
			machineId: v2Hosts.machineId,
			name: v2Hosts.name,
			isOnline: v2Hosts.isOnline,
			wakeCommand: v2Hosts.wakeCommand,
			createdByUserId: v2Hosts.createdByUserId,
			createdAt: v2Hosts.createdAt,
			updatedAt: v2Hosts.updatedAt,
		})
		.from(v2Hosts)
		.innerJoin(
			v2UsersHosts,
			and(
				eq(v2UsersHosts.organizationId, v2Hosts.organizationId),
				eq(v2UsersHosts.hostId, v2Hosts.machineId),
			),
		)
		.where(
			and(
				eq(v2UsersHosts.userId, todo.ownerUserId),
				eq(v2Hosts.organizationId, todo.organizationId),
				eq(v2Hosts.isOnline, true),
			),
		)
		.orderBy(v2Hosts.updatedAt)
		.limit(1);

	return host ?? null;
}

async function createWorkspaceForTodo(args: {
	relayUrl: string;
	hostId: string;
	jwt: string;
	projectId: string;
	todo: SelectTodo;
}): Promise<{ workspaceId: string; branchName: string }> {
	const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
	const baseSlug = slugifyForBranch(args.todo.title, 30);
	const candidateBranch = sanitizeBranchNameWithMaxLength(
		baseSlug ? `${baseSlug}-${timestamp}` : `todo-${timestamp}`,
		60,
	);
	const branchName = deduplicateBranchName(candidateBranch, []);
	const workspaceName = args.todo.title.slice(0, 100);

	const idempotencyKey = `todo-run:${args.todo.id}:workspace`;
	const response = await relayMutation<
		Record<string, unknown>,
		{
			operationId: string;
			operation: {
				id: string;
				state:
					| "queued"
					| "running"
					| "compensating"
					| "succeeded"
					| "failed"
					| "cancelled";
				workspaceId?: string;
				failure?: { code: string; message: string; retryable: boolean };
			};
		}
	>(
		{
			relayUrl: args.relayUrl,
			hostId: args.hostId,
			jwt: args.jwt,
			timeoutMs: 90_000,
		},
		"workspaceProvisioning.begin",
		{
			idempotencyKey,
			project: { kind: "existing", projectId: args.projectId },
			source: {
				kind: "branch",
				name: { kind: "explicit", value: branchName },
				from: { kind: "default" },
			},
			display: { name: workspaceName },
		},
	);

	const op = response.operation;
	if (op.state !== "succeeded" || !op.workspaceId) {
		const message =
			op.failure?.message ??
			`Provisioning operation ended in state ${op.state}`;
		throw new Error(message);
	}
	return { workspaceId: op.workspaceId, branchName };
}

async function runAgentOnHost(args: {
	relayUrl: string;
	hostId: string;
	jwt: string;
	workspaceId: string;
	agent: string;
	prompt: string;
}): Promise<AgentRunResult> {
	return relayMutation<
		{ workspaceId: string; agent: string; prompt: string },
		AgentRunResult
	>(
		{ relayUrl: args.relayUrl, hostId: args.hostId, jwt: args.jwt },
		"agents.run",
		{
			workspaceId: args.workspaceId,
			agent: args.agent,
			prompt: args.prompt,
		},
	);
}

function describeError(err: unknown, context: string): string {
	if (err instanceof RelayDispatchError) return `${context}: ${err.message}`;
	if (err instanceof Error) return `${context}: ${err.message}`;
	return `${context}: unknown error`;
}

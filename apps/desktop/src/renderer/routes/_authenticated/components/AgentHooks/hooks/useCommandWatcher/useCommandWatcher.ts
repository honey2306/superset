import { FEATURE_FLAGS } from "@superset/shared/constants";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import type { ProvisionWorkspaceRequest } from "@superset/workspace-client";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	useCatalogProjects,
	useCatalogWorkspaces,
} from "renderer/routes/_authenticated/providers/WorkspaceCatalogProvider/selectors";
import {
	useWorkspaceLaunch,
	useWorkspaceProvisioningAdapter,
} from "renderer/stores/workspace-launch";
import {
	type CreateWorktreeInput,
	executeTool,
	type ToolContext,
} from "./tools";

const COMMAND_PERSIST_RETRY_MS = 1_000;

interface ResolvedCommandState {
	status: "completed" | "failed" | "timeout";
	result?: Record<string, unknown>;
	error?: string;
	executedAt?: Date;
}

export function useCommandWatcher() {
	const navigate = useNavigate();
	const { activeHostUrl, machineId } = useLocalHostService();
	const relayUrl = useRelayUrl();
	const { workspaces: hostWorkspaces } = useHostWorkspaces();
	const { data: deviceInfo } = electronTrpc.auth.getDeviceInfo.useQuery();
	const { data: session } = authClient.useSession();
	const collections = useCollections();
	const isMountedRef = useRef(true);
	const handledCommandsRef = useRef(new Set<string>());
	const processingCommandsRef = useRef(new Set<string>());
	const persistingCommandsRef = useRef(new Set<string>());
	const pendingPersistenceRef = useRef(new Map<string, ResolvedCommandState>());
	const persistenceRetryTimersRef = useRef(
		new Map<string, ReturnType<typeof setTimeout>>(),
	);

	const organizationId = session?.session?.activeOrganizationId;
	const remoteAgentDisabled = useFeatureFlagEnabled(
		FEATURE_FLAGS.DISABLE_REMOTE_AGENT,
	);
	const shouldWatch = !!deviceInfo && !!organizationId && !remoteAgentDisabled;

	const provisioningAdapter = useWorkspaceProvisioningAdapter();
	const workspaceLaunch = useWorkspaceLaunch(provisioningAdapter);
	const setActive = useMemo(
		() => ({
			mutateAsync: async ({ workspaceId }: { workspaceId: string }) => {
				await navigateToWorkspace(workspaceId, navigate);
				return { success: true as const, workspaceId };
			},
		}),
		[navigate],
	);
	const terminalCreateOrAttach =
		electronTrpc.terminal.createOrAttach.useMutation();
	const terminalWrite = electronTrpc.terminal.write.useMutation();

	const { workspaces: catalogWorkspaces, isReady: workspacesReady } =
		useCatalogWorkspaces();
	const { projects: catalogProjects, isReady: projectsReady } =
		useCatalogProjects();
	const workspaceHostUrls = useMemo(() => {
		const urls = new Map<string, string>();
		for (const workspace of hostWorkspaces) {
			if (workspace.hostId === machineId) {
				if (activeHostUrl) urls.set(workspace.id, activeHostUrl);
				continue;
			}
			urls.set(
				workspace.id,
				`${relayUrl}/hosts/${buildHostRoutingKey(workspace.organizationId, workspace.hostId)}`,
			);
		}
		return urls;
	}, [activeHostUrl, hostWorkspaces, machineId, relayUrl]);
	const workspaces = useMemo(() => {
		if (!workspacesReady && catalogWorkspaces.length === 0) return undefined;
		return catalogWorkspaces.map((workspace) => ({
			id: workspace.id,
			name: workspace.name,
			branch: workspace.branch,
			projectId: workspace.projectId,
			type:
				workspace.type === "main" ? ("branch" as const) : ("worktree" as const),
		}));
	}, [catalogWorkspaces, workspacesReady]);
	const mainBranchByProjectId = useMemo(
		() =>
			new Map(
				catalogWorkspaces
					.filter((workspace) => workspace.type === "main")
					.map((workspace) => [workspace.projectId, workspace.branch]),
			),
		[catalogWorkspaces],
	);
	const projects = useMemo(() => {
		if (!projectsReady && catalogProjects.length === 0) return undefined;
		return catalogProjects.map((project) => ({
			id: project.id,
			name: project.name,
			mainRepoPath: project.repoPath,
			defaultBranch: mainBranchByProjectId.get(project.id) ?? null,
			workspaceBaseBranch: mainBranchByProjectId.get(project.id) ?? null,
			color: null,
			lastOpenedAt: null,
			tabOrder: null,
		}));
	}, [catalogProjects, mainBranchByProjectId, projectsReady]);
	const worktreePathByWorkspaceId = useMemo(() => {
		const pathByWorkspaceId = new Map<string, string>();

		for (const workspace of catalogWorkspaces) {
			if (workspace.worktreePath) {
				pathByWorkspaceId.set(workspace.id, workspace.worktreePath);
			}
		}

		return pathByWorkspaceId;
	}, [catalogWorkspaces]);
	const refetchWorkspaces = useCallback(async () => undefined, []);
	const hostUrlForWorkspace = useCallback(
		(workspaceId: string) => {
			const knownHostUrl = workspaceHostUrls.get(workspaceId);
			if (knownHostUrl) return knownHostUrl;
			if (
				activeHostUrl &&
				catalogWorkspaces.some((workspace) => workspace.id === workspaceId)
			) {
				return activeHostUrl;
			}
			return null;
		},
		[activeHostUrl, catalogWorkspaces, workspaceHostUrls],
	);
	const deleteWorkspace = useMemo(
		() => ({
			mutateAsync: async (input: {
				id: string;
				deleteLocalBranch?: boolean;
				force?: boolean;
			}) => {
				const hostUrl = hostUrlForWorkspace(input.id);
				if (!hostUrl) {
					throw new Error("Workspace host is unavailable");
				}
				return getHostServiceClientByUrl(
					hostUrl,
				).workspaceCleanup.destroy.mutate({
					workspaceId: input.id,
					deleteBranch: input.deleteLocalBranch ?? false,
					force: input.force ?? false,
				});
			},
		}),
		[hostUrlForWorkspace],
	);
	const updateWorkspace = useMemo(
		() => ({
			mutateAsync: async (input: {
				id: string;
				patch: {
					name?: string;
					branch?: string;
					taskId?: string | null;
				};
			}) => {
				const hostUrl = hostUrlForWorkspace(input.id);
				if (!hostUrl) {
					throw new Error("Workspace host is unavailable");
				}
				return getHostServiceClientByUrl(hostUrl).workspace.update.mutate({
					id: input.id,
					...input.patch,
				});
			},
		}),
		[hostUrlForWorkspace],
	);

	const getCurrentWorkspaceIdFromRoute = useCallback(() => {
		const hash = window.location.hash;
		const pathname = hash.startsWith("#") ? hash.slice(1) : hash;
		const match = pathname.match(/\/workspace\/([^/]+)/);
		return match ? match[1] : null;
	}, []);

	const createWorktree = useCallback(
		async (input: CreateWorktreeInput) => {
			if (!provisioningAdapter) {
				throw new Error("Workspace host is not available");
			}

			const sourceWorkspace = input.sourceWorkspaceId
				? workspaces?.find(
						(workspace) => workspace.id === input.sourceWorkspaceId,
					)
				: undefined;
			const baseBranch = input.compareBaseBranch ?? sourceWorkspace?.branch;
			const source: ProvisionWorkspaceRequest["source"] = {
				kind: "branch",
				name: input.branchName
					? { kind: "explicit", value: input.branchName }
					: { kind: "generated", prompt: input.name },
				from: baseBranch
					? { kind: "ref", value: baseBranch }
					: { kind: "default" },
			};
			const operation = await workspaceLaunch.begin({
				adapter: provisioningAdapter,
				request: {
					idempotencyKey: `command-workspace:${input.projectId}:${input.branchName ?? input.name ?? "generated"}:${baseBranch ?? "default"}`,
					project: { kind: "existing", projectId: input.projectId },
					source,
					display: input.name ? { name: input.name } : undefined,
				},
			});
			if (operation.state === "failed" || !operation.workspaceId) {
				throw new Error(
					operation.failure?.message ?? "Workspace provisioning failed",
				);
			}

			const workspace = workspaces?.find(
				(candidate) => candidate.id === operation.workspaceId,
			);
			return {
				workspace: {
					id: operation.workspaceId,
					name: workspace?.name ?? input.name ?? "Workspace",
					branch: workspace?.branch ?? input.branchName ?? "",
				},
				worktreePath:
					worktreePathByWorkspaceId.get(operation.workspaceId) ?? "",
				wasExisting: operation.disposition === "reused",
			};
		},
		[
			provisioningAdapter,
			workspaceLaunch,
			workspaces,
			worktreePathByWorkspaceId,
		],
	);

	const toolContext: ToolContext = useMemo(
		() => ({
			hostUrl: activeHostUrl,
			createWorktree,
			setActive,
			deleteWorkspace,
			updateWorkspace,
			terminalCreateOrAttach,
			terminalWrite,
			// Catalog changes arrive through the host event stream. Keep this
			// compatibility callback for handlers that still await a refresh.
			refetchWorkspaces,
			getWorkspaces: () => workspaces,
			getProjects: () => projects,
			getActiveWorkspaceId: getCurrentWorkspaceIdFromRoute,
			getWorktreePathByWorkspaceId: (workspaceId) =>
				worktreePathByWorkspaceId.get(workspaceId),
		}),
		[
			activeHostUrl,
			createWorktree,
			setActive,
			deleteWorkspace,
			updateWorkspace,
			terminalCreateOrAttach,
			terminalWrite,
			refetchWorkspaces,
			workspaces,
			projects,
			getCurrentWorkspaceIdFromRoute,
			worktreePathByWorkspaceId,
		],
	);

	const { data: pendingCommands } = useLiveQuery(
		(q) =>
			q
				.from({ commands: collections.agentCommands })
				.where(({ commands }) => eq(commands.status, "pending"))
				.select(({ commands }) => ({ ...commands })),
		[collections.agentCommands],
	);

	const persistResolvedCommand = useCallback(
		async (commandId: string) => {
			if (!isMountedRef.current) return;

			const resolved = pendingPersistenceRef.current.get(commandId);
			if (!resolved || persistingCommandsRef.current.has(commandId)) return;

			const existingRetryTimer =
				persistenceRetryTimersRef.current.get(commandId);
			if (existingRetryTimer) {
				clearTimeout(existingRetryTimer);
				persistenceRetryTimersRef.current.delete(commandId);
			}

			persistingCommandsRef.current.add(commandId);

			try {
				const tx = collections.agentCommands.update(commandId, (draft) => {
					draft.status = resolved.status;
					draft.result = resolved.result ?? null;
					draft.error = resolved.error ?? null;
					draft.executedAt = resolved.executedAt ?? null;
				});
				await tx.isPersisted.promise;
				pendingPersistenceRef.current.delete(commandId);
			} catch (error) {
				console.error(
					`[command-watcher] Failed to persist ${resolved.status}: ${commandId}`,
					error,
				);

				if (
					isMountedRef.current &&
					!persistenceRetryTimersRef.current.has(commandId)
				) {
					const retryTimer = setTimeout(() => {
						persistenceRetryTimersRef.current.delete(commandId);
						void persistResolvedCommand(commandId);
					}, COMMAND_PERSIST_RETRY_MS);
					persistenceRetryTimersRef.current.set(commandId, retryTimer);
				}
			} finally {
				persistingCommandsRef.current.delete(commandId);
			}
		},
		[collections.agentCommands],
	);

	useEffect(() => {
		return () => {
			isMountedRef.current = false;
			for (const timer of persistenceRetryTimersRef.current.values()) {
				clearTimeout(timer);
			}
			persistenceRetryTimersRef.current.clear();
		};
	}, []);

	const processCommand = useCallback(
		async (
			commandId: string,
			tool: string,
			params: Record<string, unknown> | null,
		) => {
			if (
				handledCommandsRef.current.has(commandId) ||
				processingCommandsRef.current.has(commandId)
			) {
				if (pendingPersistenceRef.current.has(commandId)) {
					void persistResolvedCommand(commandId);
				}
				return;
			}

			processingCommandsRef.current.add(commandId);
			console.log(`[command-watcher] Processing: ${commandId} (${tool})`);

			let resolvedState: ResolvedCommandState;
			try {
				const result = await executeTool(tool, params, toolContext);

				if (result.success) {
					resolvedState = {
						status: "completed",
						result: result.data ?? {},
						executedAt: new Date(),
					};
				} else {
					const itemErrors = (
						result.data?.errors as Array<{ error: string }> | undefined
					)
						?.map((e) => e.error)
						.join("; ");
					const fullError = itemErrors
						? `${result.error ?? "Unknown error"}: ${itemErrors}`
						: (result.error ?? "Unknown error");

					resolvedState = {
						status: "failed",
						error: fullError,
						executedAt: new Date(),
					};
					console.error(
						`[command-watcher] Failed: ${commandId}`,
						fullError,
						result.data,
					);
				}
			} catch (error) {
				console.error(`[command-watcher] Error: ${commandId}`, error);
				const errorMsg =
					error instanceof Error ? error.message : "Execution error";
				resolvedState = {
					status: "failed",
					error: errorMsg,
					executedAt: new Date(),
				};
			} finally {
				processingCommandsRef.current.delete(commandId);
			}

			handledCommandsRef.current.add(commandId);
			pendingPersistenceRef.current.set(commandId, resolvedState);
			void persistResolvedCommand(commandId);
		},
		[persistResolvedCommand, toolContext],
	);

	useEffect(() => {
		if (
			!shouldWatch ||
			!deviceInfo?.deviceId ||
			!pendingCommands ||
			!organizationId
		) {
			return;
		}

		const now = new Date();
		const handledCommands = handledCommandsRef.current;
		const processingCommands = processingCommandsRef.current;

		// Expire timed-out commands before filtering for execution
		for (const cmd of pendingCommands) {
			if (cmd.targetDeviceId !== deviceInfo.deviceId) continue;
			if (cmd.organizationId !== organizationId) continue;
			if (processingCommands.has(cmd.id)) continue;
			if (handledCommands.has(cmd.id)) {
				if (pendingPersistenceRef.current.has(cmd.id)) {
					void persistResolvedCommand(cmd.id);
				}
				continue;
			}
			if (cmd.timeoutAt && new Date(cmd.timeoutAt) < now) {
				handledCommands.add(cmd.id);
				pendingPersistenceRef.current.set(cmd.id, {
					status: "timeout",
					error: "Command expired before execution",
				});
				void persistResolvedCommand(cmd.id);
			}
		}

		const commandsForThisDevice = pendingCommands.filter((cmd) => {
			if (cmd.targetDeviceId !== deviceInfo.deviceId) return false;
			if (processingCommands.has(cmd.id)) return false;
			if (handledCommands.has(cmd.id)) {
				if (pendingPersistenceRef.current.has(cmd.id)) {
					void persistResolvedCommand(cmd.id);
				}
				return false;
			}

			// Security: verify org matches (don't trust Electric filtering alone)
			if (cmd.organizationId !== organizationId) {
				console.warn(`[command-watcher] Org mismatch for ${cmd.id}`);
				return false;
			}

			return true;
		});

		for (const cmd of commandsForThisDevice) {
			processCommand(cmd.id, cmd.tool, cmd.params);
		}
	}, [
		shouldWatch,
		deviceInfo?.deviceId,
		organizationId,
		pendingCommands,
		processCommand,
		persistResolvedCommand,
	]);

	return {
		isWatching: shouldWatch && !!deviceInfo?.deviceId,
		deviceId: deviceInfo?.deviceId,
		pendingCount:
			pendingCommands?.filter(
				(cmd) => cmd.targetDeviceId === deviceInfo?.deviceId,
			).length ?? 0,
	};
}

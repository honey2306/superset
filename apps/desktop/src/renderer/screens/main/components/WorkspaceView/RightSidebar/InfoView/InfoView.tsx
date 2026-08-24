import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { LuArrowUpRight, LuSquare } from "react-icons/lu";
import { navigateToWorkspace } from "renderer/routes/_local/_dashboard/utils/workspace-navigation";
import { formatDelegationRunElapsed } from "./formatDelegationRun";

const ACTIVE_STATUSES = new Set(["creating", "running"]);

const STATUS_LABELS: Record<string, string> = {
	creating: "Starting",
	running: "Running",
	completed: "Completed",
	cancelled: "Cancelled",
	interrupted: "Interrupted",
	failed: "Failed",
};

const STATUS_CLASSES: Record<string, string> = {
	creating: "text-warning",
	running: "text-success",
	completed: "text-success",
	cancelled: "text-fg-mute",
	interrupted: "text-warning",
	failed: "text-destructive",
};

function shortSessionId(sessionId: string): string {
	return sessionId.length > 12 ? `${sessionId.slice(0, 8)}…` : sessionId;
}

function formatTimestamp(value: number): string {
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: "short",
		timeStyle: "short",
	}).format(value);
}

export function InfoView({ workspaceId }: { workspaceId: string | null }) {
	const navigate = useNavigate();
	const [now, setNow] = useState(() => Date.now());
	const [stoppingRunIds, setStoppingRunIds] = useState<Set<string>>(
		() => new Set(),
	);
	const runsQuery = workspaceTrpc.acpSessions.listDelegationRuns.useQuery(
		{ workspaceId: workspaceId ?? "", limit: 100 },
		{
			enabled: workspaceId !== null,
			refetchInterval: workspaceId === null ? false : 2_000,
		},
	);
	const stopRun = workspaceTrpc.acpSessions.stopDelegationRun.useMutation({
		onMutate: ({ runId }) => {
			setStoppingRunIds((current) => new Set(current).add(runId));
			return { runId };
		},
		onSuccess: () => {
			void runsQuery.refetch();
		},
		onError: (error) => {
			toast.error(`Failed to stop background task: ${error.message}`);
		},
		onSettled: (_data, _error, variables) => {
			if (!variables) return;
			setStoppingRunIds((current) => {
				const next = new Set(current);
				next.delete(variables.runId);
				return next;
			});
		},
	});

	const runs = runsQuery.data ?? [];
	const hasActiveRuns = useMemo(
		() => runs.some((run) => ACTIVE_STATUSES.has(run.status)),
		[runs],
	);

	useEffect(() => {
		if (!hasActiveRuns) return;
		const interval = window.setInterval(() => setNow(Date.now()), 1_000);
		return () => window.clearInterval(interval);
	}, [hasActiveRuns]);

	const openSession = async (targetWorkspaceId: string, sessionId: string) => {
		try {
			await navigateToWorkspace(targetWorkspaceId, navigate, {
				search: {
					acpSessionId: sessionId,
					focusRequestId: crypto.randomUUID(),
				},
			});
		} catch (error) {
			toast.error(
				`Failed to open conversation: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	};

	if (workspaceId === null) {
		return (
			<div className="flex h-full items-center justify-center px-4 text-center text-xs text-fg-mute">
				Select a workspace to view background tasks.
			</div>
		);
	}

	if (runsQuery.isLoading) {
		return (
			<div className="p-4 text-xs text-fg-mute">Loading background tasks…</div>
		);
	}

	if (runsQuery.isError) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-xs text-fg-mute">
				<span>Could not load background tasks.</span>
				<Button
					variant="secondary"
					size="sm"
					onClick={() => void runsQuery.refetch()}
				>
					Retry
				</Button>
			</div>
		);
	}

	if (runs.length === 0) {
		return (
			<div className="flex h-full items-center justify-center px-4 text-center text-xs text-fg-mute">
				No background tasks for this workspace.
			</div>
		);
	}

	return (
		<div className="h-full overflow-y-auto p-2">
			<div className="flex flex-col gap-2">
				{runs.map((run) => {
					const isActive = ACTIVE_STATUSES.has(run.status);
					const statusLabel = STATUS_LABELS[run.status] ?? run.status;
					const statusClass = STATUS_CLASSES[run.status] ?? "text-fg-mute";
					return (
						<div
							key={run.id}
							className="rounded-ds-3 border border-border bg-background px-3 py-2.5"
						>
							<div className="flex items-start gap-2">
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-1.5 text-[11px]">
										<span className={`font-medium ${statusClass}`}>
											{statusLabel}
										</span>
										<span className="text-fg-faint">·</span>
										<span className="text-fg-mute">
											{formatDelegationRunElapsed(
												{
													status: run.status,
													createdAt: run.createdAt,
													startedAt: run.startedAt,
													updatedAt: run.updatedAt,
												},
												now,
											)}
										</span>
									</div>
									<div className="mt-0.5 text-[10px] text-fg-faint">
										{isActive
											? `Started ${formatTimestamp(run.startedAt ?? run.createdAt)}`
											: `Finished ${formatTimestamp(run.updatedAt)}`}
									</div>
									<div className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-xs leading-5 text-fg">
										{run.handoff}
									</div>
									{(run.actualAgent || run.actualModel) && (
										<div className="mt-1 truncate text-[11px] text-fg-mute">
											{[run.actualAgent, run.actualModel]
												.filter(Boolean)
												.join(" · ")}
										</div>
									)}
									{run.failureMessage && (
										<div className="mt-1 line-clamp-2 break-words text-[11px] text-destructive">
											{run.failureMessage}
										</div>
									)}
								</div>
								{isActive && (
									<Button
										variant="ghost"
										size="icon"
										className="size-6 shrink-0 text-fg-mute hover:text-destructive"
										disabled={stoppingRunIds.has(run.id)}
										aria-busy={stoppingRunIds.has(run.id)}
										aria-label="Stop background task"
										onClick={() => stopRun.mutate({ runId: run.id })}
									>
										<LuSquare className="size-3.5" />
									</Button>
								)}
							</div>

							<div className="mt-2 flex flex-wrap items-center gap-1.5">
								{run.parentSessionId && run.parentWorkspaceId && (
									<Button
										variant="ghost"
										size="sm"
										className="h-6 px-1.5 text-[11px] text-fg-mute"
										onClick={() =>
											void openSession(
												run.parentWorkspaceId,
												run.parentSessionId,
											)
										}
									>
										Parent {shortSessionId(run.parentSessionId)}
										<LuArrowUpRight className="ml-0.5 size-3" />
									</Button>
								)}
								{run.childSessionId && run.childWorkspaceId && (
									<Button
										variant="secondary"
										size="sm"
										className="h-6 px-1.5 text-[11px]"
										onClick={() =>
											void openSession(run.childWorkspaceId, run.childSessionId)
										}
									>
										Open child {shortSessionId(run.childSessionId)}
										<LuArrowUpRight className="ml-0.5 size-3" />
									</Button>
								)}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

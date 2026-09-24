import { getAcpAgentLabel } from "@superset/shared/agent-catalog";
import { isTaskTerminal } from "@superset/shared/tasks";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Textarea } from "@superset/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Activity,
	Folder,
	ListChecks,
	MessageSquare,
	MoreHorizontal,
	Pause,
	RotateCcw,
	ShieldCheck,
	Trash2,
	X,
} from "lucide-react";
import { useId, useState } from "react";
import { TaskStatusBadge } from "renderer/components/TaskStatusBadge";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { managedTaskKeys } from "../../task-types";
import { TaskExecution } from "../TaskExecution/TaskExecution";
import { TaskDeliveryRecords } from "./components/TaskDeliveryRecords/TaskDeliveryRecords";
import { TaskGuidanceComposer } from "./components/TaskGuidanceComposer";

type Action =
	| "pause"
	| "cancel"
	| "resume"
	| "retry"
	| "accept"
	| "remove"
	| "retryDelivery"
	| "reconcileDelivery"
	| "revokeDelivery";
export function TaskDetail({
	hostUrl,
	taskId,
	onRemoved,
}: {
	hostUrl: string;
	taskId: string;
	onRemoved(): void;
}) {
	const { t } = useTranslation();
	const client = getHostServiceClientByUrl(hostUrl);
	const queryClient = useQueryClient();
	const id = useId();
	const [instruction, setInstruction] = useState("");
	const [removing, setRemoving] = useState(false);
	const [tab, setTab] = useState<"result" | "timeline">("result");
	const detail = useQuery({
		queryKey: managedTaskKeys.detail(hostUrl, taskId),
		queryFn: () => client.tasks.get.query({ id: taskId }),
		refetchInterval: (query) => {
			const run = query.state.data?.run;
			return run &&
				!isTaskTerminal(run.status) &&
				run.status !== "paused" &&
				run.status !== "awaiting_review"
				? 1_000
				: false;
		},
	});
	const run = detail.data?.run;
	const action = useMutation({
		mutationFn: async (kind: Action) => {
			if (!run) throw new Error("No task run");
			if (kind === "retryDelivery")
				return client.tasks.retryDelivery.mutate({ runId: run.id });
			if (kind === "reconcileDelivery")
				return client.tasks.reconcileDelivery.mutate({ runId: run.id });
			if (kind === "revokeDelivery")
				return client.tasks.revokeDelivery.mutate({ runId: run.id });
			if (kind === "remove") return client.tasks.remove.mutate({ id: taskId });
			if (kind === "retry")
				return client.tasks.retry.mutate({
					taskId,
					runId: crypto.randomUUID(),
				});
			if (kind === "resume")
				return client.tasks.resume.mutate({ runId: run.id, instruction });
			if (kind === "accept")
				return client.tasks.accept.mutate({ runId: run.id });
			if (kind === "pause") return client.tasks.pause.mutate({ runId: run.id });
			return client.tasks.cancel.mutate({ runId: run.id });
		},
		onSuccess: async (_, kind) => {
			if (kind === "remove") {
				await queryClient.invalidateQueries({
					queryKey: managedTaskKeys.list(hostUrl),
				});
				onRemoved();
				return;
			}
			if (kind === "resume") setInstruction("");
		},
		onSettled: () => {
			void queryClient.invalidateQueries({
				queryKey: managedTaskKeys.all(hostUrl),
			});
		},
	});
	if (detail.error)
		return (
			<div className="p-6">
				<p role="alert" className="select-text cursor-text text-destructive">
					{detail.error.message}
				</p>
				<Button variant="outline" onClick={() => void detail.refetch()}>
					{t("agentTasks.retryLoad")}
				</Button>
			</div>
		);
	if (!detail.data || !run)
		return (
			<p className="p-6 text-muted-foreground">{t("agentTasks.loading")}</p>
		);
	const data = detail.data;
	const stopping = run.status === "pausing" || run.status === "cancelling";
	const canContinue =
		run.phase !== "delivering" &&
		["paused", "blocked", "awaiting_review"].includes(run.status) &&
		!run.leasePath;
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<AlertDialog open={removing} onOpenChange={setRemoving}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("agentTasks.remove")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("agentTasks.removeDescription")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("agentTasks.close")}</AlertDialogCancel>
						<AlertDialogAction onClick={() => action.mutate("remove")}>
							{t("agentTasks.remove")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
			<header className="task-detail__header">
				<div className="mb-3 flex flex-wrap items-center gap-2">
					<TaskStatusBadge status={run.status} />
					<span className="text-[11px] text-muted-foreground">
						{getAcpAgentLabel(run.contract.harness)}
						<span className="mx-2 opacity-40">/</span>
						{t(
							`agentTasks.strategy.${run.effectiveStrategy ?? run.contract.strategy}`,
						)}
					</span>
				</div>
				<h2 className="select-text cursor-text break-words text-[17px] font-semibold leading-7">
					{data.task.title}
				</h2>
				<div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
					<Folder className="size-3 shrink-0" />
					<span className="truncate select-text cursor-text" title={run.cwd}>
						{run.cwd}
					</span>
				</div>
				<div className="mt-4 flex flex-wrap items-center gap-2">
					<Button asChild size="sm" className="gap-1.5">
						<a
							href={`#/workspace/${encodeURIComponent(data.task.workspaceId)}?acpSessionId=${encodeURIComponent(run.sessionId)}&focusRequestId=${encodeURIComponent(run.id)}`}
						>
							<MessageSquare className="size-3.5" />
							{t("taskChat.openChat")}
						</a>
					</Button>
					{run.status === "awaiting_review" && (
						<Button
							size="sm"
							variant="outline"
							disabled={action.isPending}
							onClick={() => action.mutate("accept")}
						>
							<ShieldCheck className="mr-1.5 size-3.5" />
							{t("agentTasks.accept")}
						</Button>
					)}
					{run.phase === "delivering" && !isTaskTerminal(run.status) && (
						<>
							<Button
								size="sm"
								variant="outline"
								disabled={action.isPending}
								onClick={() => action.mutate("reconcileDelivery")}
							>
								{t("agentTasks.deliveryReconcile")}
							</Button>
							{["blocked", "paused"].includes(run.status) &&
								!run.deliveryRevoked && (
									<Button
										size="sm"
										variant="outline"
										disabled={action.isPending}
										onClick={() => action.mutate("retryDelivery")}
									>
										{t("agentTasks.deliveryRetry")}
									</Button>
								)}
						</>
					)}
					{!isTaskTerminal(run.status) &&
						!stopping &&
						run.status !== "paused" && (
							<Button
								size="sm"
								variant="ghost"
								disabled={action.isPending}
								onClick={() => action.mutate("pause")}
							>
								<Pause className="mr-1 size-3.5" />
								{t("agentTasks.pause")}
							</Button>
						)}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								size="icon"
								variant="ghost"
								className="ml-auto size-8"
								aria-label={t("taskUi.more")}
								disabled={action.isPending}
							>
								<MoreHorizontal className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							{isTaskTerminal(run.status) && !data.operations.length && (
								<DropdownMenuItem onSelect={() => action.mutate("retry")}>
									<RotateCcw className="mr-2 size-3.5" />
									{t("agentTasks.retry")}
								</DropdownMenuItem>
							)}
							{run.contract.delivery?.mode &&
								run.contract.delivery.mode !== "none" &&
								!run.deliveryRevoked &&
								!isTaskTerminal(run.status) && (
									<DropdownMenuItem
										onSelect={() => action.mutate("revokeDelivery")}
									>
										{t("agentTasks.deliveryRevoke")}
									</DropdownMenuItem>
								)}
							{!isTaskTerminal(run.status) && (
								<DropdownMenuItem
									disabled={run.status === "cancelling"}
									onSelect={() => action.mutate("cancel")}
									className="text-destructive"
								>
									<X className="mr-2 size-3.5" />
									{t("agentTasks.cancel")}
								</DropdownMenuItem>
							)}
							{isTaskTerminal(run.status) && (
								<>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										onSelect={() => setRemoving(true)}
										className="text-destructive"
									>
										<Trash2 className="mr-2 size-3.5" />
										{t("agentTasks.remove")}
									</DropdownMenuItem>
								</>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
				{run.reason &&
					["blocked", "failed", "recovering"].includes(run.status) && (
						<p className="mt-3 max-h-24 overflow-auto select-text cursor-text whitespace-pre-wrap rounded-md bg-[var(--warning-tint)] px-3 py-2 text-xs leading-5 text-[var(--warning)]">
							{run.reason}
						</p>
					)}
				{action.error && (
					<p
						role="alert"
						className="mt-3 select-text cursor-text text-xs text-destructive"
					>
						{action.error.message}
					</p>
				)}
				<div
					className="task-detail__tabs"
					role="tablist"
					aria-label={t("agentTasks.title")}
				>
					{(["result", "timeline"] as const).map((value) => (
						<button
							key={value}
							type="button"
							role="tab"
							aria-selected={tab === value}
							className="task-detail__tab"
							onClick={() => setTab(value)}
						>
							<span className="flex items-center gap-1.5">
								{value === "result" ? (
									<ListChecks className="size-3.5" />
								) : (
									<Activity className="size-3.5" />
								)}
								{t(`agentTasks.${value}`)}
							</span>
						</button>
					))}
				</div>
			</header>
			{tab === "timeline" ? (
				<div className="min-h-0 flex-1">
					<TaskExecution key={run.sessionId} hostUrl={hostUrl} run={run} />
				</div>
			) : (
				<div className="task-detail__content space-y-4">
					<TaskDeliveryRecords operations={data.operations} />
					{run.phase === "delivering" && !isTaskTerminal(run.status) && (
						<p className="text-sm text-muted-foreground">
							{t("agentTasks.deliveryPausedHint")}
						</p>
					)}
					<section className="task-detail__section">
						<h3 className="mb-2 font-medium">{t("agentTasks.goal")}</h3>
						<p className="select-text cursor-text whitespace-pre-wrap text-sm">
							{run.contract.goal}
						</p>
						{run.contract.acceptance && (
							<p className="mt-3 select-text cursor-text whitespace-pre-wrap text-sm text-muted-foreground">
								{run.contract.acceptance}
							</p>
						)}
					</section>
					{data.guidance.length > 0 && (
						<section className="space-y-2 rounded-lg border p-3">
							<h3 className="text-sm font-medium">
								{t("agentTasks.guidanceHistory")}
							</h3>
							{data.guidance.map((item) => (
								<div key={item.id}>
									<p className="text-xs text-muted-foreground">
										v{item.revision} · {t(`agentTasks.guidance.${item.status}`)}
										{item.deliveryMode &&
											` · ${t(`agentTasks.delivery.${item.deliveryMode}`)}`}
									</p>
									<p className="select-text cursor-text whitespace-pre-wrap text-sm">
										{item.text}
									</p>
								</div>
							))}
						</section>
					)}
					{run.candidate && (
						<section className="task-detail__section">
							<h3 className="font-medium">{t("agentTasks.result")}</h3>
							<p className="mt-1 text-xs text-muted-foreground">
								{t("agentTasks.reported")}
							</p>
							<p className="mt-3 select-text cursor-text whitespace-pre-wrap text-sm">
								{run.candidate.summary}
							</p>
							{run.candidate.remaining && (
								<p className="mt-2 select-text cursor-text text-sm text-warning">
									{run.candidate.remaining}
								</p>
							)}
						</section>
					)}
					{run.candidate?.criteria?.length ? (
						<section className="task-detail__section space-y-2">
							<h3 className="font-medium">{t("taskChat.coverage")}</h3>
							<p className="text-xs text-muted-foreground">
								{t("taskChat.claimed")}
							</p>
							{run.candidate.criteria.map((item) => (
								<div key={item.id} className="text-sm">
									<strong>
										{item.id} ·{" "}
										{t(
											item.status === "satisfied"
												? "taskChat.criterionSatisfied"
												: item.status === "unfinished"
													? "taskChat.criterionUnfinished"
													: "taskChat.criterionUnverified",
										)}
									</strong>
									<p className="select-text cursor-text whitespace-pre-wrap text-xs text-muted-foreground">
										{item.evidence} {item.checkIds.join(", ")}
									</p>
								</div>
							))}
						</section>
					) : null}
					{run.completionSource && (
						<p className="text-sm text-success">
							{t(
								run.completionSource === "checks"
									? "agentTasks.confirmedChecks"
									: "agentTasks.confirmedUser",
							)}
						</p>
					)}
					<section className="space-y-2">
						<div className="flex items-center justify-between">
							<h3 className="font-medium">{t("agentTasks.checkResults")}</h3>
							<span className="text-xs text-muted-foreground">
								{t("agentTasks.iteration", { count: run.repairCount })}
							</span>
						</div>
						{!data.checks.length && (
							<p className="text-sm text-muted-foreground">
								{t("agentTasks.noChecks")}
							</p>
						)}
						{data.checks.map((check) => (
							<details key={check.id} className="rounded-md border p-3">
								<summary className="cursor-pointer text-sm">
									<span
										className={
											check.status === "passed"
												? "text-success"
												: check.status === "failed" || check.status === "stale"
													? "text-destructive"
													: "text-muted-foreground"
										}
									>
										{t(`agentTasks.checkStatus.${check.status}`)}
									</span>{" "}
									· {check.name} · #{check.iteration + 1}
								</summary>
								<p className="mt-2 select-text cursor-text break-all font-mono text-xs">
									{check.command}
								</p>
								{check.selectionReason && (
									<p className="mt-1 text-xs text-muted-foreground">
										{check.selectionReason} · v{check.revision}
									</p>
								)}
								<p className="mt-1 text-xs text-muted-foreground">
									Exit: {check.exitCode ?? "—"} · PID: {check.pid ?? "—"} ·{" "}
									{check.endedAt
										? `${check.endedAt - check.startedAt} ms`
										: "…"}
								</p>
								<p className="mt-3 text-xs text-muted-foreground">
									{t("agentTasks.checkLog")}
								</p>
								<pre className="mt-1 max-h-64 select-text cursor-text overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-3 text-xs">
									{check.output || "—"}
								</pre>
							</details>
						))}
					</section>
					{canContinue && (
						<section className="task-detail__section space-y-2">
							<label
								htmlFor={`${id}-instruction`}
								className="text-sm font-medium"
							>
								{t("agentTasks.instruction")}
							</label>
							<Textarea
								id={`${id}-instruction`}
								value={instruction}
								onChange={(event) => setInstruction(event.target.value)}
								placeholder={t("agentTasks.instructionPlaceholder")}
								maxLength={12_000}
							/>
							<Button
								size="sm"
								disabled={action.isPending}
								onClick={() => action.mutate("resume")}
							>
								{t("agentTasks.resume")}
							</Button>
						</section>
					)}
					<details className="rounded-lg border p-4">
						<summary className="cursor-pointer text-xs font-medium text-muted-foreground">
							{t("taskUi.runtimeDetails")}
						</summary>
						<div className="mt-3 space-y-3 text-xs text-muted-foreground">
							<p>
								{t(`agentTasks.phase.${run.phase}`)} ·{" "}
								{t(
									`agentTasks.delivery.${run.contract.delivery?.mode ?? "none"}`,
								)}
							</p>
							<p>
								{t("agentTasks.requirementsRevision", {
									revision: run.revision,
								})}
								{run.profile &&
									` · ${t("agentTasks.profileSummary", { revision: run.profile.revision, count: run.profile.config.checks.length })}`}
							</p>
							{run.policyReason && (
								<p className="select-text cursor-text">{run.policyReason}</p>
							)}
							{run.metrics && (
								<section className="rounded-lg border p-3">
									<h3 className="mb-2 text-sm font-medium">
										{t("agentTasks.metrics")}
									</h3>
									<div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
										{(
											[
												"preparingMs",
												"executingMs",
												"verifyingMs",
												"deliveringMs",
												"snapshotsMs",
											] as const
										).map((key) => (
											<span key={key}>
												{t(`agentTasks.${key}`)}:{" "}
												{((run.metrics?.[key] ?? 0) / 1000).toFixed(1)}s
											</span>
										))}
									</div>
								</section>
							)}
							{run.selectedChecks && (
								<section className="space-y-1">
									<h3 className="text-sm font-medium">
										{t("agentTasks.selectedChecks")}
									</h3>
									{run.selectedChecks.map((check) => (
										<p
											key={check.key}
											className="text-xs text-muted-foreground"
										>
											{check.name}: {check.reason}
										</p>
									))}
								</section>
							)}
						</div>
					</details>
					<details className="rounded-md border p-3">
						<summary className="cursor-pointer text-sm">
							{t("agentTasks.events")}
						</summary>
						<div className="mt-3 space-y-2">
							{data.events.map((event) => (
								<p key={event.id} className="select-text cursor-text text-xs">
									<time className="mr-2 text-muted-foreground">
										{new Date(event.createdAt).toLocaleTimeString()}
									</time>
									{event.message}
								</p>
							))}
						</div>
					</details>
					<details className="rounded-md border p-3">
						<summary className="cursor-pointer text-sm">
							{t("agentTasks.history")} ({data.runs.length})
						</summary>
						<div className="mt-3 space-y-2">
							{data.runs.map((previous) => (
								<p key={previous.id} className="text-xs">
									{new Date(previous.createdAt).toLocaleString()} ·{" "}
									{t(`agentTasks.status.${previous.status}`)} ·{" "}
									<span className="select-text cursor-text font-mono">
										{previous.id.slice(0, 8)}
									</span>
								</p>
							))}
						</div>
					</details>
				</div>
			)}
			{!isTaskTerminal(run.status) && !run.fromConversation && (
				<div className="shrink-0 border-t p-3">
					{run.phase !== "delivering" && (
						<TaskGuidanceComposer key={run.id} hostUrl={hostUrl} run={run} />
					)}
				</div>
			)}
		</div>
	);
}

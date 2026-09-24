import { getAcpAgentLabel } from "@superset/shared/agent-catalog";
import { isTaskTerminal } from "@superset/shared/tasks";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useQuery } from "@tanstack/react-query";
import {
	ArrowLeft,
	ArrowRight,
	ChevronRight,
	CircleCheck,
	Info,
	MessageSquare,
	Plus,
	Search,
	Target,
	Zap,
} from "lucide-react";
import { useState } from "react";
import { TaskStatusBadge } from "renderer/components/TaskStatusBadge";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import {
	useCatalogProjects,
	useCatalogWorkspaces,
} from "renderer/routes/_local/providers/WorkspaceCatalogProvider/selectors";
import { managedTaskKeys, type TaskListData } from "../../task-types";
import "../../task-ui.css";
import { CreateTaskDialog } from "../CreateTaskDialog/CreateTaskDialog";
import { TaskDetail } from "../TaskDetail/TaskDetail";

type Filter = "all" | "active" | "attention" | "done";
export function matchesTaskFilter(row: TaskListData[number], filter: Filter) {
	const status = row.run?.status;
	if (filter === "attention")
		return Boolean(
			status &&
				["blocked", "awaiting_review", "failed", "recovering"].includes(status),
		);
	if (filter === "active")
		return Boolean(
			status && ["queued", "running", "pausing", "cancelling"].includes(status),
		);
	if (filter === "done") return Boolean(status && isTaskTerminal(status));
	return true;
}
export function AgentTasksPage({
	selectedId,
	onSelect,
}: {
	selectedId?: string;
	onSelect(id?: string): void;
}) {
	const { t } = useTranslation();
	const hostUrl = useHostUrl(null);
	const { projects } = useCatalogProjects();
	const { workspaces } = useCatalogWorkspaces();
	const [creating, setCreating] = useState(false),
		[search, setSearch] = useState(""),
		[filter, setFilter] = useState<Filter>("all");
	const list = useQuery({
		queryKey: managedTaskKeys.list(hostUrl),
		enabled: Boolean(hostUrl),
		queryFn: () => {
			if (!hostUrl) throw new Error(t("agentTasks.unavailable"));
			return getHostServiceClientByUrl(hostUrl).tasks.list.query();
		},
		refetchInterval: 2000,
	});
	const all = list.data ?? [];
	const rows = all.filter(
		(row) =>
			matchesTaskFilter(row, filter) &&
			`${row.task.title} ${row.task.contract.goal} ${getAcpAgentLabel(row.task.contract.harness)}`
				.toLocaleLowerCase()
				.includes(search.trim().toLocaleLowerCase()),
	);
	// Never keep an unrelated hidden detail after filtering, and never reserve a
	// second pane for an empty collection. The root MUST grow in dashboard's row.
	const activeId =
		rows.find((row) => row.task.id === selectedId)?.task.id ?? rows[0]?.task.id;
	const lastWorkspace =
		typeof window !== "undefined"
			? window.localStorage.getItem("lastViewedWorkspaceId")
			: null;
	const destination =
		workspaces.find((w) => w.id === lastWorkspace) ??
		workspaces.find((w) => w.type === "main") ??
		workspaces[0];
	const openChat = destination
		? `#/workspace/${encodeURIComponent(destination.id)}`
		: null;
	return (
		<div
			data-testid="agent-tasks-page"
			className="task-hub flex h-full w-full min-h-0 min-w-0 flex-1 flex-col bg-background"
		>
			<header className="task-hub__header">
				<div className="min-w-0">
					<h1 className="flex items-center gap-2 text-base font-semibold">
						<Target className="size-4 text-muted-foreground" />
						{t("agentTasks.title")}
					</h1>
					<p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
						{t("taskUi.subtitle")}
					</p>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{openChat && (
						<Button asChild size="sm" variant="outline" className="gap-1.5">
							<a href={openChat}>
								<MessageSquare className="size-3.5" />
								{t("taskUi.openWorkspace")}
							</a>
						</Button>
					)}
					<Button
						size="sm"
						variant="ghost"
						className="gap-1.5"
						disabled={!hostUrl}
						onClick={() => setCreating(true)}
					>
						<Plus className="size-3.5" />
						{t("agentTasks.create")}
					</Button>
				</div>
			</header>
			{(all.length > 0 || search || filter !== "all") && (
				<div className="task-hub__toolbar">
					<nav className="task-hub__filters" aria-label={t("taskUi.listLabel")}>
						{(["all", "active", "attention", "done"] as const).map((value) => (
							<button
								key={value}
								type="button"
								className="task-hub__filter"
								aria-pressed={value === filter}
								onClick={() => {
									setFilter(value);
									onSelect(undefined);
								}}
							>
								{t(`agentTasks.${value}`)}
								<span className="task-hub__filter-count">
									{all.filter((row) => matchesTaskFilter(row, value)).length}
								</span>
							</button>
						))}
					</nav>
					<div className="relative min-w-0">
						<Search className="pointer-events-none absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
						<Input
							className="h-8 w-52 pl-8 text-xs"
							aria-label={t("agentTasks.search")}
							placeholder={t("agentTasks.search")}
							value={search}
							onChange={(e) => {
								setSearch(e.target.value);
								onSelect(undefined);
							}}
						/>
					</div>
				</div>
			)}
			{list.error && (
				<div
					role="alert"
					className="mx-6 mb-3 flex items-center gap-3 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-xs"
				>
					<p className="select-text cursor-text text-destructive">
						{list.error.message}
					</p>
					<Button
						size="sm"
						variant="outline"
						onClick={() => void list.refetch()}
					>
						{t("agentTasks.retryLoad")}
					</Button>
				</div>
			)}
			{!hostUrl ? (
				<div className="task-hub__empty">
					<Info className="size-6 text-muted-foreground" />
					<p className="select-text cursor-text text-sm text-muted-foreground">
						{t("agentTasks.unavailable")}
					</p>
				</div>
			) : !list.data && list.error ? (
				<div className="flex-1" />
			) : !list.data && list.isPending ? (
				<div className="task-hub__empty">
					<p className="text-sm text-muted-foreground">
						{t("agentTasks.loading")}
					</p>
				</div>
			) : !rows.length ? (
				<div data-testid="task-empty-state" className="task-hub__empty">
					<div className="task-hub__empty-icon">
						<Target className="size-7" />
					</div>
					<div className="max-w-md">
						<h2 className="text-lg font-semibold">
							{t(
								all.length || search || filter !== "all"
									? "taskUi.noMatches"
									: "taskUi.emptyTitle",
							)}
						</h2>
						<p className="mt-3 text-sm leading-7 text-muted-foreground">
							{t(
								all.length || search || filter !== "all"
									? "agentTasks.selectTask"
									: "taskUi.emptyBody",
							)}
						</p>
					</div>
					{all.length || search || filter !== "all" ? (
						<Button
							size="sm"
							variant="outline"
							onClick={() => {
								setSearch("");
								setFilter("all");
								onSelect(undefined);
							}}
						>
							{t("taskUi.clearFilters")}
						</Button>
					) : (
						<>
							<div className="task-hub__steps">
								<span className="inline-flex items-center gap-1.5">
									<MessageSquare className="size-3.5" />
									{t("taskUi.emptyStepChat")}
								</span>
								<ChevronRight className="size-3 opacity-50" />
								<span className="inline-flex items-center gap-1.5">
									<Zap className="size-3.5" />
									{t("taskUi.emptyStepRun")}
								</span>
								<ChevronRight className="size-3 opacity-50" />
								<span className="inline-flex items-center gap-1.5">
									<CircleCheck className="size-3.5" />
									{t("taskUi.emptyStepVerify")}
								</span>
							</div>
							<div className="mt-3 flex gap-2">
								{openChat ? (
									<Button asChild size="sm" className="gap-2">
										<a href={openChat}>
											{t("taskUi.openWorkspace")}
											<ArrowRight className="size-3.5" />
										</a>
									</Button>
								) : null}
								<Button
									size="sm"
									variant="outline"
									onClick={() => setCreating(true)}
								>
									{t("taskUi.advancedCreate")}
								</Button>
							</div>
						</>
					)}
				</div>
			) : (
				<div
					className="task-hub__body"
					data-detail-open={Boolean(selectedId && activeId)}
				>
					<aside className="task-hub__list" aria-label={t("taskUi.listLabel")}>
						{rows.map(({ task, run }) => (
							<button
								key={task.id}
								type="button"
								data-testid="task-list-row"
								onClick={() => onSelect(task.id)}
								aria-current={activeId === task.id}
								className="task-hub__row"
							>
								<div className="mb-2.5 flex items-center justify-between gap-2">
									{run && <TaskStatusBadge status={run.status} />}
									<time
										className="text-[10px] tabular-nums text-muted-foreground"
										dateTime={new Date(task.createdAt).toISOString()}
									>
										{new Date(task.createdAt).toLocaleDateString()}
									</time>
								</div>
								<strong className="line-clamp-2 block text-[13px] font-medium leading-5">
									{task.title}
								</strong>
								<div className="mt-2.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
									<span className="truncate">
										{projects.find((p) => p.id === task.projectId)?.name ?? ""}
									</span>
									<span aria-hidden>·</span>
									<span className="truncate">
										{getAcpAgentLabel(task.contract.harness)}
									</span>
									<ChevronRight className="ml-auto size-3 shrink-0" />
								</div>
							</button>
						))}
					</aside>
					<main
						className="task-hub__detail"
						aria-label={t("taskUi.detailsLabel")}
					>
						<div className="task-hub__back border-b p-2">
							<Button
								size="sm"
								variant="ghost"
								onClick={() => onSelect(undefined)}
							>
								<ArrowLeft className="mr-1 size-3.5" />
								{t("taskUi.backToList")}
							</Button>
						</div>
						{activeId && (
							<TaskDetail
								key={`${hostUrl}:${activeId}`}
								hostUrl={hostUrl}
								taskId={activeId}
								onRemoved={() => onSelect(undefined)}
							/>
						)}
					</main>
				</div>
			)}
			<footer className="task-hub__footer">
				<Info className="size-3 shrink-0" />
				{t("taskUi.keepRunning")}
			</footer>
			{creating && hostUrl && (
				<CreateTaskDialog
					hostUrl={hostUrl}
					onClose={() => setCreating(false)}
					onCreated={onSelect}
				/>
			)}
		</div>
	);
}

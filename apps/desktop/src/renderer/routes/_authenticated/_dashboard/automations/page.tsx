import type {
	SelectAutomation,
	SelectUser,
	SelectV2Host,
} from "@superset/db/schema";
import { COMPANY } from "@superset/shared/constants";
import { describeSchedule } from "@superset/shared/rrule";
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
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@superset/ui/empty";
import { toast } from "@superset/ui/sonner";
import { Table, TableBody, TableHead, TableRow } from "@superset/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { cn } from "@superset/ui/utils";
import { useLiveQuery } from "@tanstack/react-db";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { LuPlus, LuSearchX, LuTerminal, LuX } from "react-icons/lu";
import { useRecentProjects } from "renderer/hooks/host-projects/useRecentProjects";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import {
	DATA_TABLE_HEAD_CELL,
	DataTableHeader,
} from "renderer/routes/_authenticated/_dashboard/components/DataTableHeader";
import {
	SortableHeader,
	type SortDirection,
} from "renderer/routes/_authenticated/_dashboard/components/SortableHeader";
import { useFailedAutomations } from "renderer/routes/_authenticated/_dashboard/hooks/useFailedAutomations";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { AutomationRow } from "./components/AutomationRow";
import { AutomationsEmptyState } from "./components/AutomationsEmptyState";
import { CreateAutomationDialog } from "./components/CreateAutomationDialog";
import { HostOfflineRunDialog } from "./components/HostOfflineRunDialog";
import type { AutomationTemplate } from "./templates";
import { isHostOfflineError } from "./utils/hostOfflineError";

export const Route = createFileRoute("/_authenticated/_dashboard/automations/")(
	{
		component: AutomationsPage,
	},
);

type Scope = "mine" | "team";

type AutomationSortField = "name" | "owner" | "project" | "schedule";

function AutomationsPage() {
	const { t } = useTranslation();
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const currentUserId = session?.user?.id;

	const [createOpen, setCreateOpen] = useState(false);
	const [initialTemplate, setInitialTemplate] =
		useState<AutomationTemplate | null>(null);
	const [scope, setScope] = useState<Scope>("mine");
	const [cliHintDismissed, setCliHintDismissed] = useState(false);
	const [pendingDelete, setPendingDelete] = useState<SelectAutomation | null>(
		null,
	);
	const [hostOfflineRun, setHostOfflineRun] = useState<{
		hostId: string | null;
	} | null>(null);

	const runNowMutation = useMutation({
		mutationFn: ({
			id,
		}: {
			id: string;
			name: string;
			targetHostId: string | null;
		}) => apiTrpcClient.automation.runNow.mutate({ id }),
		onSuccess: (_, { name }) =>
			toast.success(t("automations.runningNow", { name })),
		onError: (error, { targetHostId }) => {
			const message = error instanceof Error ? error.message : null;
			if (isHostOfflineError(message)) {
				setHostOfflineRun({ hostId: targetHostId });
				return;
			}
			toast.error(message ?? t("automations.runFailed"));
		},
	});

	const deleteMutation = useMutation({
		mutationFn: ({ id }: { id: string; name: string }) =>
			apiTrpcClient.automation.delete.mutate({ id }),
		onSuccess: (_, { name }) => {
			setPendingDelete(null);
			toast.success(t("automations.deleted", { name }));
		},
		onError: (error) =>
			toast.error(
				error instanceof Error ? error.message : t("automations.deleteFailed"),
			),
	});

	const { data: automationRows = [], isReady: automationsReady } = useLiveQuery(
		(q) =>
			q
				.from({ a: collections.automations })
				.orderBy(({ a }) => a.createdAt, "desc")
				.select(({ a }) => ({ ...a })),
		[collections.automations],
	);
	// Live queries can briefly surface nullish rows while syncing.
	const automations = useMemo(
		() => automationRows.filter((automation) => automation != null),
		[automationRows],
	);

	const { data: userRows = [] } = useLiveQuery(
		(q) =>
			q.from({ u: collections.users }).select(({ u }) => ({
				id: u.id,
				name: u.name,
				email: u.email,
			})),
		[collections.users],
	);
	const { lastRunStatusById, markMyFailuresSeen } = useFailedAutomations();

	// Opening the page clears the sidebar failure badge; failures that sync in
	// while it stays open are marked seen too, until a newer run fails.
	useEffect(() => {
		markMyFailuresSeen();
	}, [markMyFailuresSeen]);

	const recentProjects = useRecentProjects();
	const { workspaces: hostWorkspaces } = useHostWorkspaces();
	const { data: hostRows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ h: collections.v2Hosts })
				.select(({ h }) => ({ machineId: h.machineId, name: h.name })),
		[collections.v2Hosts],
	);

	// Live queries can briefly surface nullish rows while syncing (see #4519).
	const usersById = useMemo(
		() =>
			new Map(
				(userRows as Pick<SelectUser, "id" | "name" | "email">[])
					.filter((u) => u != null)
					.map((u) => [u.id, u]),
			),
		[userRows],
	);
	const projectsById = useMemo(
		() =>
			new Map(recentProjects.filter((p) => p != null).map((p) => [p.id, p])),
		[recentProjects],
	);
	const workspacesById = useMemo(
		() => new Map(hostWorkspaces.map((w) => [w.id, w])),
		[hostWorkspaces],
	);
	const hostsById = useMemo(
		() =>
			new Map(
				(hostRows as Pick<SelectV2Host, "machineId" | "name">[])
					.filter((h) => h != null)
					.map((h) => [h.machineId, h]),
			),
		[hostRows],
	);

	const mineCount = useMemo(
		() =>
			currentUserId
				? automations.filter((a) => a.ownerUserId === currentUserId).length
				: 0,
		[automations, currentUserId],
	);
	const teamCount = automations.length - mineCount;

	const visible = useMemo(() => {
		if (!currentUserId) return automations;
		return scope === "mine"
			? automations.filter((a) => a.ownerUserId === currentUserId)
			: automations.filter((a) => a.ownerUserId !== currentUserId);
	}, [automations, scope, currentUserId]);

	const [sortField, setSortField] = useState<AutomationSortField | null>(null);
	const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

	const handleSort = (field: AutomationSortField) => {
		if (sortField === field) {
			setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
		} else {
			setSortField(field);
			setSortDirection("asc");
		}
	};

	const handleScopeChange = (value: string) => {
		if (!value) return;
		const next = value as Scope;
		setScope(next);
		// The Owner column only exists on the team tab; drop the sort with it.
		if (next !== "team" && sortField === "owner") setSortField(null);
	};

	// Default order (no active sort) is createdAt desc from the live query.
	const sortedVisible = useMemo(() => {
		if (!sortField) return visible;
		const sortValue = (automation: SelectAutomation): string => {
			switch (sortField) {
				case "name":
					return automation.name;
				case "owner": {
					const owner = usersById.get(automation.ownerUserId);
					return owner?.name ?? owner?.email ?? "";
				}
				case "project":
					return projectsById.get(automation.v2ProjectId)?.name ?? "";
				case "schedule":
					return describeSchedule(automation.rrule);
			}
		};
		return [...visible].sort((a, b) => {
			const cmp = sortValue(a).localeCompare(sortValue(b));
			return sortDirection === "asc" ? cmp : -cmp;
		});
	}, [visible, sortField, sortDirection, usersById, projectsById]);

	const handleSelectTemplate = (template: AutomationTemplate) => {
		setInitialTemplate(template);
		setCreateOpen(true);
	};

	const handleDialogOpenChange = (next: boolean) => {
		setCreateOpen(next);
		if (!next) setInitialTemplate(null);
	};

	const colWidth = scope === "team" ? "w-[11%]" : "w-[13%]";
	const scheduleWidth = scope === "team" ? "w-[14%]" : "w-[16%]";
	const lastRunWidth = "w-[9%]";
	const showAutomationLoading = !automationsReady && visible.length === 0;
	const showMineEmptyState =
		automationsReady && visible.length === 0 && scope === "mine";
	const showTeamEmptyState =
		automationsReady && visible.length === 0 && scope === "team";

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<header className="flex h-11 shrink-0 items-center justify-between border-b border-line px-4">
				<div className="flex items-center gap-3">
					<h1 className="text-sm font-semibold tracking-tight">
						{t("dashboard.automations")}
					</h1>
					<div className="h-4 w-px bg-border" />
					<Tabs value={scope} onValueChange={handleScopeChange}>
						<TabsList className="h-8 bg-transparent p-0 gap-1">
							<TabsTrigger
								value="mine"
								className="h-8 rounded-ds-3 px-3 data-[state=active]:bg-accent-tint data-[state=active]:text-fg data-[state=inactive]:text-fg-mute"
							>
								<span className="text-sm">{t("automations.mine")}</span>
								<span className="ml-1 tabular-nums text-xs text-fg-mute">
									{mineCount}
								</span>
							</TabsTrigger>
							<TabsTrigger
								value="team"
								className="h-8 rounded-ds-3 px-3 data-[state=active]:bg-accent-tint data-[state=active]:text-fg data-[state=inactive]:text-fg-mute"
							>
								<span className="text-sm">{t("automations.team")}</span>
								<span className="ml-1 tabular-nums text-xs text-fg-mute">
									{teamCount}
								</span>
							</TabsTrigger>
						</TabsList>
					</Tabs>
				</div>

				<div className="flex items-center gap-2">
					<Button
						asChild
						variant="ghost"
						size="sm"
						className="h-8 text-fg-mute"
					>
						<a
							href={`${COMPANY.DOCS_URL}/automations`}
							target="_blank"
							rel="noreferrer"
						>
							{t("automations.learnMore")}
						</a>
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-8 gap-1.5 px-3"
						onClick={() => setCreateOpen(true)}
					>
						<LuPlus className="size-4" />
						<span>{t("automations.new")}</span>
					</Button>
				</div>
			</header>

			{!cliHintDismissed && (
				<div className="shrink-0 px-4 pt-3">
					<div className="relative flex items-start gap-3 rounded-ds-5 border border-line bg-gradient-to-b from-accent/40 to-accent/10 py-3 pl-3.5 pr-10">
						<div className="flex size-8 shrink-0 items-center justify-center rounded-ds-3 border border-line bg-background text-fg shadow-sm">
							<LuTerminal className="size-4" />
						</div>
						<div className="min-w-0 space-y-1">
							<p className="text-sm font-medium text-fg">
								{t("automations.cliTitle", { cli: "superset" })}
							</p>
							<p className="text-sm leading-relaxed text-fg-mute">
								{t("automations.cliDescription")}{" "}
								<a
									href={`${COMPANY.DOCS_URL}/cli/getting-started`}
									target="_blank"
									rel="noreferrer"
									className="font-medium text-fg underline underline-offset-2 hover:text-fg-mute"
								>
									{t("automations.gettingStarted")}
								</a>{" "}
								·{" "}
								<a
									href={`${COMPANY.DOCS_URL}/cli/cli-reference`}
									target="_blank"
									rel="noreferrer"
									className="font-medium text-fg underline underline-offset-2 hover:text-fg-mute"
								>
									{t("automations.cliReference")}
								</a>
							</p>
						</div>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							onClick={() => setCliHintDismissed(true)}
							aria-label={t("automations.dismiss")}
							className="absolute right-2 top-2 size-6 text-fg-mute hover:text-fg"
						>
							<LuX className="size-3.5" />
						</Button>
					</div>
				</div>
			)}

			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				{showAutomationLoading ? null : showMineEmptyState ? (
					<div className="flex-1 overflow-y-auto px-8 py-8">
						<AutomationsEmptyState onSelectTemplate={handleSelectTemplate} />
					</div>
				) : showTeamEmptyState ? (
					<Empty className="flex-1">
						<EmptyHeader>
							<EmptyMedia
								variant="icon"
								className="size-14 [&_svg:not([class*='size-'])]:size-7"
							>
								<LuSearchX />
							</EmptyMedia>
							<EmptyTitle>{t("automations.noTeam")}</EmptyTitle>
							<EmptyDescription>
								{t("automations.noTeamDescription")}
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					<div className="min-h-0 flex-1">
						<Table
							containerClassName="h-full overflow-y-auto"
							className="table-fixed"
						>
							<DataTableHeader>
								<TableRow className="hover:bg-transparent">
									<TableHead className={cn(DATA_TABLE_HEAD_CELL, "pl-4")}>
										<SortableHeader
											field="name"
											label={t("automations.name")}
											sortField={sortField}
											sortDirection={sortDirection}
											onSort={handleSort}
										/>
									</TableHead>
									{scope === "team" && (
										<TableHead className={cn(DATA_TABLE_HEAD_CELL, "w-[12%]")}>
											<SortableHeader
												field="owner"
												label={t("automations.owner")}
												sortField={sortField}
												sortDirection={sortDirection}
												onSort={handleSort}
											/>
										</TableHead>
									)}
									<TableHead className={cn(DATA_TABLE_HEAD_CELL, colWidth)}>
										<SortableHeader
											field="project"
											label={t("automations.project")}
											sortField={sortField}
											sortDirection={sortDirection}
											onSort={handleSort}
										/>
									</TableHead>
									<TableHead className={cn(DATA_TABLE_HEAD_CELL, colWidth)}>
										{t("automations.workspace")}
									</TableHead>
									<TableHead className={cn(DATA_TABLE_HEAD_CELL, colWidth)}>
										{t("automations.device")}
									</TableHead>
									<TableHead className={cn(DATA_TABLE_HEAD_CELL, colWidth)}>
										{t("automations.agent")}
									</TableHead>
									<TableHead
										className={cn(DATA_TABLE_HEAD_CELL, scheduleWidth)}
									>
										<SortableHeader
											field="schedule"
											label={t("automations.schedule")}
											sortField={sortField}
											sortDirection={sortDirection}
											onSort={handleSort}
										/>
									</TableHead>
									<TableHead className={cn(DATA_TABLE_HEAD_CELL, lastRunWidth)}>
										{t("automations.lastRun")}
									</TableHead>
									<TableHead
										className={cn(DATA_TABLE_HEAD_CELL, "w-12 pr-4")}
									/>
								</TableRow>
							</DataTableHeader>
							<TableBody>
								{sortedVisible.map((automation) => {
									const workspace = automation.v2WorkspaceId
										? workspacesById.get(automation.v2WorkspaceId)
										: null;
									const workspaceLabel = !automation.v2WorkspaceId
										? t("automations.newWorkspace")
										: (workspace?.name ?? t("automations.deletedWorkspace"));
									const host = automation.targetHostId
										? hostsById.get(automation.targetHostId)
										: null;

									return (
										<AutomationRow
											key={automation.id}
											automation={automation}
											owner={usersById.get(automation.ownerUserId)}
											showOwner={scope === "team"}
											project={projectsById.get(automation.v2ProjectId)}
											workspaceLabel={workspaceLabel}
											hostLabel={host?.name ?? t("automations.autoDevice")}
											lastRunStatus={
												lastRunStatusById.get(automation.id) ?? null
											}
											isOwner={automation.ownerUserId === currentUserId}
											onRunNow={(a) =>
												runNowMutation.mutate({
													id: a.id,
													name: a.name,
													targetHostId: a.targetHostId,
												})
											}
											onDelete={setPendingDelete}
										/>
									);
								})}
							</TableBody>
						</Table>
					</div>
				)}
			</div>

			<CreateAutomationDialog
				open={createOpen}
				onOpenChange={handleDialogOpenChange}
				initialTemplate={initialTemplate}
				onCreated={() => handleDialogOpenChange(false)}
			/>

			<HostOfflineRunDialog
				hostId={hostOfflineRun?.hostId ?? null}
				open={!!hostOfflineRun}
				onOpenChange={(next) => {
					if (!next) setHostOfflineRun(null);
				}}
			/>

			<AlertDialog
				open={!!pendingDelete}
				onOpenChange={(next) => {
					if (!next) setPendingDelete(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("automations.deleteTitle")}</AlertDialogTitle>
						<AlertDialogDescription>
							{pendingDelete
								? t("automations.deleteDescription", {
										name: pendingDelete.name,
									})
								: null}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
						<AlertDialogAction
							disabled={deleteMutation.isPending}
							onClick={() => {
								if (pendingDelete) {
									deleteMutation.mutate({
										id: pendingDelete.id,
										name: pendingDelete.name,
									});
								}
							}}
						>
							{t("automations.delete")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

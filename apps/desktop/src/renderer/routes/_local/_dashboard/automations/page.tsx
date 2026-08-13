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
import { toast } from "@superset/ui/sonner";
import { Table, TableBody, TableHead, TableRow } from "@superset/ui/table";
import { cn } from "@superset/ui/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { LuPlus } from "react-icons/lu";
import { useRecentProjects } from "renderer/hooks/host-projects/useRecentProjects";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import {
	DATA_TABLE_HEAD_CELL,
	DataTableHeader,
} from "renderer/routes/_local/_dashboard/components/DataTableHeader";
import {
	SortableHeader,
	type SortDirection,
} from "renderer/routes/_local/_dashboard/components/SortableHeader";
import { useFailedAutomations } from "renderer/routes/_local/_dashboard/hooks/useFailedAutomations";
import {
	type LocalAutomation,
	localAutomationKeys,
	useLocalAutomations,
} from "renderer/routes/_local/_dashboard/hooks/useLocalAutomationData";
import { navigateToWorkspace } from "renderer/routes/_local/_dashboard/utils/workspace-navigation";
import { useWorkspaceCatalog } from "renderer/routes/_local/providers/WorkspaceCatalogProvider";
import { useCatalogProjects } from "renderer/routes/_local/providers/WorkspaceCatalogProvider/selectors";
import { AutomationRow } from "./components/AutomationRow";
import { AutomationsEmptyState } from "./components/AutomationsEmptyState";
import { CreateAutomationDialog } from "./components/CreateAutomationDialog";
import type { AutomationTemplate } from "./templates";
import { getAutomationRunDestination } from "./utils/getAutomationRunDestination";
import { getAutomationTargetPresentation } from "./utils/getAutomationTargetPresentation";

export const Route = createFileRoute("/_local/_dashboard/automations/")({
	component: AutomationsPage,
});

type AutomationSortField = "name" | "project" | "schedule";

function AutomationsPage() {
	const { t } = useTranslation();
	const hostUrl = useHostUrl(null);
	const queryClient = useQueryClient();
	const navigate = useNavigate();

	const [createOpen, setCreateOpen] = useState(false);
	const [initialTemplate, setInitialTemplate] =
		useState<AutomationTemplate | null>(null);
	const [pendingDelete, setPendingDelete] = useState<LocalAutomation | null>(
		null,
	);
	const runNowMutation = useMutation({
		mutationFn: ({ id }: { id: string; name: string }) => {
			if (!hostUrl) throw new Error("Local host service is unavailable");
			return getHostServiceClientByUrl(hostUrl).automations.runNow.mutate({
				id,
			});
		},
		onMutate: ({ id, name }) => {
			const toastId = `automation-run-now-${id}`;
			toast.loading(t("automations.runningNow", { name }), { id: toastId });
			return { toastId };
		},
		onSuccess: (result, { name }, context) => {
			queryClient.invalidateQueries({
				queryKey: localAutomationKeys.automations(hostUrl),
			});
			toast.dismiss(context?.toastId);
			const destination = getAutomationRunDestination({
				workspaceId: result.workspaceId,
				sessionKind: result.sessionKind,
				terminalSessionId:
					result.sessionKind === "terminal" ? result.sessionId : null,
				chatSessionId: result.sessionKind === "acp" ? result.sessionId : null,
			});
			if ("reason" in destination) {
				toast.success(t("automations.runningNow", { name }));
				toast.message(destination.reason);
				return;
			}
			void navigateToWorkspace(destination.workspaceId, navigate, {
				search: {
					...("terminalId" in destination
						? { terminalId: destination.terminalId }
						: { acpSessionId: destination.acpSessionId }),
					focusRequestId: crypto.randomUUID(),
				},
			});
		},
		onError: (error, _variables, context) => {
			toast.dismiss(context?.toastId);
			toast.error(
				error instanceof Error ? error.message : t("automations.runFailed"),
			);
		},
	});

	const deleteMutation = useMutation({
		mutationFn: ({ id }: { id: string; name: string }) =>
			(() => {
				if (!hostUrl) throw new Error("Local host service is unavailable");
				return getHostServiceClientByUrl(hostUrl).automations.delete.mutate({
					id,
				});
			})(),
		onSuccess: (_, { name }) => {
			queryClient.invalidateQueries({
				queryKey: localAutomationKeys.automations(hostUrl),
			});
			setPendingDelete(null);
			toast.success(t("automations.deleted", { name }));
		},
		onError: (error) =>
			toast.error(
				error instanceof Error ? error.message : t("automations.deleteFailed"),
			),
	});

	const { data: automations = [], isPending: automationsLoading } =
		useLocalAutomations();

	const { lastRunStatusById, markMyFailuresSeen } = useFailedAutomations();

	// Opening the page clears the sidebar failure badge; failures that sync in
	// while it stays open are marked seen too, until a newer run fails.
	useEffect(() => {
		markMyFailuresSeen();
	}, [markMyFailuresSeen]);

	const recentProjects = useRecentProjects();
	const { projects: catalogProjects } = useCatalogProjects();
	const temporaryProject = catalogProjects.find(
		(project) => project.kind === "temporary",
	);
	const { workspaces: hostWorkspaces } = useWorkspaceCatalog();

	const projectsById = useMemo(
		() =>
			new Map(recentProjects.filter((p) => p != null).map((p) => [p.id, p])),
		[recentProjects],
	);
	const workspacesById = useMemo(
		() => new Map(hostWorkspaces.map((w) => [w.id, w])),
		[hostWorkspaces],
	);

	const visible = automations;

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

	// Default order (no active sort) is createdAt desc from the live query.
	const sortedVisible = useMemo(() => {
		if (!sortField) return visible;
		const sortValue = (automation: LocalAutomation): string => {
			switch (sortField) {
				case "name":
					return automation.name;
				case "project":
					if (automation.projectId === temporaryProject?.id)
						return t("workspace.temporaryWorkspace");
					return automation.projectId
						? (projectsById.get(automation.projectId)?.name ?? "")
						: "";
				case "schedule":
					return describeSchedule(automation.rrule);
			}
		};
		return [...visible].sort((a, b) => {
			const cmp = sortValue(a).localeCompare(sortValue(b));
			return sortDirection === "asc" ? cmp : -cmp;
		});
	}, [
		visible,
		sortField,
		sortDirection,
		projectsById,
		temporaryProject?.id,
		t,
	]);

	const handleSelectTemplate = (template: AutomationTemplate) => {
		setInitialTemplate(template);
		setCreateOpen(true);
	};

	const handleDialogOpenChange = (next: boolean) => {
		setCreateOpen(next);
		if (!next) setInitialTemplate(null);
	};

	const colWidth = "w-[13%]";
	const scheduleWidth = "w-[16%]";
	const lastRunWidth = "w-[9%]";
	const showAutomationLoading = automationsLoading && visible.length === 0;
	const showEmptyState = !automationsLoading && visible.length === 0;

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<header className="flex h-11 shrink-0 items-center justify-between border-b border-line px-4">
				<h1 className="text-sm font-semibold tracking-tight">
					{t("dashboard.automations")}
				</h1>

				<div className="flex items-center gap-2">
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

			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				{showAutomationLoading ? null : showEmptyState ? (
					<div className="flex-1 overflow-y-auto px-8 py-8">
						<AutomationsEmptyState onSelectTemplate={handleSelectTemplate} />
					</div>
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
									const isTemporaryTarget =
										automation.projectId === temporaryProject?.id;
									const workspace = automation.workspaceId
										? workspacesById.get(automation.workspaceId)
										: null;
									const { workspaceLabel } = getAutomationTargetPresentation({
										isTemporaryTarget,
										workspaceId: automation.workspaceId,
										workspaceName: workspace?.name ?? null,
										newWorkspaceLabel: t("automations.newWorkspace"),
										deletedWorkspaceLabel: t("automations.deletedWorkspace"),
									});
									return (
										<AutomationRow
											key={automation.id}
											automation={automation}
											project={
												automation.projectId
													? projectsById.get(automation.projectId)
													: undefined
											}
											isTemporaryTarget={isTemporaryTarget}
											temporaryTargetLabel={t("workspace.temporaryWorkspace")}
											workspaceLabel={workspaceLabel}
											hostLabel={t("project.thisDevice")}
											lastRunStatus={
												lastRunStatusById.get(automation.id) ?? null
											}
											isOwner
											onRunNow={(a) =>
												runNowMutation.mutate({
													id: a.id,
													name: a.name,
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

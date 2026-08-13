import { formatDateTimeInTimezone } from "@superset/shared/rrule";
import { cn } from "@superset/ui/utils";
import { useMutation } from "@tanstack/react-query";
import { useRecentProjects } from "renderer/hooks/host-projects/useRecentProjects";
import {
	getHostServiceClientByUrl,
	type HostServiceClient,
} from "renderer/lib/host-service-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import type {
	LocalAutomation,
	LocalAutomationRun,
} from "renderer/routes/_local/_dashboard/hooks/useLocalAutomationData";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import { useCatalogProjects } from "renderer/routes/_local/providers/WorkspaceCatalogProvider/selectors";
import { AgentPicker } from "../../../components/AgentPicker";
import { ProjectPicker } from "../../../components/ProjectPicker";
import { SchedulePicker } from "../../../components/SchedulePicker";
import { TimezonePicker } from "../../../components/TimezonePicker";
import { WorkspacePicker } from "../../../components/WorkspacePicker";
import { PreviousRunsList } from "../PreviousRunsList";
import { Row } from "./components/Row";
import { Section } from "./components/Section";
import { SectionTitle } from "./components/SectionTitle";

interface AutomationDetailSidebarProps {
	automation: LocalAutomation;
	recentRuns: LocalAutomationRun[];
	onOpenRun: (run: LocalAutomationRun) => void;
}

export function AutomationDetailSidebar({
	automation,
	recentRuns,
	onOpenRun,
}: AutomationDetailSidebarProps) {
	const { t } = useTranslation();
	const recentProjects = useRecentProjects();
	const { projects: catalogProjects } = useCatalogProjects();
	const { machineId: hostId, activeHostUrl: hostUrl } = useLocalHostService();
	const selectedProject = recentProjects.find(
		(p) => p.id === automation.projectId,
	);
	const temporaryProject = catalogProjects.find(
		(project) => project.kind === "temporary",
	);
	const isTemporaryTarget = automation.projectId === temporaryProject?.id;

	const updateMutation = useMutation({
		mutationFn: (
			patch: Partial<
				Parameters<HostServiceClient["automations"]["update"]["mutate"]>[0]
			>,
		) =>
			(() => {
				if (!hostUrl) throw new Error("Local host service is unavailable");
				return getHostServiceClientByUrl(hostUrl).automations.update.mutate({
					id: automation.id,
					...patch,
				});
			})(),
	});

	const lastRunAt = recentRuns
		.map((run) => run.scheduledFor)
		.map((d) => (d ? new Date(d) : null))
		.filter((d): d is Date => d !== null)
		.sort((a, b) => b.getTime() - a.getTime())[0];

	return (
		<aside className="flex w-[360px] shrink-0 flex-col overflow-hidden border-l border-line">
			<div className="flex shrink-0 flex-col gap-6 px-5 pt-5 pb-2">
				<Section title={t("automations.status")}>
					<Row
						label={t("automations.status")}
						value={
							<span className="inline-flex items-center gap-2">
								<span
									className={cn(
										"inline-block size-2 shrink-0 rounded-full",
										automation.enabled
											? "bg-success-tint"
											: "border border-muted-foreground/60",
									)}
								/>
								{automation.enabled
									? t("automations.active")
									: t("automations.paused")}
							</span>
						}
					/>
					<Row
						label={t("automations.nextRun")}
						value={
							automation.enabled && automation.nextRunAt
								? formatDateTimeInTimezone(
										new Date(automation.nextRunAt),
										automation.timezone,
									)
								: "—"
						}
					/>
					<Row
						label={t("automations.lastRan")}
						value={
							lastRunAt
								? formatDateTimeInTimezone(lastRunAt, automation.timezone)
								: "—"
						}
					/>
				</Section>

				<Section title={t("automations.details")}>
					<Row
						label={t("automations.device")}
						value={t("project.thisDevice")}
					/>
					<Row
						label={t("automations.project")}
						value={
							<ProjectPicker
								className="-mr-4"
								selectedProject={selectedProject}
								recentProjects={recentProjects}
								onSelectProject={(projectId) =>
									updateMutation.mutate({
										projectId,
										workspaceId: null,
									})
								}
								temporaryTarget={
									temporaryProject
										? {
												isSelected: isTemporaryTarget,
												onSelect: () =>
													updateMutation.mutate({
														projectId: temporaryProject.id,
														workspaceId: null,
													}),
											}
										: undefined
								}
							/>
						}
					/>
					{!isTemporaryTarget && (
						<Row
							label={t("automations.workspace")}
							value={
								<WorkspacePicker
									className="-mr-4"
									hostId={hostId}
									projectId={automation.projectId}
									value={automation.workspaceId}
									onChange={(workspaceId) =>
										updateMutation.mutate({
											workspaceId,
										})
									}
								/>
							}
						/>
					)}
					<Row
						label={t("automations.repeats")}
						value={
							<SchedulePicker
								className="-mr-4"
								rrule={automation.rrule}
								onRruleChange={(rrule) => updateMutation.mutate({ rrule })}
							/>
						}
					/>
					<Row
						label={t("automations.agent")}
						value={
							<AgentPicker
								className="-mr-4"
								hostId={hostId}
								projectId={automation.projectId}
								value={automation.agent}
								onChange={(agent) => updateMutation.mutate({ agent })}
							/>
						}
					/>
					<Row
						label={t("automations.timezone")}
						value={
							<TimezonePicker
								className="-mr-4"
								value={automation.timezone}
								onChange={(timezone) => updateMutation.mutate({ timezone })}
							/>
						}
					/>
				</Section>
			</div>

			<div className="mt-6 flex min-h-0 flex-1 flex-col gap-2 pl-5 pr-3 pb-5">
				<SectionTitle>{t("automations.previousRuns")}</SectionTitle>
				<div className="min-h-0 flex-1 overflow-y-auto">
					<PreviousRunsList runs={recentRuns} onOpenRun={onOpenRun} />
				</div>
			</div>
		</aside>
	);
}

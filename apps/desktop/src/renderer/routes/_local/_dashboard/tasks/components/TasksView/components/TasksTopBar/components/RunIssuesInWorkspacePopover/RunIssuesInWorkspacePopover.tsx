import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { toast } from "@superset/ui/sonner";
import { ChevronDownIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { HiCheck, HiMiniPlay } from "react-icons/hi2";
import { AgentSelect } from "renderer/components/AgentSelect";
import { useRecentProjects } from "renderer/hooks/host-projects/useRecentProjects";
import { useAgentChoices } from "renderer/hooks/useAgentChoices";
import { showHostServiceUnavailableToast } from "renderer/lib/host-service-unavailable";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useSelectedHostProjectIds } from "renderer/routes/_local/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceModalContent/hooks/useSelectedHostProjectIds";
import { ProjectThumbnail } from "renderer/routes/_local/components/ProjectThumbnail";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import { useWorkspaceCreateDefaultsStore } from "renderer/stores/workspace-create-defaults";
import { useWorkspaceProvisioningSubmission } from "renderer/stores/workspace-launch";
import type { SelectedIssue } from "../../../GitHubIssuesContent";
import { deriveBranchName } from "./deriveBranchName";

const AGENT_STORAGE_KEY = "lastSelectedV2IssueBatchAgent";
const NONE = "none" as const;
type SelectedAgent = string | typeof NONE;

interface RunIssuesInWorkspacePopoverProps {
	issues: SelectedIssue[];
	projectFilter: string | null;
	onComplete: () => void;
}

function synthesizeIssuePrompt(issue: SelectedIssue): string {
	return `GitHub issue #${issue.issueNumber}: ${issue.title}\n${issue.url}`;
}

function issueSlug(issue: SelectedIssue): string {
	return `issue-${issue.issueNumber}`;
}

function readStoredAgent(): SelectedAgent {
	if (typeof window === "undefined") return NONE;
	const stored = window.localStorage.getItem(AGENT_STORAGE_KEY);
	return stored ? (stored as SelectedAgent) : NONE;
}

export function RunIssuesInWorkspacePopover({
	issues,
	projectFilter,
	onComplete,
}: RunIssuesInWorkspacePopoverProps) {
	const hostService = useLocalHostService();
	const { t } = useTranslation();
	const { machineId, activeHostUrl } = hostService;
	const { submit } = useWorkspaceProvisioningSubmission();

	const setLastProjectId = useWorkspaceCreateDefaultsStore(
		(state) => state.setLastProjectId,
	);

	const hostId = machineId;
	const launchHostUrl = activeHostUrl;
	const setUpProjectIds = useSelectedHostProjectIds(hostId);

	// Projects are fully local — shared host-fan-out list, with this
	// surface's per-host needsSetup overlay.
	const hostRecentProjects = useRecentProjects();
	const recentProjects = useMemo(
		() =>
			hostRecentProjects.map((project) => ({
				...project,
				needsSetup:
					setUpProjectIds === null ? null : !setUpProjectIds.has(project.id),
			})),
		[hostRecentProjects, setUpProjectIds],
	);

	const seededProjectId =
		projectFilter &&
		recentProjects.some((project) => project.id === projectFilter)
			? projectFilter
			: (recentProjects[0]?.id ?? null);
	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
		seededProjectId,
	);
	useEffect(() => {
		if (
			selectedProjectId &&
			recentProjects.some((project) => project.id === selectedProjectId)
		) {
			return;
		}
		setSelectedProjectId(seededProjectId);
	}, [seededProjectId, selectedProjectId, recentProjects]);
	const selectedProject = recentProjects.find(
		(project) => project.id === selectedProjectId,
	);

	const { agents, isFetched: agentsFetched } = useAgentChoices(launchHostUrl);
	const validAgentIds = useMemo(
		() => new Set(agents.map((agent) => agent.id)),
		[agents],
	);

	const [selectedAgent, setSelectedAgentState] =
		useState<SelectedAgent>(readStoredAgent);
	useEffect(() => {
		if (!agentsFetched) return;
		if (selectedAgent !== NONE && validAgentIds.has(selectedAgent)) return;
		const stored = readStoredAgent();
		if (stored !== NONE && validAgentIds.has(stored)) {
			setSelectedAgentState(stored);
		} else if (selectedAgent !== NONE) {
			setSelectedAgentState(NONE);
		}
	}, [agentsFetched, validAgentIds, selectedAgent]);
	const setSelectedAgent = (next: SelectedAgent) => {
		setSelectedAgentState(next);
		if (typeof window !== "undefined") {
			window.localStorage.setItem(AGENT_STORAGE_KEY, next);
		}
	};

	const [open, setOpen] = useState(false);
	const [projectPickerOpen, setProjectPickerOpen] = useState(false);

	const submitBlocker = useMemo<string | null>(() => {
		if (!selectedProjectId) return "Select a project";
		if (!hostId) return "No active host";
		if (!activeHostUrl) return "Host service is not running";
		if (setUpProjectIds === null) return "Checking host…";
		if (selectedProject?.needsSetup === true) {
			return "Project not set up on this host";
		}
		if (selectedAgent !== NONE) {
			if (!agentsFetched) return "Checking agents…";
			if (!validAgentIds.has(selectedAgent)) {
				return "Selected agent is not available on this host";
			}
		}
		return null;
	}, [
		selectedProjectId,
		selectedProject?.needsSetup,
		setUpProjectIds,
		selectedAgent,
		agentsFetched,
		validAgentIds,
		hostId,
		activeHostUrl,
	]);

	const handleRun = () => {
		if (!selectedProjectId || !hostId) return;
		if (submitBlocker) {
			if (!activeHostUrl) {
				showHostServiceUnavailableToast(hostService, t, {
					action: t("tasks.runIssuesInWorkspacesAction"),
				});
			} else {
				toast.error(submitBlocker);
			}
			return;
		}

		setLastProjectId(selectedProjectId);

		const handles = issues.map((issue) =>
			submit({
				hostId,
				snapshot: {
					id: crypto.randomUUID(),
					projectId: selectedProjectId,
					name: issue.title,
					branch: deriveBranchName({
						slug: issueSlug(issue),
						title: issue.title,
					}),
					agents:
						selectedAgent === NONE
							? undefined
							: [
									{
										agent: selectedAgent,
										prompt: synthesizeIssuePrompt(issue),
									},
								],
				},
			}),
		);

		const promise = Promise.all(handles.map((handle) => handle.completed)).then(
			(outcomes) => {
				const failed = outcomes.filter((outcome) => !outcome.ok).length;
				if (failed > 0) {
					const firstFailure = outcomes.find((outcome) => !outcome.ok);
					const details =
						firstFailure && !firstFailure.ok ? `: ${firstFailure.error}` : "";
					throw new Error(
						`${outcomes.length - failed} of ${outcomes.length} succeeded${details}`,
					);
				}
				return outcomes.length;
			},
		);

		toast.promise(promise, {
			loading: `Creating ${issues.length} workspace${issues.length === 1 ? "" : "s"}...`,
			success: (count) => `Created ${count} workspace${count === 1 ? "" : "s"}`,
			error: (err) => (err instanceof Error ? err.message : String(err)),
		});

		setOpen(false);
		onComplete();
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="h-7 text-xs gap-1.5 bg-hover/50"
				>
					<HiMiniPlay className="size-3" />
					Run in Workspace
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-72 p-0">
				<div className="flex flex-col gap-2 p-2">
					<Popover open={projectPickerOpen} onOpenChange={setProjectPickerOpen}>
						<PopoverTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="w-full justify-between font-normal h-8 min-w-0 bg-hover/50 rounded-ds-3"
							>
								<span className="flex items-center gap-2 truncate">
									{selectedProject ? (
										<>
											<ProjectThumbnail
												projectName={selectedProject.name}
												iconUrl={selectedProject.iconUrl}
												className="size-4"
											/>
											<span className="truncate">{selectedProject.name}</span>
										</>
									) : (
										<span className="text-fg-mute">Select project</span>
									)}
								</span>
								<ChevronDownIcon className="size-4 opacity-50 shrink-0" />
							</Button>
						</PopoverTrigger>
						<PopoverContent align="start" className="w-60 p-0">
							<Command>
								<CommandInput placeholder="Search projects..." />
								<CommandList>
									<CommandEmpty>No projects found.</CommandEmpty>
									<CommandGroup>
										{recentProjects.map((project) => (
											<CommandItem
												key={project.id}
												value={project.name}
												onSelect={() => {
													setSelectedProjectId(project.id);
													setLastProjectId(project.id);
													setProjectPickerOpen(false);
												}}
											>
												<ProjectThumbnail
													projectName={project.name}
													iconUrl={project.iconUrl}
													className="size-4"
												/>
												<span className="flex-1 truncate">{project.name}</span>
												{project.needsSetup === true && (
													<span className="text-[10px] text-warning">
														not set up
													</span>
												)}
												{project.id === selectedProjectId && (
													<HiCheck className="size-3.5 shrink-0" />
												)}
											</CommandItem>
										))}
									</CommandGroup>
								</CommandList>
							</Command>
						</PopoverContent>
					</Popover>

					<AgentSelect<SelectedAgent>
						agents={agents}
						value={selectedAgent}
						placeholder="Select agent"
						onValueChange={setSelectedAgent}
						onBeforeConfigureAgents={() => setOpen(false)}
						triggerClassName="h-8 text-xs w-full border-0 shadow-none bg-hover/50 rounded-ds-3"
						allowNone
						noneLabel="No agent"
						noneValue={NONE}
					/>
				</div>

				<div className="border-t border-line p-2">
					<Button
						size="sm"
						className="w-full h-8"
						disabled={!!submitBlocker}
						onClick={handleRun}
					>
						Run {issues.length} Workspace{issues.length === 1 ? "" : "s"}
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}

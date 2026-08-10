import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuX } from "react-icons/lu";
import { EmojiTextInput } from "renderer/components/EmojiTextInput";
import { MarkdownEditor } from "renderer/components/MarkdownEditor";
import { useRecentProjects } from "renderer/hooks/host-projects/useRecentProjects";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { localAutomationKeys } from "renderer/routes/_authenticated/_dashboard/hooks/useLocalAutomationData";
import { DevicePicker } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker";
import { useWorkspaceHostOptions } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions/useWorkspaceHostOptions";
import { useCatalogProjects } from "renderer/routes/_authenticated/providers/WorkspaceCatalogProvider/selectors";
import {
	useWorkspaceLaunch,
	useWorkspaceProvisioningAdapter,
} from "renderer/stores/workspace-launch";
import { hideAll as hideAllTippy } from "tippy.js";
import { useAutomationAgentChoices } from "../../hooks/useAutomationAgentChoices";
import { useProjectFileSearch } from "../../hooks/useProjectFileSearch";
import type { AutomationTemplate } from "../../templates";
import { AgentPicker } from "../AgentPicker";
import { ProjectPicker } from "../ProjectPicker";
import { SchedulePicker } from "../SchedulePicker";
import { WorkspacePicker } from "../WorkspacePicker";
import { TemplateGalleryPanel } from "./components/TemplateGalleryPanel";
import { canCreateAutomation } from "./utils/canCreateAutomation";

export type AutomationCreatedPayload = { id: string; name: string };

interface CreateAutomationDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: (automation: AutomationCreatedPayload) => void;
	initialTemplate?: AutomationTemplate | null;
}

const DEFAULT_TIMEZONE =
	Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const DEFAULT_RRULE = "FREQ=DAILY;BYHOUR=9;BYMINUTE=0";

export function CreateAutomationDialog({
	open,
	onOpenChange,
	onCreated,
	initialTemplate,
}: CreateAutomationDialogProps) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [view, setView] = useState<"compose" | "gallery">("compose");
	const [name, setName] = useState("");
	const [prompt, setPrompt] = useState("");
	const [hostId, setHostId] = useState<string | null>(null);
	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
		null,
	);
	const [agent, setAgent] = useState<string | null>(null);
	const [rrule, setRrule] = useState(DEFAULT_RRULE);
	const [v2WorkspaceId, setV2WorkspaceId] = useState<string | null>(null);
	const [isTemporaryTarget, setIsTemporaryTarget] = useState(false);

	const { localHostId } = useWorkspaceHostOptions();
	const provisioningAdapter = useWorkspaceProvisioningAdapter();
	const workspaceLaunch = useWorkspaceLaunch(provisioningAdapter);
	const targetHostId = hostId ?? localHostId;
	const hostUrl = useHostUrl(targetHostId);
	const { agents: hostAgents } = useAutomationAgentChoices(hostUrl);
	const recentProjects = useRecentProjects();
	const { projects: catalogProjects } = useCatalogProjects();
	const searchFiles = useProjectFileSearch({
		hostId,
		projectId: selectedProjectId,
	});
	const selectedProject = recentProjects.find(
		(project) => project.id === selectedProjectId,
	);
	const selectedAgent = hostAgents.find((option) => option.id === agent);
	const temporaryProject = catalogProjects.find(
		(project) => project.kind === "temporary",
	);
	const isTemporaryTargetProvisioning = !!workspaceLaunch.pending(
		"temporary-workspace:default",
	);

	useEffect(() => {
		if (agent && hostAgents.some((option) => option.id === agent)) return;
		const fallback = hostAgents[0]?.id ?? null;
		if (fallback !== agent) setAgent(fallback);
	}, [agent, hostAgents]);

	// Default to the first locally available project once the list resolves.
	useEffect(() => {
		if (!open) return;
		if (selectedProjectId) return;
		const first = recentProjects[0];
		if (first) setSelectedProjectId(first.id);
	}, [open, selectedProjectId, recentProjects]);

	// Track which (open session, template) we've already pre-filled so the
	// effects don't re-run and stomp on user edits when `hostAgents` lands
	// asynchronously.
	const appliedTemplateRef = useRef<AutomationTemplate | null>(null);
	const appliedAgentForTemplateRef = useRef<AutomationTemplate | null>(null);

	const applyTemplate = useCallback((template: AutomationTemplate) => {
		setName(template.name);
		setPrompt(template.prompt);
		if (template.rrule) setRrule(template.rrule);
	}, []);

	// Pre-fill scalar fields once when opened with an initialTemplate.
	useEffect(() => {
		if (!open) return;
		if (!initialTemplate) return;
		if (appliedTemplateRef.current === initialTemplate) return;
		appliedTemplateRef.current = initialTemplate;
		applyTemplate(initialTemplate);
	}, [open, initialTemplate, applyTemplate]);

	// Match the template's preferred agent against the host's choices once
	// they load. Separate effect so a `hostAgents` refresh doesn't re-trigger
	// the scalar prefill above.
	useEffect(() => {
		if (!open) return;
		if (!initialTemplate?.agentType) return;
		if (appliedAgentForTemplateRef.current === initialTemplate) return;
		if (hostAgents.length === 0) return;
		const match = hostAgents.find(
			(option) =>
				option.id === initialTemplate.agentType ||
				option.iconId === initialTemplate.agentType,
		);
		if (match) setAgent(match.id);
		appliedAgentForTemplateRef.current = initialTemplate;
	}, [open, initialTemplate, hostAgents]);

	useEffect(() => {
		if (!open) {
			setView("compose");
			setName("");
			setPrompt("");
			setHostId(null);
			setSelectedProjectId(null);
			setAgent(null);
			setRrule(DEFAULT_RRULE);
			setV2WorkspaceId(null);
			setIsTemporaryTarget(false);
			appliedTemplateRef.current = null;
			appliedAgentForTemplateRef.current = null;
		}
	}, [open]);

	const createMutation = useMutation({
		mutationFn: () => {
			if (!selectedAgent) throw new Error(t("automations.noAgentSelected"));
			if (!selectedProjectId)
				throw new Error(t("automations.noProjectSelected"));
			if (!hostUrl) throw new Error("Local host service is unavailable");
			return getHostServiceClientByUrl(hostUrl).automations.create.mutate({
				name,
				prompt,
				agent: selectedAgent.id,
				targetHostId: targetHostId ?? null,
				v2ProjectId: selectedProjectId,
				v2WorkspaceId: isTemporaryTarget ? null : v2WorkspaceId,
				rrule: rrule.trim(),
				timezone: DEFAULT_TIMEZONE,
				mcpScope: [],
			});
		},
		onSuccess: (result) => {
			queryClient.invalidateQueries({
				queryKey: localAutomationKeys.automations(hostUrl),
			});
			toast.success(t("automations.created", { name: result.name }));
			onCreated({ id: result.id, name: result.name });
		},
		onError: (error) => {
			console.error("[CreateAutomation] create failed:", error);
		},
	});

	const humanReadableCreateError = (() => {
		if (!createMutation.isError) return null;
		const error = createMutation.error;
		if (!(error instanceof Error)) return t("automations.createFailed");
		// Keep local service errors concise in the dialog.
		const firstLine = error.message.split("\n")[0]?.trim();
		if (!firstLine) return t("automations.createFailed");
		return firstLine.length > 160 ? `${firstLine.slice(0, 160)}…` : firstLine;
	})();

	const canSubmit = canCreateAutomation({
		name,
		prompt,
		projectId: selectedProjectId,
		hostId: targetHostId,
		agentId: selectedAgent?.id ?? null,
		rrule,
		isPending: createMutation.isPending || isTemporaryTargetProvisioning,
	});

	const handleTemplatePicked = (template: AutomationTemplate) => {
		applyTemplate(template);
		setView("compose");
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-[960px] p-0 gap-0 overflow-hidden"
				aria-describedby={undefined}
				showCloseButton={false}
				onPointerDownOutside={(event) => event.preventDefault()}
				onInteractOutside={(event) => event.preventDefault()}
				onEscapeKeyDown={(event) => {
					// Radix listens at document-capture phase, so it intercepts Escape
					// before the editor's target-level Suggestion handler runs. If any
					// tippy popup is visible (emoji / file / slash), hide it here and
					// preventDefault so the dialog doesn't close too.
					if (!document.querySelector('.tippy-box[data-state="visible"]')) {
						return;
					}
					event.preventDefault();
					hideAllTippy();
				}}
			>
				<div
					className="flex flex-col overflow-hidden transition-[height] duration-200 ease-out"
					style={{ height: view === "compose" ? 400 : 560 }}
				>
					{view === "compose" ? (
						<>
							<DialogHeader className="flex-row items-center gap-2 p-4 pb-0 space-y-0">
								<div className="flex-1">
									<DialogTitle className="sr-only">
										{t("automations.new")}
									</DialogTitle>
									<EmojiTextInput
										value={name}
										onChange={setName}
										placeholder={t("automations.titlePlaceholder")}
										className="text-base font-medium"
									/>
								</div>
								<Button
									variant="outline"
									size="sm"
									onClick={() => setView("gallery")}
								>
									{t("automations.useTemplate")}
								</Button>
								<DialogClose asChild>
									<Button
										variant="ghost"
										size="icon-sm"
										aria-label={t("automations.close")}
									>
										<LuX className="size-4" />
									</Button>
								</DialogClose>
							</DialogHeader>

							<div className="flex-1 min-h-0 px-4 pt-2 flex flex-col overflow-y-auto">
								<MarkdownEditor
									content={prompt}
									onChange={setPrompt}
									placeholder={t("automations.promptPlaceholder")}
									className="flex-1 flex flex-col min-h-0"
									editorClassName="flex-1 min-h-[200px]"
									searchFiles={searchFiles}
								/>

								{humanReadableCreateError && (
									<p className="text-destructive text-sm mt-2 line-clamp-2">
										{humanReadableCreateError}
									</p>
								)}
							</div>

							<DialogFooter className="flex-row items-center justify-between gap-2 border-t p-3 sm:justify-between">
								<div className="flex items-center gap-2">
									<DevicePicker
										className="w-[160px]"
										hostId={hostId}
										showLocalOnlineState
										onSelectHostId={(next) => {
											setHostId(next);
											setV2WorkspaceId(null);
											setIsTemporaryTarget(false);
										}}
									/>
									<ProjectPicker
										className="w-[120px]"
										selectedProject={selectedProject}
										recentProjects={recentProjects}
										onSelectProject={(id) => {
											setSelectedProjectId(id);
											setV2WorkspaceId(null);
											setIsTemporaryTarget(false);
										}}
										temporaryTarget={{
											isSelected: isTemporaryTarget,
											onSelect: () => {
												setHostId(null);
												setV2WorkspaceId(null);
												if (temporaryProject) {
													setSelectedProjectId(temporaryProject.id);
													setIsTemporaryTarget(true);
													return;
												}
												if (!provisioningAdapter) {
													toast.error("Could not create temporary workspace");
													return;
												}
												setSelectedProjectId(null);
												setIsTemporaryTarget(false);
												void workspaceLaunch
													.begin({
														adapter: provisioningAdapter,
														request: {
															idempotencyKey: "temporary-workspace:default",
															project: {
																kind: "temporary",
																singletonKey: "default",
															},
															source: { kind: "main" },
														},
													})
													.then((operation) => {
														if (
															operation.state === "failed" ||
															!operation.projectId
														)
															throw new Error(
																operation.failure?.message ??
																	"Workspace provisioning failed",
															);
														setSelectedProjectId(operation.projectId);
														setIsTemporaryTarget(true);
													})
													.catch((error) =>
														toast.error(
															"Could not create temporary workspace",
															{
																description:
																	error instanceof Error
																		? error.message
																		: String(error),
															},
														),
													);
											},
										}}
									/>
									{!isTemporaryTarget && (
										<WorkspacePicker
											className="w-[160px]"
											hostId={targetHostId ?? null}
											projectId={selectedProjectId}
											value={v2WorkspaceId}
											onChange={setV2WorkspaceId}
										/>
									)}
									<SchedulePicker
										className="w-[164px]"
										rrule={rrule}
										onRruleChange={setRrule}
									/>
									<AgentPicker
										className="w-[100px]"
										hostId={targetHostId}
										value={agent ?? ""}
										onChange={setAgent}
									/>
								</div>

								<div className="flex items-center gap-2">
									<DialogClose asChild>
										<Button variant="ghost">{t("common.cancel")}</Button>
									</DialogClose>
									<Button
										disabled={!canSubmit}
										onClick={() => createMutation.mutate()}
									>
										{createMutation.isPending
											? t("automations.creating")
											: t("automations.create")}
									</Button>
								</div>
							</DialogFooter>
						</>
					) : (
						<>
							<DialogTitle className="sr-only">
								{t("automations.templatesTitle")}
							</DialogTitle>
							<TemplateGalleryPanel
								onBack={() => setView("compose")}
								onSelectTemplate={handleTemplatePicked}
							/>
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

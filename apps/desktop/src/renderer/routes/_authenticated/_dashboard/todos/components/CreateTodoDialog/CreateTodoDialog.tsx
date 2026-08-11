import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { RadioGroup, RadioGroupItem } from "@superset/ui/radio-group";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
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
import { AgentPicker } from "../../../automations/components/AgentPicker";
import { ProjectPicker } from "../../../automations/components/ProjectPicker";
import { WorkspacePicker } from "../../../automations/components/WorkspacePicker";
import { useAutomationAgentChoices } from "../../../automations/hooks/useAutomationAgentChoices";
import { canCreateTodo } from "./utils/canCreateTodo";

interface CreateTodoDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

const DEFAULT_TIMEZONE =
	Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

type TodoMode = "manual" | "auto";

function defaultDueLocalString(): string {
	const now = new Date(Date.now() + 30 * 60 * 1000);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function CreateTodoDialog({
	open,
	onOpenChange,
}: CreateTodoDialogProps) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();

	const [title, setTitle] = useState("");
	const [note, setNote] = useState("");
	const [mode, setMode] = useState<TodoMode>("manual");
	const [dueLocal, setDueLocal] = useState(defaultDueLocalString());
	const [hostId, setHostId] = useState<string | null>(null);
	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
		null,
	);
	const [agent, setAgent] = useState<string | null>(null);
	const [v2WorkspaceId, setV2WorkspaceId] = useState<string | null>(null);
	const [isTemporaryTarget, setIsTemporaryTarget] = useState(false);
	const [prompt, setPrompt] = useState("");

	const { localHostId } = useWorkspaceHostOptions();
	const provisioningAdapter = useWorkspaceProvisioningAdapter();
	const workspaceLaunch = useWorkspaceLaunch(provisioningAdapter);
	const targetHostId = hostId ?? localHostId;
	const hostUrl = useHostUrl(targetHostId);
	const { agents: hostAgents } = useAutomationAgentChoices(
		hostUrl,
		selectedProjectId,
	);
	const recentProjects = useRecentProjects();
	const { projects: catalogProjects } = useCatalogProjects();

	useEffect(() => {
		if (!open) {
			setTitle("");
			setNote("");
			setMode("manual");
			setDueLocal(defaultDueLocalString());
			setHostId(null);
			setSelectedProjectId(null);
			setAgent(null);
			setV2WorkspaceId(null);
			setIsTemporaryTarget(false);
			setPrompt("");
		}
	}, [open]);

	useEffect(() => {
		if (mode !== "auto") return;
		if (agent && hostAgents.some((option) => option.id === agent)) return;
		const fallback = hostAgents[0]?.id ?? null;
		if (fallback !== agent) setAgent(fallback);
	}, [mode, agent, hostAgents]);

	useEffect(() => {
		if (mode !== "auto") return;
		if (selectedProjectId) return;
		const first = recentProjects[0];
		if (first) setSelectedProjectId(first.id);
	}, [mode, selectedProjectId, recentProjects]);

	const dueDate = useMemo(() => {
		const parsed = new Date(dueLocal);
		return Number.isFinite(parsed.getTime()) ? parsed : null;
	}, [dueLocal]);

	const selectedAgent = hostAgents.find((option) => option.id === agent);
	const selectedProject = recentProjects.find(
		(p) => p.id === selectedProjectId,
	);
	const temporaryProject = catalogProjects.find(
		(project) => project.kind === "temporary",
	);
	const isTemporaryTargetProvisioning = !!workspaceLaunch.pending(
		"temporary-workspace:default",
	);

	const createMutation = useMutation({
		mutationFn: () => {
			if (!dueDate) throw new Error("invalid due date");
			if (!hostUrl) throw new Error("Local host service is unavailable");
			return getHostServiceClientByUrl(hostUrl).todos.create.mutate({
				title: title.trim(),
				note: note.trim() ? note.trim() : null,
				mode,
				dueAt: dueDate,
				timezone: DEFAULT_TIMEZONE,
				v2ProjectId: mode === "auto" ? (selectedProjectId ?? null) : null,
				v2WorkspaceId:
					mode === "auto" && !isTemporaryTarget ? v2WorkspaceId : null,
				targetHostId: mode === "auto" ? (targetHostId ?? null) : null,
				agent: mode === "auto" ? (agent ?? null) : null,
				prompt: mode === "auto" ? prompt.trim() : null,
			});
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: localAutomationKeys.todos(hostUrl),
			});
			toast.success(t("todos.title"));
			onOpenChange(false);
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to create TODO",
			);
		},
	});

	const canSubmit = canCreateTodo({
		title,
		hasDueDate: !!dueDate,
		mode,
		hasAgent: !!selectedAgent,
		hasSelectedProject: !!selectedProject,
		isTemporaryTarget,
		hasHost: !!targetHostId,
		hasWorkspace: !!v2WorkspaceId,
		prompt,
		isPending: createMutation.isPending || isTemporaryTargetProvisioning,
	});

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>{t("todos.new")}</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="todo-title">{t("todos.titleField")}</Label>
						<Input
							autoFocus
							id="todo-title"
							onChange={(e) => setTitle(e.target.value)}
							placeholder={t("todos.titlePlaceholder")}
							value={title}
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="todo-note">{t("todos.note")}</Label>
						<Textarea
							id="todo-note"
							onChange={(e) => setNote(e.target.value)}
							placeholder={t("todos.notePlaceholder")}
							rows={2}
							value={note}
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="todo-due">{t("todos.dueAt")}</Label>
						<Input
							id="todo-due"
							onChange={(e) => setDueLocal(e.target.value)}
							type="datetime-local"
							value={dueLocal}
						/>
					</div>

					<div className="flex flex-col gap-2">
						<Label>{t("todos.mode")}</Label>
						<RadioGroup
							onValueChange={(value) => setMode(value as TodoMode)}
							value={mode}
						>
							<div className="flex items-start gap-2">
								<RadioGroupItem id="todo-mode-manual" value="manual" />
								<div className="flex flex-col">
									<Label htmlFor="todo-mode-manual">
										{t("todos.modeManual")}
									</Label>
									<span className="text-xs text-fg-mute">
										{t("todos.modeManualHelp")}
									</span>
								</div>
							</div>
							<div className="flex items-start gap-2">
								<RadioGroupItem id="todo-mode-auto" value="auto" />
								<div className="flex flex-col">
									<Label htmlFor="todo-mode-auto">{t("todos.modeAuto")}</Label>
									<span className="text-xs text-fg-mute">
										{t("todos.modeAutoHelp")}
									</span>
								</div>
							</div>
						</RadioGroup>
					</div>

					{mode === "auto" && (
						<div className="flex flex-col gap-3 rounded-ds-3 border border-line p-3">
							<div className="flex flex-col gap-1.5">
								<Label>{t("todos.hostOptional")}</Label>
								<DevicePicker
									hostId={hostId}
									showLocalOnlineState
									onSelectHostId={(nextHostId) => {
										setHostId(nextHostId);
										setV2WorkspaceId(null);
										setIsTemporaryTarget(false);
									}}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label>{t("todos.projectOptional")}</Label>
								<ProjectPicker
									onSelectProject={(id) => {
										setSelectedProjectId(id);
										setV2WorkspaceId(null);
										setIsTemporaryTarget(false);
									}}
									recentProjects={recentProjects}
									selectedProject={selectedProject}
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
													toast.error("Could not create temporary workspace", {
														description:
															error instanceof Error
																? error.message
																: String(error),
													}),
												);
										},
									}}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label>{t("todos.agent")}</Label>
								<AgentPicker
									hostId={targetHostId}
									projectId={selectedProjectId}
									onChange={setAgent}
									value={agent ?? ""}
								/>
							</div>
							{!isTemporaryTarget && (
								<div className="flex flex-col gap-1.5">
									<Label>{t("automations.workspace")}</Label>
									<WorkspacePicker
										hostId={targetHostId}
										projectId={selectedProjectId}
										value={v2WorkspaceId}
										onChange={setV2WorkspaceId}
									/>
								</div>
							)}
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="todo-prompt">{t("todos.promptField")}</Label>
								<Textarea
									id="todo-prompt"
									onChange={(e) => setPrompt(e.target.value)}
									placeholder={t("todos.promptPlaceholder")}
									rows={4}
									value={prompt}
								/>
							</div>
						</div>
					)}
				</div>
				<DialogFooter>
					<Button
						onClick={() => onOpenChange(false)}
						type="button"
						variant="ghost"
					>
						{t("common.cancel")}
					</Button>
					<Button
						disabled={!canSubmit || createMutation.isPending}
						onClick={() => createMutation.mutate()}
						type="button"
					>
						{createMutation.isPending ? t("todos.creating") : t("todos.create")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

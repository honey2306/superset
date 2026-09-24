import {
	ACP_AGENT_OPTIONS,
	type AcpHarness,
	isAcpHarness,
} from "@superset/shared/agent-catalog";
import type { TaskDelivery } from "@superset/shared/tasks";
import { createTaskSchema, type TaskStrategy } from "@superset/shared/tasks";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { Textarea } from "@superset/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import {
	useCatalogProjects,
	useCatalogWorkspaces,
} from "renderer/routes/_local/providers/WorkspaceCatalogProvider/selectors";
import { managedTaskKeys } from "../../task-types";
import { ProjectTaskProfileDialog } from "./components/ProjectTaskProfileDialog";
import { TaskDeliveryFields } from "./components/TaskDeliveryFields/TaskDeliveryFields";

const selectClass =
	"h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
export function CreateTaskDialog({
	hostUrl,
	onClose,
	onCreated,
}: {
	hostUrl: string;
	onClose(): void;
	onCreated(id: string): void;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const id = useId();
	const { projects } = useCatalogProjects();
	const { workspaces } = useCatalogWorkspaces();
	const [projectId, setProjectId] = useState("");
	const [workspaceId, setWorkspaceId] = useState("");
	const [goal, setGoal] = useState("");
	const [acceptance, setAcceptance] = useState("");
	const [strategy, setStrategy] = useState<TaskStrategy>("auto");
	const [harness, setHarness] = useState<AcpHarness>("pi-acp");
	const [model, setModel] = useState("");
	const [delivery, setDelivery] = useState<TaskDelivery>({ mode: "none" });
	const [commands, setCommands] = useState("");
	const [automatic, setAutomatic] = useState(false);
	const [useProject, setUseProject] = useState(true);
	const [profileOpen, setProfileOpen] = useState(false);
	const [repairs, setRepairs] = useState(2);
	const [minutes, setMinutes] = useState(30);
	const pendingRequest = useRef({ signature: "", id: crypto.randomUUID() });
	const selectedProject =
		projectId ||
		projects.find((project) => project.kind !== "temporary")?.id ||
		projects[0]?.id ||
		"";
	const directories = workspaces.filter(
		(workspace) => workspace.projectId === selectedProject,
	);
	const selectedDirectory =
		workspaceId ||
		directories.find((workspace) => workspace.type === "main")?.id ||
		directories[0]?.id ||
		"";
	const profile = useQuery({
		queryKey: [...managedTaskKeys.all(hostUrl), "profile", selectedProject],
		enabled: Boolean(selectedProject),
		queryFn: () =>
			getHostServiceClientByUrl(hostUrl).tasks.profile.query({
				projectId: selectedProject,
			}),
	});
	const lines = commands
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	const create = useMutation({
		mutationFn: async () => {
			const draft = {
				projectId: selectedProject,
				workspaceId: selectedDirectory,
				acceptanceMode: useProject
					? "project"
					: automatic && lines.length
						? "checks"
						: "review",
				expectedProfileRevision: profile.data?.revision,
				contract: {
					goal,
					delivery,
					acceptance,
					strategy,
					harness,
					...(model.trim() ? { model: model.trim() } : {}),
					checks: lines.map((command, index) => ({
						name: `Check ${index + 1}`,
						command,
						timeoutMs: 120_000,
					})),
					completion: automatic && lines.length ? "checks" : "review",
					maxRepairs: repairs,
					timeoutMs: minutes * 60_000,
				},
			};
			const signature = JSON.stringify(draft);
			if (signature !== pendingRequest.current.signature)
				pendingRequest.current = { signature, id: crypto.randomUUID() };
			return getHostServiceClientByUrl(hostUrl).tasks.create.mutate(
				createTaskSchema.parse({ ...draft, id: pendingRequest.current.id }),
			);
		},
		onSuccess: (data) => {
			void queryClient.invalidateQueries({
				queryKey: managedTaskKeys.all(hostUrl),
			});
			onCreated(data.task.id);
			onClose();
		},
	});
	return (
		<>
			<Dialog
				open={!profileOpen}
				onOpenChange={(open) => {
					if (!open && !create.isPending && !profileOpen) onClose();
				}}
			>
				<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>{t("agentTasks.create")}</DialogTitle>
						<DialogDescription>
							{t("agentTasks.deliveryBoundary")}
						</DialogDescription>
					</DialogHeader>
					<form
						className="space-y-4"
						onSubmit={(event) => {
							event.preventDefault();
							create.mutate();
						}}
					>
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-2">
								<Label htmlFor={`${id}-project`}>
									{t("agentTasks.project")}
								</Label>
								<select
									id={`${id}-project`}
									className={selectClass}
									value={selectedProject}
									onChange={(event) => {
										setProjectId(event.target.value);
										setWorkspaceId("");
										setDelivery({ mode: "none" });
									}}
								>
									<option value="" disabled>
										{t("agentTasks.selectProject")}
									</option>
									{projects.map((project) => (
										<option key={project.id} value={project.id}>
											{project.name || project.repoPath}
										</option>
									))}
								</select>
							</div>
							<div className="space-y-2">
								<Label htmlFor={`${id}-directory`}>
									{t("agentTasks.directory")}
								</Label>
								<select
									id={`${id}-directory`}
									className={selectClass}
									value={selectedDirectory}
									onChange={(event) => {
										setWorkspaceId(event.target.value);
										setDelivery({ mode: "none" });
									}}
								>
									<option value="" disabled>
										{t("agentTasks.selectDirectory")}
									</option>
									{directories.map((directory) => (
										<option key={directory.id} value={directory.id}>
											{directory.name || directory.branch} · {directory.type}
										</option>
									))}
								</select>
							</div>
						</div>
						{!directories.length && (
							<p className="text-sm text-muted-foreground">
								{t("agentTasks.noWorkspace")}
							</p>
						)}
						<div className="space-y-2">
							<Label htmlFor={`${id}-goal`}>{t("agentTasks.goal")}</Label>
							<Textarea
								id={`${id}-goal`}
								value={goal}
								onChange={(event) => setGoal(event.target.value)}
								placeholder={t("agentTasks.goalPlaceholder")}
								className="min-h-28"
								required
								maxLength={50_000}
							/>
						</div>
						<div className="space-y-2 rounded-md border p-3">
							<div className="flex items-center justify-between gap-2">
								<label className="flex items-center gap-2 text-sm">
									<input
										type="checkbox"
										checked={useProject}
										onChange={(event) => setUseProject(event.target.checked)}
									/>
									{t("agentTasks.useProject")}
								</label>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									disabled={!profile.data}
									onClick={() => setProfileOpen(true)}
								>
									{t("agentTasks.profile")}
								</Button>
							</div>
							{profile.data && (
								<p className="text-xs text-muted-foreground">
									{t("agentTasks.profileSummary", {
										revision: profile.data.revision,
										count: profile.data.config.checks.length,
									})}{" "}
									·{" "}
									{profile.data.config.completion === "checks"
										? t("agentTasks.automatic")
										: t("agentTasks.status.awaiting_review")}
								</p>
							)}
							{profile.error && (
								<p
									role="alert"
									className="select-text cursor-text text-xs text-destructive"
								>
									{profile.error.message}
								</p>
							)}
						</div>
						<TaskDeliveryFields
							hostUrl={hostUrl}
							workspaceId={selectedDirectory}
							harness={harness}
							goal={goal}
							value={delivery}
							onChange={setDelivery}
						/>
						<details className="rounded-lg border p-3">
							<summary className="cursor-pointer text-sm font-medium">
								{t("agentTasks.advanced")}
							</summary>
							<div className="mt-4 space-y-4">
								<div className="grid grid-cols-2 gap-3">
									<div className="space-y-2">
										<Label htmlFor={`${id}-agent`}>Agent</Label>
										<select
											id={`${id}-agent`}
											value={harness}
											onChange={(event) => {
												if (!isAcpHarness(event.target.value)) return;
												setHarness(event.target.value);
												setModel("");
												setDelivery({ mode: "none" });
											}}
											className={selectClass}
										>
											{ACP_AGENT_OPTIONS.map((agent) => (
												<option key={agent.harness} value={agent.harness}>
													{agent.label}
												</option>
											))}
										</select>
									</div>
									<div className="space-y-2">
										<Label htmlFor={`${id}-strategy`}>
											{t("agentTasks.strategy")}
										</Label>
										<select
											id={`${id}-strategy`}
											value={strategy}
											onChange={(event) =>
												setStrategy(event.target.value as TaskStrategy)
											}
											className={selectClass}
										>
											{(["auto", "direct", "standard", "deep"] as const).map(
												(value) => (
													<option key={value} value={value}>
														{t(`agentTasks.strategy.${value}`)}
													</option>
												),
											)}
										</select>
									</div>
								</div>
								<div className="space-y-2">
									<Label htmlFor={`${id}-model`}>{t("agentTasks.model")}</Label>
									<Input
										id={`${id}-model`}
										value={model}
										onChange={(event) => setModel(event.target.value)}
										placeholder={t("agentTasks.modelPlaceholder")}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor={`${id}-acceptance`}>
										{t("agentTasks.acceptance")}
									</Label>
									<Textarea
										id={`${id}-acceptance`}
										value={acceptance}
										onChange={(event) => setAcceptance(event.target.value)}
										maxLength={10_000}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor={`${id}-checks`}>
										{t("agentTasks.checks")}
									</Label>
									<Textarea
										id={`${id}-checks`}
										value={commands}
										onChange={(event) => setCommands(event.target.value)}
										className="font-mono text-xs"
										placeholder="bun run typecheck"
									/>
									<p className="text-xs text-muted-foreground">
										{t("agentTasks.checksHint")}
									</p>
								</div>
								<label className="flex items-start gap-2 text-sm">
									<input
										type="checkbox"
										checked={!useProject && automatic && lines.length > 0}
										disabled={useProject || !lines.length}
										onChange={(event) => setAutomatic(event.target.checked)}
										className="mt-1"
									/>
									{t("agentTasks.automatic")}
								</label>
								<div className="grid grid-cols-2 gap-3">
									<div className="space-y-2">
										<Label htmlFor={`${id}-repairs`}>
											{t("agentTasks.retryBudget")}
										</Label>
										<Input
											id={`${id}-repairs`}
											type="number"
											value={repairs}
											min={0}
											max={8}
											onChange={(event) =>
												setRepairs(Number(event.target.value))
											}
										/>
									</div>
									<div className="space-y-2">
										<Label htmlFor={`${id}-minutes`}>
											{t("agentTasks.timeBudget")}
										</Label>
										<Input
											id={`${id}-minutes`}
											type="number"
											value={minutes}
											min={1}
											max={240}
											onChange={(event) =>
												setMinutes(Number(event.target.value))
											}
										/>
									</div>
								</div>
							</div>
						</details>
						{(useProject
							? profile.data?.config.completion !== "checks"
							: !automatic || !lines.length) && (
							<p className="text-xs text-muted-foreground">
								{t("agentTasks.reviewHint")}
							</p>
						)}
						{create.error && (
							<p
								role="alert"
								className="select-text cursor-text text-sm text-destructive"
							>
								{create.error.message}
							</p>
						)}
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={onClose}
								disabled={create.isPending}
							>
								{t("agentTasks.close")}
							</Button>
							<Button
								type="submit"
								disabled={
									create.isPending ||
									!goal.trim() ||
									!selectedDirectory ||
									!profile.data
								}
							>
								{create.isPending
									? t("agentTasks.loading")
									: t("agentTasks.start")}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
			{profileOpen && profile.data && (
				<ProjectTaskProfileDialog
					key={selectedProject}
					hostUrl={hostUrl}
					projectId={selectedProject}
					onClose={() => setProfileOpen(false)}
				/>
			)}
		</>
	);
}

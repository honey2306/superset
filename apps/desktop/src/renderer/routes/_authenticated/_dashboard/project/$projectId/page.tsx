import { sanitizeSegment } from "@superset/shared/workspace-launch";
import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { GoGitBranch } from "react-icons/go";
import {
	HiCheck,
	HiChevronDown,
	HiChevronLeft,
	HiChevronRight,
	HiChevronUpDown,
} from "react-icons/hi2";
import { useWorkspaceCreationBranches } from "renderer/hooks/host-workspaces/useWorkspaceCreationBranches";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import { invalidateProjectScriptQueries } from "renderer/lib/project-scripts";
import { electronTrpcClient as trpcClient } from "renderer/lib/trpc-client";
import { resolveEffectiveWorkspaceBaseBranch } from "renderer/lib/workspaceBaseBranch";
import { useTranslation } from "renderer/providers/I18nProvider";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { NotFound } from "renderer/routes/not-found";
import {
	useWorkspaceLaunch,
	useWorkspaceProvisioningAdapter,
} from "renderer/stores/workspace-launch";
import type { SetupAction } from "shared/types/config";
import { ExternalWorktreesBanner } from "./components/ExternalWorktreesBanner";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/project/$projectId/",
)({
	component: ProjectPage,
	notFoundComponent: NotFound,
	loader: async ({ params, context }) => {
		const queryKey = [
			["projects", "get"],
			{ input: { id: params.projectId }, type: "query" },
		];

		try {
			await context.queryClient.ensureQueryData({
				queryKey,
				queryFn: () => trpcClient.projects.get.query({ id: params.projectId }),
			});
		} catch (error) {
			if (error instanceof Error && error.message.includes("not found")) {
				throw notFound();
			}
			throw error;
		}
	},
});

type Step = "workspace" | "setup";

function generateBranchFromTitle({
	title,
	authorPrefix,
}: {
	title: string;
	authorPrefix?: string;
}): string {
	const slug = sanitizeSegment(title);
	if (!slug) return "";

	if (authorPrefix) {
		return `${authorPrefix}/${slug}`;
	}
	return slug;
}

function splitCommands(value: string): string[] {
	return value
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

function parseConfigContent(content: string | null): {
	setup: string[];
	teardown: string[];
} {
	if (!content) {
		return { setup: [], teardown: [] };
	}

	try {
		const parsed = JSON.parse(content);
		return {
			setup: Array.isArray(parsed.setup)
				? parsed.setup.filter((c: unknown) => typeof c === "string")
				: [],
			teardown: Array.isArray(parsed.teardown)
				? parsed.teardown.filter((c: unknown) => typeof c === "string")
				: [],
		};
	} catch {
		return { setup: [], teardown: [] };
	}
}

function ProjectPage() {
	const { t } = useTranslation();
	const { projectId } = Route.useParams();
	const navigate = useNavigate();

	const relativeTimeLabels = {
		now: t("time.now"),
		second: t("time.secondShort"),
		minute: t("time.minuteShort"),
		hour: t("time.hourShort"),
		day: t("time.dayShort"),
		month: t("time.monthShort"),
	};

	const { data: project } = electronTrpc.projects.get.useQuery({
		id: projectId,
	});
	const {
		branches,
		defaultBranch,
		isLoading: isBranchesLoading,
		isError: isBranchesError,
	} = useWorkspaceCreationBranches(projectId);
	const branchData = useMemo(
		() => ({ branches, defaultBranch: defaultBranch ?? "" }),
		[branches, defaultBranch],
	);
	const { data: gitAuthor } = electronTrpc.projects.getGitAuthor.useQuery(
		{ id: projectId },
		{ enabled: !!projectId },
	);
	const { data: configData } = electronTrpc.config.getConfigContent.useQuery(
		{ projectId },
		{ enabled: !!projectId },
	);
	const { data: setupDefaults } =
		electronTrpc.config.getSetupOnboardingDefaults.useQuery(
			{ projectId },
			{ enabled: !!projectId },
		);

	const utils = electronTrpc.useUtils();
	const updateConfigMutation = electronTrpc.config.updateConfig.useMutation({
		onSuccess: async () => {
			await invalidateProjectScriptQueries(utils, projectId);
		},
	});

	const [step, setStep] = useState<Step>("workspace");
	const [title, setTitle] = useState("");
	const [compareBaseBranch, setCompareBaseBranch] = useState<string | null>(
		null,
	);
	const [compareBaseBranchOpen, setCompareBaseBranchOpen] = useState(false);
	const [branchSearch, setBranchSearch] = useState("");
	const [showAdvanced, setShowAdvanced] = useState(false);
	const [teardownOpen, setTeardownOpen] = useState(false);
	const [setupMode, setSetupMode] = useState<"checklist" | "custom">(
		"checklist",
	);
	const [actions, setActions] = useState<SetupAction[]>([]);
	const [setupContent, setSetupContent] = useState("");
	const [teardownContent, setTeardownContent] = useState("");

	const titleInputRef = useRef<HTMLInputElement>(null);
	const [hasInitializedSetup, setHasInitializedSetup] = useState(false);
	const [isCreating, setIsCreating] = useState(false);
	const provisioningAdapter = useWorkspaceProvisioningAdapter();
	const workspaceLaunch = useWorkspaceLaunch(provisioningAdapter);

	const authorPrefix = gitAuthor?.prefix;
	const generatedBranchName = generateBranchFromTitle({ title, authorPrefix });

	const filteredBranches = useMemo(() => {
		if (!branchData?.branches) return [];
		if (!branchSearch) return branchData.branches;
		const searchLower = branchSearch.toLowerCase();
		return branchData.branches.filter((b) =>
			b.name.toLowerCase().includes(searchLower),
		);
	}, [branchData?.branches, branchSearch]);

	const effectiveCompareBaseBranch = resolveEffectiveWorkspaceBaseBranch({
		explicitBaseBranch: compareBaseBranch,
		workspaceBaseBranch: project?.workspaceBaseBranch,
		defaultBranch: branchData?.defaultBranch,
		branches: branchData?.branches,
	});

	const setupCommands = useMemo(
		() => splitCommands(setupContent),
		[setupContent],
	);
	const teardownCommands = useMemo(
		() => splitCommands(teardownContent),
		[teardownContent],
	);

	useEffect(() => {
		const timer = setTimeout(() => {
			titleInputRef.current?.focus();
		}, 100);
		return () => clearTimeout(timer);
	}, []);

	useEffect(() => {
		if (
			configData === undefined ||
			setupDefaults === undefined ||
			hasInitializedSetup
		) {
			return;
		}

		const parsed = parseConfigContent(configData?.content ?? null);

		if (parsed.setup.length > 0 || parsed.teardown.length > 0) {
			setSetupMode("custom");
			setSetupContent(parsed.setup.join("\n"));
			setTeardownContent(parsed.teardown.join("\n"));
		} else {
			setSetupMode("checklist");
			setActions(setupDefaults.actions);
		}

		setHasInitializedSetup(true);
	}, [configData, setupDefaults, hasInitializedSetup]);

	const canContinueFromWorkspace = generatedBranchName.length > 0;

	const handleCreateWorkspace = async (startSetup = false) => {
		const workspaceName = title.trim() || undefined;
		if (!provisioningAdapter) {
			toast.error(t("workspace.createFailed"), {
				description: "Workspace host is not available",
			});
			return;
		}

		setIsCreating(true);

		try {
			const operation = await workspaceLaunch.begin({
				adapter: provisioningAdapter,
				request: {
					idempotencyKey: `project-workspace:${projectId}:${generatedBranchName}:${effectiveCompareBaseBranch ?? "default"}:${startSetup ? "setup" : "no-setup"}`,
					project: { kind: "existing", projectId },
					source: {
						kind: "branch",
						name: { kind: "explicit", value: generatedBranchName },
						from: effectiveCompareBaseBranch
							? { kind: "ref", value: effectiveCompareBaseBranch }
							: { kind: "default" },
					},
					display: workspaceName ? { name: workspaceName } : undefined,
					initialSessions: startSetup
						? [{ key: "setup", kind: "setup", requirement: "required" }]
						: undefined,
				},
			});
			if (!operation.workspaceId) {
				throw new Error(
					operation.failure?.message ?? "Workspace provisioning failed",
				);
			}

			if (operation.state === "failed") {
				toast.error(operation.failure?.message ?? t("workspace.createFailed"));
			} else {
				toast.success(t("workspace.created"), {
					description: t("workspace.settingUp"),
				});
			}
			void navigateToWorkspace(operation.workspaceId, navigate);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : t("workspace.createFailed"),
			);
		} finally {
			setIsCreating(false);
		}
	};

	const handleContinueToSetup = () => {
		if (!canContinueFromWorkspace) return;
		setStep("setup");
	};

	const handleSaveAndCreateWorkspace = async () => {
		const commands =
			setupMode === "checklist"
				? actions.filter((a) => a.enabled).map((a) => a.command)
				: setupCommands;

		if (commands.length === 0) {
			await handleCreateWorkspace();
			return;
		}

		try {
			await updateConfigMutation.mutateAsync({
				projectId,
				setup: commands,
				teardown: teardownCommands,
			});

			await handleCreateWorkspace(true);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : t("workspace.saveSetupFailed"),
			);
		}
	};

	const handleSkipSetupAndCreateWorkspace = async () => {
		await handleCreateWorkspace();
	};

	const toggleAction = (id: string) => {
		setActions((prev) =>
			prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)),
		);
	};

	const switchToCustom = () => {
		const prePopulated = actions
			.filter((a) => a.enabled)
			.map((a) => a.command)
			.join("\n");
		setSetupContent(prePopulated);
		setSetupMode("custom");
	};

	if (!project) {
		return null;
	}

	return (
		<div className="flex-1 h-full flex flex-col overflow-hidden bg-background">
			<AnimatePresence>
				<ExternalWorktreesBanner projectId={projectId} />
			</AnimatePresence>

			<div className="flex-1 flex overflow-y-auto">
				<div className="flex-1 flex items-center justify-center px-6 py-8">
					<div className="w-full max-w-3xl space-y-6">
						<div className="space-y-1.5">
							<p className="text-xs uppercase tracking-wide text-muted-foreground">
								{t("workspace.projectStep", {
									current: step === "workspace" ? 1 : 2,
									total: 2,
								})}
							</p>
							<h1 className="text-2xl font-semibold text-foreground">
								{step === "workspace" && t("workspace.createFirst")}
								{step === "setup" && t("workspace.setupScript")}
							</h1>
							<p className="text-sm text-muted-foreground">
								{step === "workspace" && t("workspace.isolatedDescription")}
								{step === "setup" && (
									<>
										{t("workspace.setupCommandsDescription")}{" "}
										<a
											href="https://docs.superset.sh/setup-teardown-scripts"
											target="_blank"
											rel="noopener noreferrer"
											className="group inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground transition-colors"
										>
											{t("workspace.readDocs")}
											<HiChevronRight className="size-3 transition-transform duration-150 group-hover:translate-x-0.5" />
										</a>
									</>
								)}
							</p>
						</div>

						<AnimatePresence mode="wait" initial={false}>
							{step === "workspace" && (
								<motion.div
									key="workspace-step"
									initial={{ opacity: 0, y: 6 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: -6 }}
									transition={{ duration: 0.16, ease: "easeOut" }}
									className="space-y-4"
								>
									<div className="space-y-2">
										<Label htmlFor="task-title">{t("workspace.task")}</Label>
										<Input
											id="task-title"
											ref={titleInputRef}
											className="h-11"
											placeholder={t("workspace.taskPlaceholder")}
											value={title}
											onChange={(e) => setTitle(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter" && !e.shiftKey) {
													e.preventDefault();
													handleContinueToSetup();
												}
											}}
										/>
									</div>

									<div className="rounded-md border border-border/60 bg-card/40 px-3 py-2 text-sm">
										<div className="flex items-center gap-2 text-muted-foreground">
											<GoGitBranch className="size-3.5" />
											<span className="font-mono">
												{generatedBranchName || "branch-name"}
											</span>
											<span className="text-muted-foreground/50">
												{t("workspace.fromBranch")}
											</span>
											<span className="font-mono">
												{effectiveCompareBaseBranch}
											</span>
										</div>
									</div>

									<Collapsible
										open={showAdvanced}
										onOpenChange={setShowAdvanced}
									>
										<CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground/80 hover:text-muted-foreground transition-colors py-1">
											<HiChevronDown
												className={`size-3 transition-transform duration-200 ${showAdvanced ? "" : "-rotate-90"}`}
											/>
											{t("workspace.advancedOptions")}
										</CollapsibleTrigger>
										<AnimatePresence initial={false}>
											{showAdvanced && (
												<motion.div
													initial={{ height: 0, opacity: 0 }}
													animate={{ height: "auto", opacity: 1 }}
													exit={{ height: 0, opacity: 0 }}
													transition={{ duration: 0.2, ease: "easeInOut" }}
													className="overflow-hidden"
												>
													<div className="pt-3 space-y-2">
														<span className="text-xs font-medium text-muted-foreground">
															{t("project.baseBranch")}
														</span>
														{isBranchesError ? (
															<div className="flex items-center gap-2 h-10 px-3 rounded-md border border-destructive/50 bg-destructive/10 text-destructive text-sm">
																{t("workspace.failedLoadBranches")}
															</div>
														) : (
															<Popover
																open={compareBaseBranchOpen}
																onOpenChange={setCompareBaseBranchOpen}
																modal={false}
															>
																<PopoverTrigger asChild>
																	<Button
																		variant="outline"
																		className="w-full h-10 justify-between font-normal"
																		disabled={isBranchesLoading}
																	>
																		<span className="flex items-center gap-2 truncate">
																			<GoGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
																			<span className="truncate font-mono text-sm">
																				{effectiveCompareBaseBranch ||
																					t("workspace.selectBaseBranch")}
																			</span>
																			{effectiveCompareBaseBranch ===
																				branchData?.defaultBranch && (
																				<span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
																					{t("workspace.defaultBranch")}
																				</span>
																			)}
																		</span>
																		<HiChevronUpDown className="size-4 shrink-0 text-muted-foreground" />
																	</Button>
																</PopoverTrigger>
																<PopoverContent
																	className="w-[--radix-popover-trigger-width] p-0"
																	align="start"
																	onWheel={(e) => e.stopPropagation()}
																>
																	<Command shouldFilter={false}>
																		<CommandInput
																			placeholder={t(
																				"workspace.searchBranches",
																			)}
																			value={branchSearch}
																			onValueChange={setBranchSearch}
																		/>
																		<CommandList className="max-h-[200px]">
																			<CommandEmpty>
																				{t("workspace.noBranches")}
																			</CommandEmpty>
																			{filteredBranches.map((branch) => (
																				<CommandItem
																					key={branch.name}
																					value={branch.name}
																					onSelect={() => {
																						setCompareBaseBranch(branch.name);
																						setCompareBaseBranchOpen(false);
																						setBranchSearch("");
																					}}
																					className="flex items-center justify-between"
																				>
																					<span className="flex items-center gap-2 truncate">
																						<GoGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
																						<span className="truncate">
																							{branch.name}
																						</span>
																						{branch.name ===
																							branchData?.defaultBranch && (
																							<span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
																								{t("workspace.defaultBranch")}
																							</span>
																						)}
																					</span>
																					<span className="flex items-center gap-2 shrink-0">
																						{branch.lastCommitDate > 0 && (
																							<span className="text-xs text-muted-foreground">
																								{formatRelativeTime(
																									branch.lastCommitDate,
																									relativeTimeLabels,
																								)}
																							</span>
																						)}
																						{effectiveCompareBaseBranch ===
																							branch.name && (
																							<HiCheck className="size-4 text-primary" />
																						)}
																					</span>
																				</CommandItem>
																			))}
																		</CommandList>
																	</Command>
																</PopoverContent>
															</Popover>
														)}
													</div>
												</motion.div>
											)}
										</AnimatePresence>
									</Collapsible>

									<div className="flex justify-end">
										<Button
											onClick={handleContinueToSetup}
											disabled={!canContinueFromWorkspace}
										>
											{t("common.continue")}
											<HiChevronRight className="size-4" />
										</Button>
									</div>
								</motion.div>
							)}

							{step === "setup" && (
								<motion.div
									key="setup-step"
									initial={{ opacity: 0, y: 6 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: -6 }}
									transition={{ duration: 0.16, ease: "easeOut" }}
									className="space-y-4"
								>
									{setupMode === "checklist" && actions.length > 0 && (
										<div className="space-y-3">
											{setupDefaults?.projectSummary && (
												<p className="text-sm text-muted-foreground">
													{setupDefaults.projectSummary}
												</p>
											)}
											<div className="overflow-hidden rounded-lg border bg-card/40 divide-y divide-border/60">
												{actions.map((action) => (
													<label
														key={action.id}
														htmlFor={`action-${action.id}`}
														className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors cursor-pointer"
													>
														<Checkbox
															id={`action-${action.id}`}
															checked={action.enabled}
															onCheckedChange={() => toggleAction(action.id)}
														/>
														<div className="flex flex-col min-w-0">
															<span className="text-sm text-foreground">
																{action.label}
															</span>
															<span className="text-xs text-muted-foreground font-mono truncate">
																{action.detail}
															</span>
														</div>
													</label>
												))}
											</div>
											<button
												type="button"
												onClick={switchToCustom}
												className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
											>
												{t("workspace.customizeCommands")}
											</button>
										</div>
									)}

									{setupMode === "checklist" && actions.length === 0 && (
										<div className="overflow-hidden rounded-lg border bg-card/40 p-6 text-center space-y-3">
											<p className="text-sm text-muted-foreground">
												{t("workspace.noSetupDetected")}
											</p>
											<div className="flex items-center justify-center gap-2">
												<Button
													variant="outline"
													size="sm"
													onClick={() => setSetupMode("custom")}
												>
													{t("workspace.addCommands")}
												</Button>
												<Button
													variant="ghost"
													size="sm"
													onClick={handleSkipSetupAndCreateWorkspace}
													disabled={
														updateConfigMutation.isPending || isCreating
													}
												>
													{t("workspace.skip")}
												</Button>
											</div>
										</div>
									)}

									{setupMode === "custom" && (
										<div className="space-y-3">
											{actions.length > 0 && (
												<button
													type="button"
													onClick={() => setSetupMode("checklist")}
													className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
												>
													{t("workspace.backToChecklist")}
												</button>
											)}
											<div className="overflow-hidden rounded-lg border bg-card/40">
												<div className="p-3 space-y-3">
													<Textarea
														id="setup-script"
														wrap="off"
														className="h-full min-h-[220px] resize-none overflow-x-auto whitespace-pre font-mono text-xs"
														placeholder={t(
															"workspace.setupCommandsPlaceholder",
														)}
														value={setupContent}
														onChange={(e) => setSetupContent(e.target.value)}
													/>
													<div className="flex flex-wrap items-center gap-1.5 border-t px-1 pt-2 text-[11px] text-muted-foreground">
														<span className="mr-1">
															{t("workspace.variables")}
														</span>
														<span className="rounded bg-muted px-1.5 py-0.5 font-mono">
															$SUPERSET_ROOT_PATH
														</span>
														<span className="rounded bg-muted px-1.5 py-0.5 font-mono">
															$SUPERSET_WORKSPACE_PATH
														</span>
														<span className="rounded bg-muted px-1.5 py-0.5 font-mono">
															$SUPERSET_WORKSPACE_NAME
														</span>
													</div>
												</div>
											</div>
										</div>
									)}

									<Collapsible
										open={teardownOpen}
										onOpenChange={setTeardownOpen}
									>
										<CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground/80 hover:text-muted-foreground transition-colors py-1">
											<HiChevronDown
												className={`size-3 transition-transform duration-200 ${teardownOpen ? "" : "-rotate-90"}`}
											/>
											{t("workspace.teardownCommands")}
										</CollapsibleTrigger>
										<CollapsibleContent className="pt-2">
											<Textarea
												id="teardown-script"
												className="min-h-20 font-mono text-xs"
												placeholder="docker compose down"
												value={teardownContent}
												onChange={(e) => setTeardownContent(e.target.value)}
											/>
										</CollapsibleContent>
									</Collapsible>

									<div className="flex justify-between">
										<Button
											variant="outline"
											onClick={() => setStep("workspace")}
										>
											<HiChevronLeft className="size-4" />
											{t("workspace.back")}
										</Button>
										<div className="flex items-center gap-2">
											<Button
												variant="outline"
												onClick={handleSkipSetupAndCreateWorkspace}
												disabled={updateConfigMutation.isPending || isCreating}
											>
												{t("workspace.skipForNow")}
											</Button>
											<Button
												onClick={handleSaveAndCreateWorkspace}
												disabled={updateConfigMutation.isPending || isCreating}
											>
												{updateConfigMutation.isPending || isCreating
													? t("workspace.creating")
													: setupMode === "checklist"
														? t("workspace.create")
														: t("workspace.saveAndCreate")}
												<HiChevronRight className="size-4" />
											</Button>
										</div>
									</div>
								</motion.div>
							)}
						</AnimatePresence>
					</div>
				</div>
			</div>
		</div>
	);
}

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import type {
	SessionConfigOption,
	SessionModeState,
	SessionScopedState,
	UsageUpdate,
} from "@superset/session-protocol";
import {
	getProviderLogoUrl,
	MODEL_PROVIDERS,
	resolveModelProviderLogoKey,
} from "@superset/shared/agent-models";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { Brain, ChevronDown, GitBranch } from "lucide-react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	cleanThinkingLabel,
	findAcpModelProvider,
	groupAcpModelOptions,
	normalizeAcpIdentity,
} from "./acpIdentity";
import { CtxDonut } from "./CtxDonut";
import { StatusOptionItem } from "./StatusOptionItem";

interface AcpStatusBarProps {
	state: SessionScopedState;
	hostUrl: string;
	usage: UsageUpdate | null;
	currentMode: SessionModeState | null;
	configOptions: SessionConfigOption[] | null;
	/** Kept optional for backward-compatible callers; connection state is shown on the pane border. */
	streamStatus?: string;
	availability?: "live" | "retrying" | "unavailable";
	isSubmitting?: boolean;
	onSetMode?(modeId: string): Promise<void>;
	onSetConfigOption?(optionId: string, value: string | boolean): Promise<void>;
}

type GitStatusSummarySource = {
	currentBranch?: { name?: string | null } | null;
	staged?: readonly unknown[];
	unstaged?: readonly unknown[];
};

export function getAcpGitStatusSummary(
	gitStatus: GitStatusSummarySource | null | undefined,
) {
	return {
		branch: gitStatus?.currentBranch?.name ?? null,
		dirtyCount:
			(gitStatus?.staged?.length ?? 0) + (gitStatus?.unstaged?.length ?? 0),
	};
}

export function AcpStatusBar({
	state,
	hostUrl,
	usage,
	currentMode,
	configOptions,
	isSubmitting = false,
	onSetMode,
	onSetConfigOption,
}: AcpStatusBarProps) {
	// Timeline metadata receives live ACP updates; snapshot state is the initial
	// fallback before the stream reports its first mode/config update.
	const resolvedMode = currentMode ?? state.currentMode;
	const resolvedConfigOptions = configOptions ?? state.configOptions;
	const identity = normalizeAcpIdentity(resolvedMode, resolvedConfigOptions);
	const modelOption = identity.model?.control ?? null;
	const modelLabel = identity.model?.label ?? null;
	// Grouped straight from the adapter's config data: ACP grouped options
	// carry their provider in the group name, flat catalogs carry it in the
	// entry name / value prefix ("万擎 / Claude Opus 5"). No inference.
	const groupedOptions = groupAcpModelOptions(modelOption?.options ?? []);
	// A single configured provider still surfaces as the section header —
	// the per-item labels had their prefix stripped, so without the header
	// the provider name would disappear from the menu entirely.
	const onlyProvider =
		groupedOptions.length === 1 &&
		groupedOptions[0].label === null &&
		groupedOptions[0].models.length > 0 &&
		groupedOptions[0].models.every((model) => model.provider != null)
			? (groupedOptions[0].models[0].provider as string)
			: null;
	const modelGroups =
		onlyProvider != null
			? [
					{
						label: MODEL_PROVIDERS[onlyProvider] ?? onlyProvider,
						models: groupedOptions[0].models,
					},
				]
			: groupedOptions;
	const modelProvider = modelOption
		? findAcpModelProvider(
				modelOption.options,
				modelOption.currentValue ?? null,
			)
		: null;
	const modelProviderLogoKey = resolveModelProviderLogoKey(modelProvider ?? "");
	const thinkingEffortLabel = identity.thinking?.label ?? null;
	const thinkingEffortOption =
		identity.thinking?.source === "config" ? identity.thinking.control : null;
	const thinkingMode =
		identity.thinking?.source === "mode" ? identity.thinking.control : null;

	const used = usage?.used ?? 0;
	const size = usage?.size ?? null;
	const ratio = size != null && size > 0 ? Math.min(1, used / size) : 0;

	const git = useQuery({
		queryKey: ["acp-git-status", hostUrl, state.workspaceId],
		enabled: Boolean(hostUrl) && Boolean(state.workspaceId),
		queryFn: () =>
			getHostServiceClientByUrl(hostUrl).git.getStatus.query({
				workspaceId: state.workspaceId,
				priority: "foreground",
			}),
		staleTime: 5_000,
		refetchOnWindowFocus: true,
	});
	const { branch, dirtyCount } = getAcpGitStatusSummary(git.data);

	const shortBranch =
		branch && branch.length > 28
			? `…${branch.split("/").slice(-1).join("/")}`
			: branch;

	const hasIdentity = modelLabel != null || thinkingEffortLabel != null;

	return (
		<output className="acp-status-bar" aria-label="Agent session details">
			{/* Group 1: model + thinking */}
			{hasIdentity && (
				<span className="acp-status-bar__group acp-status-bar__group--identity">
					{modelLabel &&
						(modelOption && onSetConfigOption ? (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button
										type="button"
										disabled={isSubmitting}
										className="acp-status-bar__seg acp-status-bar__seg--model"
										aria-label={`Change model, current ${modelLabel}`}
									>
										<span className="acp-status-bar__seg-glyph" aria-hidden>
											{modelProviderLogoKey ? (
												<img
													alt=""
													className="acp-status-bar__seg-logo dark:invert"
													src={getProviderLogoUrl(modelProviderLogoKey)}
												/>
											) : (
												"◆"
											)}
										</span>
										<span className="acp-status-bar__seg-value">
											{modelLabel}
										</span>
										<ChevronDown
											className="acp-status-bar__seg-chev"
											aria-hidden
										/>
									</button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="start">
									{modelGroups.map((group, groupIndex) => (
										<DropdownMenuPrimitive.Group
											key={group.label ?? `__group_${groupIndex}`}
										>
											{group.label ? (
												<DropdownMenuPrimitive.Label className="px-2.5 pt-2.5 pb-1 text-[10px] font-medium tracking-[0.16em] uppercase text-fg-faint">
													{group.label}
												</DropdownMenuPrimitive.Label>
											) : null}
											{group.models.map((model) => {
												const selected = model.id === modelOption.currentValue;
												const logoKey = model.provider
													? resolveModelProviderLogoKey(model.provider)
													: null;
												return (
													<StatusOptionItem
														key={model.id}
														selected={selected}
														disabled={isSubmitting || selected}
														onSelect={() => {
															void onSetConfigOption(modelOption.id, model.id);
														}}
													>
														{logoKey ? (
															<img
																alt=""
																className="size-3 shrink-0 object-contain dark:invert"
																src={getProviderLogoUrl(logoKey)}
															/>
														) : null}
														<span className="truncate">{model.label}</span>
													</StatusOptionItem>
												);
											})}
										</DropdownMenuPrimitive.Group>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
						) : (
							<span
								className="acp-status-bar__seg acp-status-bar__seg--model"
								title={`Model: ${modelLabel}`}
							>
								<span className="acp-status-bar__seg-glyph" aria-hidden>
									{modelProviderLogoKey ? (
										<img
											alt=""
											className="acp-status-bar__seg-logo dark:invert"
											src={getProviderLogoUrl(modelProviderLogoKey)}
										/>
									) : (
										"◆"
									)}
								</span>
								<span className="acp-status-bar__seg-value">{modelLabel}</span>
							</span>
						))}
					{thinkingEffortLabel &&
						(thinkingEffortOption && onSetConfigOption ? (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button
										type="button"
										disabled={isSubmitting}
										className="acp-status-bar__seg acp-status-bar__seg--thinking"
										aria-label={`Change thinking effort, current ${thinkingEffortLabel}`}
									>
										<Brain className="acp-status-bar__seg-icon" aria-hidden />
										<span className="acp-status-bar__seg-value">
											{thinkingEffortLabel}
										</span>
										<ChevronDown
											className="acp-status-bar__seg-chev"
											aria-hidden
										/>
									</button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="start">
									{thinkingEffortOption.options
										.flatMap((entry) =>
											"options" in entry ? entry.options : [entry],
										)
										.map((option) => (
											<StatusOptionItem
												key={option.value}
												selected={
													option.value === thinkingEffortOption.currentValue
												}
												disabled={
													isSubmitting ||
													option.value === thinkingEffortOption.currentValue
												}
												onSelect={() =>
													void onSetConfigOption(
														thinkingEffortOption.id,
														option.value,
													)
												}
											>
												<span className="truncate">
													{cleanThinkingLabel(option.name)}
												</span>
											</StatusOptionItem>
										))}
								</DropdownMenuContent>
							</DropdownMenu>
						) : thinkingMode && onSetMode ? (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button
										type="button"
										disabled={isSubmitting}
										className="acp-status-bar__seg acp-status-bar__seg--thinking"
										aria-label={`Change thinking effort, current ${thinkingEffortLabel}`}
									>
										<Brain className="acp-status-bar__seg-icon" aria-hidden />
										<span className="acp-status-bar__seg-value">
											{thinkingEffortLabel}
										</span>
										<ChevronDown
											className="acp-status-bar__seg-chev"
											aria-hidden
										/>
									</button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="start">
									{thinkingMode.availableModes.map((mode) => (
										<StatusOptionItem
											key={mode.id}
											selected={mode.id === thinkingMode.currentModeId}
											disabled={
												isSubmitting || mode.id === thinkingMode.currentModeId
											}
											onSelect={() => {
												void onSetMode(mode.id);
											}}
										>
											<span className="truncate">
												{cleanThinkingLabel(mode.name)}
											</span>
										</StatusOptionItem>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
						) : (
							<span
								className="acp-status-bar__seg acp-status-bar__seg--thinking"
								title={`Thinking: ${thinkingEffortLabel}`}
							>
								<Brain className="acp-status-bar__seg-icon" aria-hidden />
								<span className="acp-status-bar__seg-value">
									{thinkingEffortLabel}
								</span>
							</span>
						))}
				</span>
			)}

			{/* Group 2: context donut — 始终显示，初始为 0% */}
			<span className="acp-status-bar__group acp-status-bar__group--usage">
				<span
					className="acp-status-bar__seg acp-status-bar__seg--ctx"
					data-level={
						ratio >= 0.9
							? "crit"
							: ratio >= 0.8
								? "high"
								: ratio >= 0.5
									? "mid"
									: "low"
					}
					title={`Context: ${used.toLocaleString()} / ${size?.toLocaleString() ?? "?"} tokens`}
				>
					<CtxDonut pct={ratio * 100} />
					<span className="acp-status-bar__pct">
						{`${(ratio * 100).toFixed(0)}%`}
					</span>
				</span>
			</span>

			<span className="acp-status-bar__spacer" />

			{/* Group 3: branch + dirty */}
			{branch && (
				<span className="acp-status-bar__group acp-status-bar__group--branch">
					<span
						className="acp-status-bar__seg acp-status-bar__seg--branch"
						title={`Branch: ${branch}${dirtyCount ? ` · ${dirtyCount} uncommitted` : ""}`}
					>
						<GitBranch className="acp-status-bar__icon" aria-hidden />
						<span className="acp-status-bar__seg-value">{shortBranch}</span>
						{dirtyCount > 0 && (
							<span className="acp-status-bar__dirty">+{dirtyCount}</span>
						)}
					</span>
				</span>
			)}
		</output>
	);
}

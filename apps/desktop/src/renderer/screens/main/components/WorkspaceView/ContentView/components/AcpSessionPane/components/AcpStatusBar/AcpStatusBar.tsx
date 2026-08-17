import type {
	SessionConfigOption,
	SessionModeState,
	SessionScopedState,
	UsageUpdate,
} from "@superset/session-protocol";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { Brain, ChevronDown, GitBranch } from "lucide-react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	cleanModelLabel,
	cleanThinkingLabel,
	normalizeAcpIdentity,
} from "./acpIdentity";
import { CtxDonut } from "./CtxDonut";

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
											◆
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
									{modelOption.options
										.flatMap((entry) =>
											"options" in entry ? entry.options : [entry],
										)
										.map((option) => (
											<DropdownMenuItem
												key={option.value}
												disabled={
													isSubmitting ||
													option.value === modelOption.currentValue
												}
												onSelect={() => {
													void onSetConfigOption(modelOption.id, option.value);
												}}
											>
												{cleanModelLabel(option.name)}
											</DropdownMenuItem>
										))}
								</DropdownMenuContent>
							</DropdownMenu>
						) : (
							<span
								className="acp-status-bar__seg acp-status-bar__seg--model"
								title={`Model: ${modelLabel}`}
							>
								<span className="acp-status-bar__seg-glyph" aria-hidden>
									◆
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
											<DropdownMenuItem
												key={option.value}
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
												{cleanThinkingLabel(option.name)}
											</DropdownMenuItem>
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
										<DropdownMenuItem
											key={mode.id}
											disabled={
												isSubmitting || mode.id === thinkingMode.currentModeId
											}
											onSelect={() => {
												void onSetMode(mode.id);
											}}
										>
											{cleanThinkingLabel(mode.name)}
										</DropdownMenuItem>
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

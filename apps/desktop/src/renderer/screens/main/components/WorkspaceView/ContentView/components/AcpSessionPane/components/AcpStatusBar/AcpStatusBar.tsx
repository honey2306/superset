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
import { GitBranch } from "lucide-react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
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

function findModelOption(
	options: readonly SessionConfigOption[],
): Extract<SessionConfigOption, { type: "select" }> | null {
	for (const opt of options) {
		if (opt.type !== "select") continue;
		if (opt.category === "model") return opt;
	}
	for (const opt of options) {
		if (opt.type !== "select") continue;
		const name = opt.name?.toLowerCase() ?? "";
		const id = opt.id?.toLowerCase() ?? "";
		if (name === "model" || id === "model" || id.endsWith(".model")) return opt;
	}
	return null;
}

function findThinkingEffortOption(
	options: readonly SessionConfigOption[],
): Extract<SessionConfigOption, { type: "select" }> | null {
	return (
		options.find(
			(option): option is Extract<SessionConfigOption, { type: "select" }> =>
				option.type === "select" &&
				/(?:thinking|reasoning|effort)/.test(
					`${option.id} ${option.name ?? ""}`.toLowerCase(),
				),
		) ?? null
	);
}

function cleanModelLabel(raw: string): string {
	return raw.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function selectLabel(
	opt: Extract<SessionConfigOption, { type: "select" }>,
): string | null {
	const flat = opt.options.flatMap((entry) =>
		"options" in entry ? entry.options : [entry],
	);
	const match = flat.find((o) => o.value === opt.currentValue);
	if (match) return cleanModelLabel(match.name);
	if (opt.currentValue == null || opt.currentValue === "") return null;
	return cleanModelLabel(String(opt.currentValue));
}

function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return String(n);
}

/** Map session status → mode data-mode attribute (for pill color) */
function resolveMode(
	modeId: string | undefined,
): "manual" | "default" | "accept-edits" | "plan" {
	if (!modeId) return "default";
	const id = modeId.toLowerCase();
	if (id === "manual") return "manual";
	if (id.includes("accept") || id.includes("edit")) return "accept-edits";
	if (id === "plan") return "plan";
	return "default";
}

const COST_DISPLAY_THRESHOLD = 0.005;

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
	const modeId = resolvedMode?.currentModeId;
	const modeLabel =
		resolvedMode?.availableModes.find((m) => m.id === modeId)?.name ?? modeId;

	const modelOption = findModelOption(resolvedConfigOptions);
	const modelLabel = modelOption ? selectLabel(modelOption) : null;
	const thinkingEffortOption = findThinkingEffortOption(resolvedConfigOptions);
	const thinkingEffortLabel = thinkingEffortOption
		? selectLabel(thinkingEffortOption)
		: null;

	const used = usage?.used ?? null;
	const size = usage?.size ?? null;
	const cost = usage?.cost;
	const showCost =
		cost?.amount != null && cost.amount >= COST_DISPLAY_THRESHOLD;
	const ratio =
		used != null && size != null && size > 0 ? Math.min(1, used / size) : null;

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
	const branch = git.data?.currentBranch.name ?? null;
	const dirtyCount = git.data
		? git.data.staged.length + git.data.unstaged.length
		: 0;

	const shortBranch =
		branch && branch.length > 28
			? `…${branch.split("/").slice(-1).join("/")}`
			: branch;

	const modeVariant = resolveMode(modeId);

	const hasIdentity =
		modeLabel != null || modelLabel != null || thinkingEffortLabel != null;

	return (
		<output className="acp-status-bar" aria-label="Agent session details">
			{/* Group 1: mode pill + model */}
			{hasIdentity && (
				<span className="acp-status-bar__group acp-status-bar__group--identity">
					{modeLabel &&
						(resolvedMode &&
						resolvedMode.availableModes.length > 0 &&
						onSetMode ? (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button
										type="button"
										disabled={isSubmitting}
										className="acp-status-bar__mode"
										data-mode={modeVariant}
										aria-label={`Change mode, current ${modeLabel}`}
									>
										<span className="acp-status-bar__mode-glyph" aria-hidden>
											◐
										</span>
										<span className="acp-status-bar__mode-label">
											{modeLabel}
										</span>
									</button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="start">
									{resolvedMode.availableModes.map((mode) => (
										<DropdownMenuItem
											key={mode.id}
											disabled={isSubmitting || mode.id === modeId}
											onSelect={() => {
												void onSetMode(mode.id);
											}}
										>
											{mode.name}
										</DropdownMenuItem>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
						) : (
							<span
								className="acp-status-bar__mode"
								data-mode={modeVariant}
								title={`Mode: ${modeLabel}`}
							>
								<span className="acp-status-bar__mode-glyph" aria-hidden>
									◐
								</span>
								<span className="acp-status-bar__mode-label">{modeLabel}</span>
							</span>
						))}
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
										<span className="acp-status-bar__seg-value">
											{modelLabel}
										</span>
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
												{option.name}
											</DropdownMenuItem>
										))}
								</DropdownMenuContent>
							</DropdownMenu>
						) : (
							<span
								className="acp-status-bar__seg acp-status-bar__seg--model"
								title={`Model: ${modelLabel}`}
							>
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
										<span className="acp-status-bar__seg-label">Thinking</span>
										<span className="acp-status-bar__seg-value">
											{thinkingEffortLabel}
										</span>
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
												{option.name}
											</DropdownMenuItem>
										))}
								</DropdownMenuContent>
							</DropdownMenu>
						) : (
							<span
								className="acp-status-bar__seg acp-status-bar__seg--thinking"
								title={`Thinking: ${thinkingEffortLabel}`}
							>
								<span className="acp-status-bar__seg-label">Thinking</span>
								<span className="acp-status-bar__seg-value">
									{thinkingEffortLabel}
								</span>
							</span>
						))}
				</span>
			)}

			{/* Group 2: context donut */}
			{used != null && (
				<span className="acp-status-bar__group acp-status-bar__group--usage">
					<span
						className="acp-status-bar__seg acp-status-bar__seg--ctx"
						data-level={
							ratio != null
								? ratio >= 0.9
									? "crit"
									: ratio >= 0.8
										? "high"
										: ratio >= 0.5
											? "mid"
											: "low"
								: "low"
						}
						title={`Context: ${used.toLocaleString()} / ${size?.toLocaleString() ?? "?"} tokens`}
					>
						{ratio != null && <CtxDonut pct={ratio * 100} />}
						<span className="acp-status-bar__pct">
							{ratio != null
								? `${(ratio * 100).toFixed(0)}%`
								: formatTokens(used)}
						</span>
					</span>
					{showCost && (
						<span
							className="acp-status-bar__seg acp-status-bar__seg--cost"
							title={`Session cost · ${cost.currency ?? "USD"}`}
						>
							${cost.amount.toFixed(2)}
						</span>
					)}
				</span>
			)}

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

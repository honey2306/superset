import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import {
	type ComponentPropsWithoutRef,
	forwardRef,
	useEffect,
	useRef,
} from "react";
import { HiMiniMinus, HiMiniXMark } from "react-icons/hi2";
import type { DiffStats } from "renderer/hooks/host-service/useDiffStats";
import { HotkeyLabel } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";
import { RenameInput } from "renderer/screens/main/components/WorkspaceSidebar/RenameInput";
import type { ActivePaneStatus } from "shared/tabs-types";
import type { DashboardSidebarWorkspace } from "../../../../types";
import { DashboardSidebarWorkspaceDiffStats } from "../DashboardSidebarWorkspaceDiffStats";
import { DashboardSidebarWorkspaceIcon } from "../DashboardSidebarWorkspaceIcon";
import { DashboardSidebarWorkspaceChips } from "./components/DashboardSidebarWorkspaceChips";

interface DashboardSidebarExpandedWorkspaceRowProps
	extends ComponentPropsWithoutRef<"div"> {
	workspace: DashboardSidebarWorkspace;
	isActive: boolean;
	isRenaming: boolean;
	renameValue: string;
	shortcutLabel?: string;
	diffStats: DiffStats | null;
	workspaceStatus?: ActivePaneStatus | null;
	isInSection?: boolean;
	onClick?: () => void;
	onDoubleClick?: () => void;
	onCloseWorkspaceClick: () => void;
	onRemoveFromSidebarClick: () => void;
	onRenameValueChange: (value: string) => void;
	onSubmitRename: () => void;
	onCancelRename: () => void;
}

export const DashboardSidebarExpandedWorkspaceRow = forwardRef<
	HTMLDivElement,
	DashboardSidebarExpandedWorkspaceRowProps
>(
	(
		{
			workspace,
			isActive,
			isRenaming,
			renameValue,
			shortcutLabel,
			diffStats,
			workspaceStatus = null,
			isInSection = false,
			onClick,
			onDoubleClick,
			onCloseWorkspaceClick,
			onRemoveFromSidebarClick,
			onRenameValueChange,
			onSubmitRename,
			onCancelRename,
			className,
			...props
		},
		ref,
	) => {
		const { t } = useTranslation();
		const {
			accentColor = null,
			hostType,
			hostIsOnline,
			name,
			branch,
			pullRequest,
			pendingTransaction,
		} = workspace;
		const isPending = pendingTransaction?.type === "insert";
		const showsStandaloneActiveStripe = accentColor == null;
		const localRef = useRef<HTMLDivElement>(null);
		const openUrl = electronTrpc.external.openUrl.useMutation();

		useEffect(() => {
			if (isActive) {
				localRef.current?.scrollIntoView({
					block: "nearest",
					behavior: "smooth",
				});
			}
		}, [isActive]);

		const creationStatusText = isPending ? t("workspace.creating") : null;
		const isMainWorkspace = workspace.type === "main";
		const workspaceKindTitle = isMainWorkspace
			? t("workspace.main")
			: t("workspace.worktree");
		const workspaceKindDescription = isMainWorkspace
			? t("workspace.localDescription")
			: t("workspace.worktreeDescription");
		const prStateLabels = {
			open: t("workspace.prOpen"),
			merged: t("workspace.prMerged"),
			closed: t("workspace.prClosed"),
			draft: t("workspace.prDraft"),
			queued: t("workspace.prQueued"),
		};

		return (
			<div
				ref={(node) => {
					localRef.current = node;
					if (typeof ref === "function") ref(node);
					else if (ref) ref.current = node;
				}}
				className={cn(
					"relative w-full text-left text-sm",
					isActive && "bg-muted",
					onClick && (isActive ? "hover:bg-muted" : "hover:bg-muted/50"),
					className,
				)}
				{...props}
			>
				{isActive && showsStandaloneActiveStripe && (
					<div
						className="absolute top-0 bottom-0 left-0 w-0.5 rounded-r"
						style={{ backgroundColor: "var(--color-foreground)" }}
					/>
				)}

				{/* biome-ignore lint/a11y/noStaticElementInteractions: Mirrors the legacy sidebar row UI, which includes nested action buttons. */}
				<div
					role={onClick ? "button" : undefined}
					tabIndex={onClick ? 0 : undefined}
					aria-disabled={isPending ? true : undefined}
					onClick={onClick}
					onKeyDown={(event) => {
						if (onClick && (event.key === "Enter" || event.key === " ")) {
							event.preventDefault();
							onClick();
						}
					}}
					onDoubleClick={onDoubleClick}
					className={cn(
						"group relative flex w-full items-center py-2 pr-2",
						isInSection ? "pl-10" : "pl-5",
						onClick && "cursor-pointer",
					)}
				>
					<Tooltip delayDuration={500}>
						<TooltipTrigger asChild>
							{pullRequest ? (
								<button
									type="button"
									onClick={(event) => {
										event.stopPropagation();
										openUrl.mutate(pullRequest.url);
									}}
									onKeyDown={(event) => {
										if (event.key === "Enter" || event.key === " ") {
											event.stopPropagation();
										}
									}}
									aria-label={t("workspace.openPullRequest", {
										number: pullRequest.number,
									})}
									className="relative mr-2.5 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded hover:bg-foreground/10"
								>
									<DashboardSidebarWorkspaceIcon
										hostType={hostType}
										workspaceType={workspace.type}
										hostIsOnline={hostIsOnline}
										isActive={isActive}
										variant="expanded"
										workspaceStatus={workspaceStatus}
										isCreatePending={isPending}
										pullRequestState={pullRequest.state}
									/>
								</button>
							) : (
								<div className="relative mr-2.5 flex size-5 shrink-0 items-center justify-center">
									<DashboardSidebarWorkspaceIcon
										hostType={hostType}
										workspaceType={workspace.type}
										hostIsOnline={hostIsOnline}
										isActive={isActive}
										variant="expanded"
										workspaceStatus={workspaceStatus}
										isCreatePending={isPending}
										pullRequestState={null}
									/>
								</div>
							)}
						</TooltipTrigger>
						<TooltipContent side="right" sideOffset={8}>
							{pullRequest ? (
								<>
									<p className="text-xs font-medium">
										{t("workspace.prStatus", {
											number: pullRequest.number,
											status: prStateLabels[pullRequest.state],
										})}
									</p>
									<p className="text-xs text-muted-foreground">
										{t("workspace.clickOpenGithub")}
									</p>
								</>
							) : (
								<>
									<p className="text-xs font-medium">
										{isMainWorkspace
											? workspaceKindTitle
											: hostType === "local-device"
												? t("workspace.local")
												: hostType === "remote-device"
													? hostIsOnline === false
														? t("workspace.remoteOffline")
														: t("workspace.remote")
													: t("workspace.cloud")}
									</p>
									<p className="text-xs text-muted-foreground">
										{isMainWorkspace
											? workspaceKindDescription
											: hostType === "local-device"
												? t("workspace.runningHere")
												: hostType === "remote-device"
													? hostIsOnline === false
														? t("workspace.deviceUnreachable")
														: t("workspace.runningPaired")
													: t("workspace.hostedCloud")}
									</p>
								</>
							)}
						</TooltipContent>
					</Tooltip>

					<div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1.5">
						{isRenaming ? (
							<RenameInput
								value={renameValue}
								onChange={onRenameValueChange}
								onSubmit={onSubmitRename}
								onCancel={onCancelRename}
								className={cn(
									"h-5 w-full -ml-1 border-none bg-transparent px-1 py-0 text-[13px] leading-tight outline-none",
								)}
							/>
						) : (
							<span
								className={cn(
									"truncate text-[13px] leading-tight transition-colors",
									isActive ? "text-foreground" : "text-foreground/80",
								)}
							>
								{name || branch}
							</span>
						)}

						<div className="col-start-2 row-start-1 grid h-5 shrink-0 items-center justify-items-end [&>*]:col-start-1 [&>*]:row-start-1">
							{creationStatusText ? (
								<span className="text-[11px] text-muted-foreground">
									{creationStatusText}
								</span>
							) : (
								isActive &&
								diffStats &&
								(diffStats.additions > 0 || diffStats.deletions > 0) && (
									<DashboardSidebarWorkspaceDiffStats
										additions={diffStats.additions}
										deletions={diffStats.deletions}
										isActive={isActive}
									/>
								)
							)}
							{!isPending && (
								<div className="invisible flex items-center justify-end gap-1.5 group-hover:visible group-focus-within:visible">
									{shortcutLabel && (
										<span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
											{shortcutLabel}
										</span>
									)}
									{isMainWorkspace ? (
										<Tooltip delayDuration={300}>
											<TooltipTrigger asChild>
												<button
													type="button"
													onClick={(event) => {
														event.stopPropagation();
														onRemoveFromSidebarClick();
													}}
													onKeyDown={(event) => {
														if (
															event.key === "Enter" ||
															event.key === " " ||
															event.key === "Spacebar"
														) {
															event.stopPropagation();
														}
													}}
													className="flex items-center justify-center text-muted-foreground hover:text-foreground"
													aria-label={t("workspace.removeSidebar")}
												>
													<HiMiniMinus className="size-3.5" />
												</button>
											</TooltipTrigger>
											<TooltipContent side="top" sideOffset={4}>
												<HotkeyLabel label={t("workspace.removeSidebar")} />
											</TooltipContent>
										</Tooltip>
									) : (
										<Tooltip delayDuration={300}>
											<TooltipTrigger asChild>
												<button
													type="button"
													onClick={(event) => {
														event.stopPropagation();
														onCloseWorkspaceClick();
													}}
													onKeyDown={(event) => {
														if (
															event.key === "Enter" ||
															event.key === " " ||
															event.key === "Spacebar"
														) {
															event.stopPropagation();
														}
													}}
													className="flex items-center justify-center text-muted-foreground hover:text-foreground"
													aria-label={t("workspace.closeLabel")}
												>
													<HiMiniXMark className="size-3.5" />
												</button>
											</TooltipTrigger>
											<TooltipContent side="top" sideOffset={4}>
												<HotkeyLabel
													label={t("workspace.closeLabel")}
													id={isActive ? "CLOSE_WORKSPACE" : undefined}
												/>
											</TooltipContent>
										</Tooltip>
									)}
								</div>
							)}
						</div>
					</div>
				</div>
				{!isPending && (
					<DashboardSidebarWorkspaceChips
						workspaceId={workspace.id}
						isInSection={isInSection}
						onClick={onClick}
					/>
				)}
			</div>
		);
	},
);

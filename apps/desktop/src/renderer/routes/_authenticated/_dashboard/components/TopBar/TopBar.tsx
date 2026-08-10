import { useParams } from "@tanstack/react-router";
import { HiOutlineWifi } from "react-icons/hi2";
import { ZoomStable } from "renderer/components/ZoomStable";
import { useOnlineStatus } from "renderer/hooks/useOnlineStatus";
import { useZoomFactor } from "renderer/hooks/useZoomFactor";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useWorkspaceProjection } from "renderer/routes/_authenticated/providers/WorkspaceCatalogProvider";
import { NavigationControls } from "../NavigationControls";
import { SidebarToggle } from "../SidebarToggle";
import { OpenAIUsageBadge } from "./components/OpenAIUsageBadge";
import { OpenInMenuButton } from "./components/OpenInMenuButton";
import { ResourceConsumption } from "./components/ResourceConsumption";
import { WindowControls } from "./components/WindowControls";

export function TopBar() {
	const { t } = useTranslation();
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const { workspaceId } = useParams({ strict: false });
	const workspace = useWorkspaceProjection(workspaceId ?? "");
	const isOnline = useOnlineStatus();
	const zoomFactor = useZoomFactor();
	// Default to Mac layout while loading to avoid overlap with traffic lights
	const isMac = platform === undefined || platform === "darwin";

	// Counter-scale the inset and bar height so both stay a constant physical
	// size under page zoom, keeping the fixed macOS traffic lights aligned.
	const trafficLightInset = isMac ? `${80 / zoomFactor}px` : "16px";
	const barStyle = isMac ? { height: `${48 / zoomFactor}px` } : undefined;

	return (
		<div
			className="drag gap-2 h-12 w-full flex items-center justify-between bg-hover/45 relative dark:bg-hover/35"
			style={barStyle}
		>
			<div
				className="flex items-center h-full"
				style={{ paddingLeft: trafficLightInset }}
			>
				<ZoomStable enabled={isMac} className="flex items-center gap-1.5">
					<SidebarToggle />
					<NavigationControls />
					<ResourceConsumption />
				</ZoomStable>
			</div>

			<div className="flex min-w-0 flex-1 items-center justify-start" />

			<div className="flex items-center gap-3 h-full pr-4 shrink-0">
				{!isOnline && (
					<div className="no-drag flex items-center gap-1.5 text-xs text-fg-mute bg-hover px-2 py-1 rounded">
						<HiOutlineWifi className="size-3.5" />
						<span>{t("workspace.offlineLabel")}</span>
					</div>
				)}
				<OpenAIUsageBadge />
				{workspace?.worktreePath ? (
					<OpenInMenuButton
						worktreePath={workspace.worktreePath}
						projectId={workspace.projectId}
					/>
				) : null}
				{!isMac && <WindowControls />}
			</div>
		</div>
	);
}

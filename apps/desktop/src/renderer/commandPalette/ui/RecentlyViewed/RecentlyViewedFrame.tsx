import {
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { cn } from "@superset/ui/utils";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "renderer/providers/I18nProvider";
import {
	type RecentlyViewedEntry,
	useRecentlyViewed,
} from "renderer/routes/_local/_dashboard/components/NavigationControls/components/HistoryDropdown/hooks/useRecentlyViewed";
import { useWorkspaceCatalog } from "renderer/routes/_local/providers/WorkspaceCatalogProvider";
import { useFrameStackStore } from "../../core/frames";

export function RecentlyViewedFrame() {
	const { t } = useTranslation();
	const recentEntries = useRecentlyViewed(20);
	const currentPath = useLocation({ select: (loc) => loc.pathname });
	const setOpen = useFrameStackStore((s) => s.setOpen);
	const navigate = useNavigate();

	const { projects, workspaces } = useWorkspaceCatalog();
	const projectNames = new Map(
		projects.map((project) => [project.id, project.name]),
	);
	const workspaceData = workspaces.map((workspace) => ({
		id: workspace.id,
		projectName: projectNames.get(workspace.projectId) ?? workspace.projectId,
		projectColor: "var(--primary)",
		branch: workspace.branch || workspace.name,
	}));

	const filteredEntries = recentEntries.filter((entry) => {
		if (entry.type === "workspace") {
			return workspaceData.some((w) => w.id === entry.entityId);
		}
		return false;
	});

	const navigateTo = (path: string) => {
		void navigate({ to: path });
		setOpen(false);
	};

	return (
		<CommandList>
			<CommandEmpty>{t("commandPalette.nothingYet")}</CommandEmpty>
			<CommandGroup heading="Recently Viewed">
				{filteredEntries.map((entry) => {
					const isCurrent = entry.path === currentPath;
					return (
						<WorkspaceRow
							key={entry.path}
							entry={entry}
							isCurrent={isCurrent}
							workspaceData={workspaceData}
							onSelect={() => navigateTo(entry.path)}
						/>
					);
				})}
			</CommandGroup>
		</CommandList>
	);
}

interface RowProps {
	entry: RecentlyViewedEntry;
	isCurrent: boolean;
	onSelect: () => void;
}

function WorkspaceRow({
	entry,
	isCurrent,
	workspaceData,
	onSelect,
}: RowProps & {
	workspaceData: {
		id: string;
		projectName: string;
		projectColor: string;
		branch: string;
	}[];
}) {
	const ws = workspaceData.find((w) => w.id === entry.entityId);
	return (
		<CommandItem
			value={`workspace ${entry.entityId} ${ws?.projectName ?? ""} ${ws?.branch ?? ""}`}
			onSelect={onSelect}
			className={cn("gap-2.5", isCurrent && "bg-accent-tint/50")}
		>
			<span className="text-fg-mute text-xs shrink-0 w-24 text-left line-clamp-1">
				{ws?.projectName ?? "Workspace"}
			</span>
			<span className="flex items-center justify-center w-4 shrink-0">
				{ws ? (
					<span
						className="size-2 rounded-full"
						style={{ background: ws.projectColor }}
					/>
				) : null}
			</span>
			<span
				className={cn(
					"truncate text-xs font-normal flex-1 min-w-0",
					!ws && "text-fg-mute",
				)}
			>
				{ws?.branch ?? "Unknown"}
			</span>
		</CommandItem>
	);
}

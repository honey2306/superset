import {
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { cn } from "@superset/ui/utils";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";
import {
	type RecentlyViewedEntry,
	useRecentlyViewed,
} from "renderer/routes/_authenticated/_dashboard/components/NavigationControls/components/HistoryDropdown/hooks/useRecentlyViewed";
import {
	StatusIcon,
	type StatusType,
} from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useFrameStackStore } from "../../core/frames";

export function RecentlyViewedFrame() {
	const { t } = useTranslation();
	const recentEntries = useRecentlyViewed(20);
	const currentPath = useLocation({ select: (loc) => loc.pathname });
	const collections = useCollections();
	const setOpen = useFrameStackStore((s) => s.setOpen);
	const navigate = useNavigate();

	const { data: groups } = electronTrpc.workspaces.getAllGrouped.useQuery();
	const workspaceData = (groups ?? []).flatMap((group) =>
		group.workspaces.map((ws) => ({
			id: ws.id,
			projectName: group.project.name,
			projectColor: group.project.color,
			branch: ws.branch ?? ws.name,
		})),
	);

	const { data: taskData } = useLiveQuery(
		(q) =>
			q
				.from({ tasks: collections.tasks })
				.innerJoin({ status: collections.taskStatuses }, ({ tasks, status }) =>
					eq(tasks.statusId, status.id),
				)
				.select(({ tasks, status }) => ({
					id: tasks.id,
					slug: tasks.slug,
					title: tasks.title,
					statusColor: status.color,
					statusType: status.type,
					statusProgress: status.progressPercent,
				})),
		[collections],
	);

	const filteredEntries = recentEntries.filter((entry) => {
		if (entry.type === "workspace") {
			return workspaceData.some((w) => w.id === entry.entityId);
		}
		return (taskData ?? []).some(
			(t) => t.id === entry.entityId || t.slug === entry.entityId,
		);
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
					if (entry.type === "task") {
						return (
							<TaskRow
								key={entry.path}
								entry={entry}
								isCurrent={isCurrent}
								taskData={taskData ?? []}
								onSelect={() => navigateTo(entry.path)}
							/>
						);
					}
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
			className={cn("gap-2.5", isCurrent && "bg-accent/50")}
		>
			<span className="text-muted-foreground text-xs shrink-0 w-24 text-left line-clamp-1">
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
					!ws && "text-muted-foreground",
				)}
			>
				{ws?.branch ?? "Unknown"}
			</span>
		</CommandItem>
	);
}

function TaskRow({
	entry,
	isCurrent,
	taskData,
	onSelect,
}: RowProps & {
	taskData: {
		id: string;
		slug: string;
		title: string;
		statusColor: string;
		statusType: string;
		statusProgress: number | null;
	}[];
}) {
	const task = taskData.find(
		(t) => t.id === entry.entityId || t.slug === entry.entityId,
	);
	return (
		<CommandItem
			value={`task ${entry.entityId} ${task?.slug ?? ""} ${task?.title ?? ""}`}
			onSelect={onSelect}
			className={cn("gap-2.5", isCurrent && "bg-accent/50")}
		>
			<span className="text-muted-foreground text-xs shrink-0 w-24 text-left line-clamp-1">
				{task?.slug ?? "Task"}
			</span>
			<span className="flex items-center justify-center w-4 shrink-0">
				{task ? (
					<StatusIcon
						type={task.statusType as StatusType}
						color={task.statusColor}
						progress={task.statusProgress ?? undefined}
						className="size-3.5"
					/>
				) : null}
			</span>
			<span
				className={cn(
					"truncate text-xs font-normal flex-1 min-w-0",
					!task && "text-muted-foreground",
				)}
			>
				{task?.title ?? "Unknown"}
			</span>
		</CommandItem>
	);
}

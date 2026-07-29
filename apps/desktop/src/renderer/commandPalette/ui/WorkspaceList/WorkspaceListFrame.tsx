import {
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { cn } from "@superset/ui/utils";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { LuGitBranch } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useFrameStackStore } from "../../core/frames";
import { useCommandPaletteQuery } from "../CommandPalette/CommandPalette";

interface V1WorkspaceItem {
	id: string;
	name: string;
	branch: string;
	projectName: string;
	projectColor: string;
}

interface V1ProjectGroup {
	projectId: string;
	projectName: string;
	workspaces: V1WorkspaceItem[];
}

const ROW_CLASS =
	"gap-2.5 !py-2.5 text-sm [&_svg]:!size-4 [&_svg]:stroke-[1.5]";

function matchesQuery(
	workspace: Pick<V1WorkspaceItem, "name" | "branch" | "projectName">,
	query: string,
): boolean {
	if (!query) return true;
	const normalized = query.toLowerCase();
	return (
		workspace.name.toLowerCase().includes(normalized) ||
		workspace.branch.toLowerCase().includes(normalized) ||
		workspace.projectName.toLowerCase().includes(normalized)
	);
}

export function WorkspaceListFrame() {
	const rawQuery = useCommandPaletteQuery();
	const query = rawQuery.trim();

	return <V1WorkspaceList query={query} />;
}

function V1WorkspaceList({ query }: { query: string }) {
	const { t } = useTranslation();
	const { data: groups = [] } =
		electronTrpc.workspaces.getAllGrouped.useQuery();
	const currentPath = useLocation({ select: (loc) => loc.pathname });
	const navigate = useNavigate();
	const setOpen = useFrameStackStore((s) => s.setOpen);

	const projectGroups = useMemo<V1ProjectGroup[]>(() => {
		return groups.flatMap((group) => {
			const workspaces = group.workspaces
				.map((workspace) => ({
					id: workspace.id,
					name: workspace.name,
					branch: workspace.branch ?? workspace.name,
					projectName: group.project.name,
					projectColor: group.project.color,
				}))
				.filter((workspace) => matchesQuery(workspace, query));

			if (workspaces.length === 0) return [];
			return [
				{
					projectId: group.project.id,
					projectName: group.project.name,
					workspaces,
				},
			];
		});
	}, [groups, query]);

	const handleSelect = (workspaceId: string) => {
		void navigateToWorkspace(workspaceId, navigate);
		setOpen(false);
	};

	return (
		<CommandList>
			<CommandEmpty>{t("commandPalette.noWorkspaces")}</CommandEmpty>
			{projectGroups.map((group) => (
				<CommandGroup key={group.projectId} heading={group.projectName}>
					{group.workspaces.map((workspace) => (
						<CommandItem
							key={workspace.id}
							value={`workspace ${workspace.id} ${workspace.projectName} ${workspace.name} ${workspace.branch}`}
							onSelect={() => handleSelect(workspace.id)}
							className={cn(
								ROW_CLASS,
								currentPath === `/workspace/${workspace.id}` && "bg-accent/50",
							)}
						>
							<span className="flex w-4 shrink-0 items-center justify-center">
								<span
									className="size-2 rounded-full"
									style={{ background: workspace.projectColor }}
								/>
							</span>
							<span className="min-w-0 flex-1 truncate font-normal">
								{workspace.name}
							</span>
							<span className="flex min-w-0 max-w-48 items-center gap-1 text-muted-foreground text-xs">
								<LuGitBranch className="!size-3 shrink-0" />
								<span className="truncate">{workspace.branch}</span>
							</span>
						</CommandItem>
					))}
				</CommandGroup>
			))}
		</CommandList>
	);
}

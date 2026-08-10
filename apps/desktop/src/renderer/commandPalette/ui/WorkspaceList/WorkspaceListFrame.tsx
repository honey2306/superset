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
import { useTranslation } from "renderer/providers/I18nProvider";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useWorkspaceCatalog } from "renderer/routes/_authenticated/providers/WorkspaceCatalogProvider";
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
	const { projects, workspaces } = useWorkspaceCatalog();
	const currentPath = useLocation({ select: (loc) => loc.pathname });
	const navigate = useNavigate();
	const setOpen = useFrameStackStore((s) => s.setOpen);

	const projectGroups = useMemo<V1ProjectGroup[]>(() => {
		const projectNames = new Map(
			projects.map((project) => [project.id, project.name]),
		);
		const projectGroups = new Map<string, V1ProjectGroup>();
		for (const workspace of workspaces) {
			const projectName =
				projectNames.get(workspace.projectId) ?? workspace.projectId;
			const item = {
				id: workspace.id,
				name: workspace.name,
				branch: workspace.branch,
				projectName,
				projectColor: "hsl(var(--primary))",
			};
			if (!matchesQuery(item, query)) continue;
			const group = projectGroups.get(workspace.projectId) ?? {
				projectId: workspace.projectId,
				projectName,
				workspaces: [],
			};
			group.workspaces.push(item);
			projectGroups.set(workspace.projectId, group);
		}
		return Array.from(projectGroups.values());
	}, [projects, workspaces, query]);

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
								currentPath === `/workspace/${workspace.id}` &&
									"bg-accent-tint/50",
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
							<span className="flex min-w-0 max-w-48 items-center gap-1 text-fg-mute text-xs">
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

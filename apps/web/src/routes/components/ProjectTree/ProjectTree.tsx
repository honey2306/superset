import type { TreeProject } from "../../workspaces/utils/buildProjectTree/buildProjectTree";
import type { WorkspaceContentsLoadState } from "../../workspaces/utils/workspaceContentsLoader/workspaceContentsLoader";
import { TreeIcon } from "./TreeIcon";
import { WorkspaceTree } from "./WorkspaceTree";

export function ProjectTree({
	project,
	expanded,
	expandedWorkspaceIds,
	workspaceLoadStates,
	workspaceLoadErrors,
	onToggle,
	onWorkspaceToggle,
}: {
	project: TreeProject;
	expanded: boolean;
	expandedWorkspaceIds: ReadonlySet<string>;
	workspaceLoadStates: ReadonlyMap<string, WorkspaceContentsLoadState>;
	workspaceLoadErrors: ReadonlyMap<string, string>;
	onToggle: () => void;
	onWorkspaceToggle: (workspaceId: string) => void;
}) {
	const activeCount = project.workspaces.reduce(
		(total, workspace) =>
			total + workspace.leaves.filter((leaf) => leaf.running).length,
		0,
	);
	return (
		<section className="mobile-project-card">
			<button
				type="button"
				className="mobile-tree-control mobile-project-control"
				onClick={onToggle}
				aria-expanded={expanded}
			>
				<span
					className={`mobile-tree-chevron ${expanded ? "" : "is-collapsed"}`}
				>
					<TreeIcon name="chevron" />
				</span>
				<span className="mobile-tree-node-mark">
					<TreeIcon name="project" />
				</span>
				<span className="mobile-tree-copy">
					<span className="mobile-tree-title">{project.title}</span>
					<span className="mobile-tree-subtitle">
						{project.workspaces.length} workspaces · {activeCount} active
					</span>
				</span>
			</button>
			{expanded ? (
				<div className="mobile-project-contents">
					{project.workspaces.length > 0 ? (
						project.workspaces.map((workspace) => (
							<WorkspaceTree
								key={workspace.id}
								workspace={workspace}
								expanded={expandedWorkspaceIds.has(workspace.id)}
								loadState={workspaceLoadStates.get(workspace.id) ?? "idle"}
								loadError={workspaceLoadErrors.get(workspace.id)}
								onToggle={() => onWorkspaceToggle(workspace.id)}
							/>
						))
					) : (
						<p className="mobile-tree-helper">No workspaces in this project.</p>
					)}
				</div>
			) : null}
		</section>
	);
}

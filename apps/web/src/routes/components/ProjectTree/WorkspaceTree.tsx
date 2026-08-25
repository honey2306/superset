import { Link } from "react-router-dom";
import { getPhoneRoute } from "~/lib/phone-route";
import type { TreeWorkspace } from "../../workspaces/utils/buildProjectTree/buildProjectTree";
import type { WorkspaceContentsLoadState } from "../../workspaces/utils/workspaceContentsLoader/workspaceContentsLoader";
import { workspaceTabManagementPath } from "../../workspaces/utils/workspaceTabManagementPath/workspaceTabManagementPath";
import { TreeIcon } from "./TreeIcon";
import { TreeLeaf } from "./TreeLeaf";

export function WorkspaceTree({
	workspace,
	expanded,
	loadState,
	loadError,
	loadWarnings,
	onToggle,
}: {
	workspace: TreeWorkspace;
	expanded: boolean;
	loadState: WorkspaceContentsLoadState;
	loadError?: string;
	loadWarnings?: readonly string[];
	onToggle: () => void;
}) {
	const activeCount = workspace.leaves.filter((leaf) => leaf.running).length;
	const subtitle =
		loadState === "loading"
			? "Loading tabs…"
			: loadState === "error"
				? "Couldn’t load tabs · Tap to retry"
				: loadState === "idle"
					? "— tabs"
					: `${workspace.leaves.length} tabs · ${activeCount} active`;
	return (
		<div className="mobile-tree-workspace-wrap">
			<section className="mobile-tree-workspace">
				<button
					type="button"
					className="mobile-tree-control mobile-tree-workspace-control"
					onClick={onToggle}
					aria-expanded={expanded}
				>
					<span
						className={`mobile-tree-chevron ${expanded ? "" : "is-collapsed"}`}
					>
						<TreeIcon name="chevron" />
					</span>
					<span className="mobile-tree-node-mark">
						<TreeIcon name="workspace" />
					</span>
					<span className="mobile-tree-copy">
						<span className="mobile-tree-title">{workspace.title}</span>
						<span className="mobile-tree-subtitle">{subtitle}</span>
					</span>
				</button>
				{expanded ? (
					<div className="mobile-tree-workspace-contents">
						{loadState === "loading" ? (
							<p className="mobile-tree-helper">Loading workspace tabs…</p>
						) : null}
						{loadState === "error" ? (
							<p className="mobile-tree-helper" role="alert">
								{loadError ?? "Couldn’t load this workspace."}
							</p>
						) : null}
						{loadState === "loaded" && loadWarnings?.length ? (
							<p
								className="mobile-tree-helper mobile-tree-warning"
								aria-live="polite"
							>
								{loadWarnings.join(" ")}
							</p>
						) : null}
						{loadState === "loaded"
							? workspace.leaves.map((leaf) => (
									<TreeLeaf
										key={`${leaf.kind}:${leaf.id}`}
										leaf={leaf}
										workspaceId={workspace.id}
									/>
								))
							: null}
						{loadState === "loaded" ? (
							<Link
								to={getPhoneRoute(workspaceTabManagementPath(workspace.id))}
								className="mobile-new-tab-action"
							>
								<span aria-hidden="true">+</span>
								New tab
							</Link>
						) : null}
					</div>
				) : null}
			</section>
		</div>
	);
}

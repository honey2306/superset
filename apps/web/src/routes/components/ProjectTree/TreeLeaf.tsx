import { Link } from "react-router-dom";
import { getPhoneRoute } from "~/lib/phone-route";
import type { TreeLeaf as TreeLeafRecord } from "../../workspaces/utils/buildProjectTree/buildProjectTree";
import { TreeIcon } from "./TreeIcon";

export function TreeLeaf({
	leaf,
	workspaceId,
}: {
	leaf: TreeLeafRecord;
	workspaceId: string;
}) {
	const path =
		leaf.kind === "acp"
			? `/w/${encodeURIComponent(workspaceId)}/s/${encodeURIComponent(leaf.id)}`
			: `/w/${encodeURIComponent(workspaceId)}/t/${encodeURIComponent(leaf.id)}`;

	return (
		<div className="mobile-tree-leaf-wrap">
			<Link
				to={getPhoneRoute(path)}
				className={`mobile-tree-leaf ${leaf.kind === "acp" ? "is-acp" : ""} ${leaf.running ? "is-running" : ""}`}
			>
				<span className="mobile-tree-leaf-mark">
					<TreeIcon name={leaf.kind} />
				</span>
				<span className="mobile-tree-leaf-title">{leaf.title}</span>
				<span
					className={`mobile-tree-kind ${leaf.kind === "acp" ? "is-acp" : ""}`}
				>
					{leaf.kind === "acp" ? "ACP" : "TERM"}
				</span>
			</Link>
		</div>
	);
}

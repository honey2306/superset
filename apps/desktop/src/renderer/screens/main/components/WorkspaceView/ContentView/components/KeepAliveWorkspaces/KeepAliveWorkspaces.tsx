import { type ReactNode, useRef } from "react";

interface KeepAliveWorkspacesProps {
	workspaceId: string;
	renderWorkspace: (workspaceId: string, isActive: boolean) => ReactNode;
	validWorkspaceIds?: ReadonlySet<string>;
}

export function KeepAliveWorkspaces({
	workspaceId,
	renderWorkspace,
	validWorkspaceIds,
}: KeepAliveWorkspacesProps) {
	const visited = useRef(new Set<string>());
	if (validWorkspaceIds) {
		for (const id of visited.current) {
			if (id !== workspaceId && !validWorkspaceIds.has(id)) {
				visited.current.delete(id);
			}
		}
	}
	visited.current.add(workspaceId);

	return (
		<>
			{[...visited.current].map((id) => (
				<div
					key={id}
					data-workspace-content={id}
					aria-hidden={id !== workspaceId}
					className={id === workspaceId ? "h-full" : "hidden"}
				>
					{renderWorkspace(id, id === workspaceId)}
				</div>
			))}
		</>
	);
}

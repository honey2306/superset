import type { ExternalApp } from "@superset/shared/desktop-types";
import { useParams } from "@tanstack/react-router";
import { useCatalogWorkspaces } from "renderer/routes/_local/providers/WorkspaceCatalogProvider/selectors";
import { KeepAliveWorkspaces } from "./components/KeepAliveWorkspaces";
import { PanesWorkspace } from "./components/PanesWorkspace";

interface ContentViewProps {
	defaultExternalApp?: ExternalApp | null;
	onOpenInApp: () => void;
	onOpenQuickOpen: () => void;
	isActive?: boolean;
}

export function ContentView({
	isActive: isSurfaceActive = true,
}: ContentViewProps) {
	const { workspaceId } = useParams({ strict: false });
	const { workspaces, isReady } = useCatalogWorkspaces();

	if (workspaceId)
		return (
			<KeepAliveWorkspaces
				workspaceId={workspaceId}
				validWorkspaceIds={
					isReady
						? new Set(workspaces.map((workspace) => workspace.id))
						: undefined
				}
				renderWorkspace={(id, isWorkspaceActive) => (
					<PanesWorkspace
						workspaceId={id}
						isActive={isSurfaceActive && isWorkspaceActive}
					/>
				)}
			/>
		);

	return <div className="h-full bg-background" />;
}

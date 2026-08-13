import type { ExternalApp } from "@superset/shared/desktop-types";
import { useParams } from "@tanstack/react-router";
import { PanesWorkspace } from "./components/PanesWorkspace";

interface ContentViewProps {
	defaultExternalApp?: ExternalApp | null;
	onOpenInApp: () => void;
	onOpenQuickOpen: () => void;
}

export function ContentView(_props: ContentViewProps) {
	const { workspaceId } = useParams({ strict: false });

	if (workspaceId) return <PanesWorkspace workspaceId={workspaceId} />;

	return <div className="h-full bg-background" />;
}

import type { ExternalApp } from "@superset/local-db";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useParams } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useSidebarStore } from "renderer/stores/sidebar-state";
import { SidebarControl } from "../../SidebarControl";
import { ContentHeader } from "./ContentHeader";
import { PresetsBar } from "./components/PresetsBar";
import { useShowPresetsBar } from "./hooks/useShowPresetsBar";
import { TabsContent } from "./TabsContent";
import { GroupStrip } from "./TabsContent/GroupStrip";
import { V1PanesWorkspace } from "./TabsContent/V1PanesWorkspace";

interface ContentViewProps {
	defaultExternalApp?: ExternalApp | null;
	onOpenInApp: () => void;
	onOpenQuickOpen: () => void;
}

export function ContentView({
	defaultExternalApp,
	onOpenInApp,
	onOpenQuickOpen,
}: ContentViewProps) {
	const isSidebarOpen = useSidebarStore((s) => s.isSidebarOpen);
	const { showPresetsBar, toggleShowPresetsBar } = useShowPresetsBar();
	const { workspaceId } = useParams({ strict: false });
	const panesInV1Enabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.V2_PANES_IN_V1) ?? false;

	electronTrpc.menu.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (event.type === "toggle-presets-bar") {
				toggleShowPresetsBar();
			}
		},
	});

	// When the panes engine owns the view, it renders its own tab bar and
	// pane area. The v1 GroupStrip + PresetsBar + TabsContent shell (which
	// would otherwise double-render a tab bar) is replaced wholesale.
	if (panesInV1Enabled && workspaceId) {
		return <V1PanesWorkspace workspaceId={workspaceId} />;
	}

	return (
		<div className="h-full flex flex-col overflow-hidden">
			<ContentHeader
				trailingAction={!isSidebarOpen ? <SidebarControl /> : undefined}
			>
				<GroupStrip />
			</ContentHeader>
			{showPresetsBar && <PresetsBar />}
			<TabsContent
				defaultExternalApp={defaultExternalApp}
				onOpenInApp={onOpenInApp}
				onOpenQuickOpen={onOpenQuickOpen}
			/>
		</div>
	);
}

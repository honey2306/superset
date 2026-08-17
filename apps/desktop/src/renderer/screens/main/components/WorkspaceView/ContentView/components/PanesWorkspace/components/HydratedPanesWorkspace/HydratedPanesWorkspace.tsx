import { Workspace } from "@superset/panes";
import { useEffect } from "react";
import { useAcpSessionStatusMapsAtHost } from "renderer/hooks/host-service/useAcpSessionStatuses";
import { useTerminalAgentStatusesAtHost } from "renderer/hooks/host-service/useTerminalAgentStatuses";
import {
	type PanesStore,
	registerPanesStore,
	unregisterPanesStore,
} from "renderer/lib/panes";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import {
	getPanesTabStatus,
	syncPanesAcpStatuses,
	syncPanesTerminalStatuses,
} from "../../createPanesTerminalPaneBridge";
import { PanesPresetBar } from "../../PanesPresetBar";
import { useAcpSessionOpenRequests } from "../../useAcpSessionOpenRequests";
import { usePanesDeepLinkConsumer } from "../../usePanesDeepLinkConsumer";
import { usePanesHotkeys } from "../../usePanesHotkeys";
import { usePanesWorkspace } from "../../usePanesWorkspace";

interface HydratedPanesWorkspaceProps {
	workspaceId: string;
	store: PanesStore;
	hostUrl: string | null;
	hostWorkspaceId: string | null;
}

export function HydratedPanesWorkspace({
	workspaceId,
	store,
	hostUrl,
	hostWorkspaceId,
}: HydratedPanesWorkspaceProps) {
	const { registry, launcher, paneActions, contextMenuActions, openers } =
		usePanesWorkspace(workspaceId, store, { hostUrl, hostWorkspaceId });
	const terminalStatuses = useTerminalAgentStatusesAtHost(
		hostUrl,
		hostWorkspaceId,
	);
	const {
		sessionStatuses: acpStatuses,
		notificationStatuses: acpNotificationStatuses,
		sessionTitles: acpTitles,
	} = useAcpSessionStatusMapsAtHost(hostUrl, hostWorkspaceId);
	useAcpSessionOpenRequests({ store, hostUrl, hostWorkspaceId });

	useEffect(() => {
		syncPanesTerminalStatuses(store, terminalStatuses);
	}, [store, terminalStatuses]);

	useEffect(() => {
		syncPanesAcpStatuses(
			store,
			acpStatuses,
			acpNotificationStatuses,
			acpTitles,
		);
	}, [store, acpStatuses, acpNotificationStatuses, acpTitles]);

	usePanesHotkeys({
		store,
		registry,
		launcher,
		addTerminalTab: openers.addTerminalTab,
	});
	usePanesDeepLinkConsumer({ store, hostUrl, hostWorkspaceId });

	useEffect(() => {
		registerPanesStore(workspaceId, store);
		return () => unregisterPanesStore(workspaceId, store);
	}, [workspaceId, store]);

	return (
		<div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
			<Workspace
				className="flex-1"
				store={store}
				registry={registry}
				paneActions={paneActions}
				contextMenuActions={contextMenuActions}
				onAddTab={openers.addTerminalTab}
				renderTabAccessory={(tab) => {
					const status = getPanesTabStatus(tab);
					return status ? <StatusIndicator status={status} /> : null;
				}}
				renderBelowTabBar={() => (
					<PanesPresetBar
						openers={openers}
						store={store}
						workspaceId={workspaceId}
					/>
				)}
			/>
		</div>
	);
}

import { useAcpSession } from "@superset/session-protocol/react";
import { getAcpAgentLabel } from "@superset/shared/agent-catalog";
import { useMemo } from "react";
import { createDesktopAcpSessionClient } from "renderer/lib/acp-session-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { AcpTimeline } from "renderer/screens/main/components/WorkspaceView/ContentView/components/AcpSessionPane/components/AcpTimeline";
import {
	AcpPermissionCard,
	isAskUserPermission,
} from "renderer/screens/main/components/WorkspaceView/ContentView/components/AcpSessionPane/components/AcpTimeline/components/AcpToolCallItem/components/AcpPermissionCard";
import "renderer/screens/main/components/WorkspaceView/ContentView/components/AcpSessionPane/acp-pane.css";
import type { ManagedRun } from "../../task-types";

/** Read/permission UI only. Unmount detaches the stream; it never cancels/closes a run. */
export function TaskExecution({
	hostUrl,
	run,
}: {
	hostUrl: string;
	run: ManagedRun;
}) {
	const { t } = useTranslation();
	const client = useMemo(
		() => createDesktopAcpSessionClient(hostUrl),
		[hostUrl],
	);
	const streamUrl = useMemo(
		() => client.streamUrl(run.sessionId),
		[client, run.sessionId],
	);
	const session = useAcpSession({
		sessionId: run.sessionId,
		connectionKey: hostUrl,
		api: client.api,
		streamUrl,
		enabled: run.dispatchedAt !== null,
	});
	if (!run.dispatchedAt)
		return (
			<p className="p-6 text-sm text-muted-foreground">
				{t("agentTasks.starting")}
			</p>
		);
	return (
		<div className="acp-pane">
			{session.error && (
				<p
					role="alert"
					className="select-text cursor-text p-3 text-sm text-destructive"
				>
					{session.error.message}
				</p>
			)}
			<AcpTimeline
				className="acp-pane__body"
				sessionId={run.sessionId}
				timeline={session.timeline}
				onRespond={session.actions.respondToPermission}
				cwd={run.cwd}
				model={run.contract.model}
				agentLabel={getAcpAgentLabel(run.contract.harness)}
				status={session.state?.status}
				isFocused
				hasOlder={session.hasOlder}
				isLoadingOlder={session.isLoadingOlder}
				historyError={session.historyError}
				onLoadOlder={session.loadOlder}
				turnIndex={session.turnIndex}
				totalTurns={session.totalTurns}
				loadedTurnNumbers={session.loadedTurnNumbers}
				onLoadTurn={session.loadTurn}
			/>
			{session.state?.pendingPermissions[0] && (
				<div className="shrink-0 max-h-[45%] overflow-auto border-t p-3">
					<AcpPermissionCard
						key={session.state.pendingPermissions[0].requestId}
						permission={{
							...session.state.pendingPermissions[0],
							resolution: null,
						}}
						variant={
							isAskUserPermission(
								session.state.pendingPermissions[0],
								undefined,
							)
								? "askuser"
								: "permission"
						}
						pendingCount={session.state.pendingPermissions.length}
						onRespond={session.actions.respondToPermission}
					/>
				</div>
			)}
		</div>
	);
}

import type {
	RequestPermissionOutcome,
	SessionStatus,
} from "@superset/session-protocol";
import {
	useAcpPermissions,
	useAcpSession,
} from "@superset/session-protocol/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createDesktopAcpSessionClient } from "renderer/lib/acp-session-client";
import "./acp-pane.css";
import { AcpComposer } from "./components/AcpComposer";
import { AcpSessionError } from "./components/AcpSessionError";
import { AcpStatusBar } from "./components/AcpStatusBar";
import { AcpTimeline } from "./components/AcpTimeline";
import { AcpPermissionCard } from "./components/AcpTimeline/components/AcpToolCallItem/components/AcpPermissionCard";

export interface AcpSessionPaneProps {
	sessionId: string;
	hostUrl: string;
	workspaceId: string;
	cwd: string;
	onSessionMetadataChange(input: {
		title: string | null;
		status: SessionStatus;
	}): void;
}

export function AcpSessionPane({
	sessionId,
	hostUrl,
	workspaceId,
	cwd,
	onSessionMetadataChange,
}: AcpSessionPaneProps) {
	// Stabilize the client across renders — a fresh client per render means a
	// fresh api object + streamUrl closure, which can trigger useAcpSession to
	// tear down and re-initialize when the pane is only re-rendered (e.g. tab
	// switches). We only rebuild when hostUrl actually changes.
	const client = useMemo(
		() => createDesktopAcpSessionClient(hostUrl),
		[hostUrl],
	);
	const streamUrl = useMemo(
		() => client.streamUrl(sessionId),
		[client, sessionId],
	);

	const session = useAcpSession({
		sessionId,
		api: client.api,
		streamUrl,
	});

	const permissions = useAcpPermissions(session);

	const [mutationError, setMutationError] = useState<string | null>(null);
	const [isCancelling, setIsCancelling] = useState(false);

	const handleRespond = useCallback(
		(requestId: string, outcome: RequestPermissionOutcome) => {
			setMutationError(null);
			void permissions.respond(requestId, outcome).catch((err) => {
				setMutationError(
					err instanceof Error
						? `Permission response failed: ${err.message}`
						: "Permission response failed",
				);
			});
		},
		[permissions],
	);

	const handleCancel = useCallback(() => {
		setMutationError(null);
		setIsCancelling(true);
		void session.actions
			.cancel()
			.catch((err) => {
				setMutationError(
					err instanceof Error
						? `Cancel failed: ${err.message}`
						: "Cancel failed",
				);
			})
			.finally(() => setIsCancelling(false));
	}, [session.actions]);

	const lastMetaRef = useRef<{
		title: string | null;
		status: SessionStatus;
	} | null>(null);
	useEffect(() => {
		const state = session.state;
		if (!state) return;
		const next = { title: state.title, status: state.status };
		const last = lastMetaRef.current;
		if (last?.title === next.title && last?.status === next.status) return;
		lastMetaRef.current = next;
		onSessionMetadataChange(next);
	}, [session.state, onSessionMetadataChange]);

	if (session.isLoading && !session.state) {
		return (
			<div className="acp-pane">
				<div className="acp-pane__empty">
					<div className="acp-pane__empty-title">Loading session…</div>
				</div>
			</div>
		);
	}

	if (session.error && !session.state) {
		const msg = session.error.message;
		const isOfflineRow = msg.toLowerCase().includes("not found");
		return (
			<div className="acp-pane">
				<AcpSessionError
					message={
						isOfflineRow
							? "Session could not be resumed"
							: `Failed to load session: ${msg}`
					}
					onRetry={() => void session.actions.refresh()}
				/>
			</div>
		);
	}

	const state = session.state;
	const isResumeFailure =
		!!session.error && !!state && state.status === "offline";
	const composerStatus = isResumeFailure
		? "dead"
		: session.error
			? "dead"
			: state?.status;

	if (isResumeFailure) {
		return (
			<div className="acp-pane">
				<AcpSessionError
					message="Session could not be resumed"
					hint={session.error?.message}
					onRetry={() => void session.actions.refresh()}
				/>
			</div>
		);
	}

	return (
		<div className="acp-pane">
			{session.streamStatus === "reconnecting" && (
				<div className="acp-pane__banner" data-tone="warn">
					<span className="acp-blink" aria-hidden>
						●
					</span>
					<span className="select-text cursor-text">Reconnecting…</span>
				</div>
			)}

			{session.streamStatus === "connecting" && (
				<div className="acp-pane__banner">
					<span className="acp-blink" aria-hidden>
						●
					</span>
					<span className="select-text cursor-text">Connecting…</span>
				</div>
			)}

			{mutationError && (
				<div className="acp-pane__banner" data-tone="error">
					<span className="select-text cursor-text">{mutationError}</span>
					<span className="acp-pane__banner-spacer" />
					<button type="button" onClick={() => setMutationError(null)}>
						Dismiss
					</button>
				</div>
			)}

			{session.error && (
				<div className="acp-pane__banner" data-tone="error">
					<span className="select-text cursor-text">
						{session.error.message}
					</span>
					<span className="acp-pane__banner-spacer" />
					<button type="button" onClick={() => void session.actions.refresh()}>
						Retry
					</button>
				</div>
			)}

			<AcpTimeline
				className="acp-pane__body"
				timeline={session.timeline}
				onRespond={handleRespond}
				hasOlder={session.hasOlder}
				isLoadingOlder={session.isLoadingOlder}
				onLoadOlder={session.loadOlder}
			/>

			<div className="acp-pane__composer-wrap">
				{permissions.pending.length > 0 && (
					<div
						className="acp-pane__perm-float"
						role="alertdialog"
						aria-modal="true"
						aria-label="Permission required"
					>
						<AcpPermissionCard
							permission={{
								...permissions.pending[0],
								resolution: null,
							}}
							onRespond={handleRespond}
						/>
					</div>
				)}

				<AcpComposer
					status={composerStatus}
					isLoading={session.isLoading}
					isCancelling={isCancelling}
					workspaceId={workspaceId}
					cwd={cwd}
					commands={session.timeline.meta.availableCommands}
					configOptions={state?.configOptions ?? []}
					searchFiles={(query) =>
						client.searchFiles?.({ workspaceId, cwd, query }) ??
						Promise.resolve([])
					}
					onSetMode={session.actions.setMode}
					onSetConfigOption={session.actions.setConfigOption}
					onSubmit={async (blocks) => {
						await session.actions.prompt(blocks);
					}}
					onCancel={handleCancel}
				/>
			</div>

			{state && (
				<AcpStatusBar
					state={state}
					usage={session.timeline.meta.usage}
					streamStatus={session.streamStatus}
				/>
			)}
		</div>
	);
}

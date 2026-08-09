import type {
	RequestPermissionOutcome,
	SessionConfigOption,
	SessionStatus,
	TimelineItem,
	ToolCallUpdate,
} from "@superset/session-protocol";
import {
	useAcpPermissions,
	useAcpSession,
} from "@superset/session-protocol/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeWorkspaceFilePath } from "renderer/components/Chat/ChatInterface/utils/file-paths";
import { createDesktopAcpSessionClient } from "renderer/lib/acp-session-client";
import { useTabsStore } from "renderer/stores/tabs/store";
import "./acp-pane.css";
import { AcpComposer } from "./components/AcpComposer";
import { AcpEmptyState } from "./components/AcpEmptyState";
import { AcpSessionError } from "./components/AcpSessionError";
import { AcpStatusBar } from "./components/AcpStatusBar";
import { AcpTimeline, type AcpTimelineHandle } from "./components/AcpTimeline";
import {
	AcpPermissionCard,
	isAskUserPermission,
} from "./components/AcpTimeline/components/AcpToolCallItem/components/AcpPermissionCard";

function modelLabel(
	options: readonly SessionConfigOption[],
): string | undefined {
	const option = options.find((item) => {
		if (item.type !== "select") return false;
		if (item.category === "model") return true;
		const name = item.name?.toLowerCase() ?? "";
		const id = item.id.toLowerCase();
		return name === "model" || id === "model" || id.endsWith(".model");
	});
	if (!option) return undefined;

	const value = option.currentValue;
	return value == null || value === "" ? undefined : String(value);
}

function findToolCall(
	items: readonly TimelineItem[],
	toolCallId: string,
): ToolCallUpdate | undefined {
	for (const item of items) {
		if (item.kind !== "tool_call") continue;
		if (item.id === toolCallId) return item.call;
		const child = findToolCall(item.children, toolCallId);
		if (child) return child;
	}
	return undefined;
}

function userMessageText(
	item: Extract<TimelineItem, { kind: "message" }>,
): string {
	return item.blocks
		.filter(
			(
				block,
			): block is Extract<(typeof item.blocks)[number], { type: "text" }> =>
				block.type === "text",
		)
		.map((block) => block.text)
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * The most recent user prompt — used by the toolbar/status bar so it tracks
 * the current thread of work while the tab keeps a stable subject.
 */
export function getLatestUserMessageTitle(
	items: readonly TimelineItem[],
): string | null {
	for (let index = items.length - 1; index >= 0; index -= 1) {
		const item = items[index];
		if (item?.kind !== "message" || item.role !== "user") continue;
		const text = userMessageText(item);
		if (text) return text;
	}
	return null;
}

export interface AcpSessionPaneProps {
	sessionId: string;
	hostUrl: string;
	workspaceId: string;
	/** Renderer workspace id used for opening a diff target in the panes store. */
	rendererWorkspaceId: string;
	cwd: string;
	/** Human-readable name for the agent (e.g. "Claude Code"). Shown in message author labels. */
	agentLabel?: string;
	/** Suppress transient 404s while the launcher creates this known session. */
	isLaunching?: boolean;
	/** Creation failure kept with the pane instead of dropping the new tab. */
	creationError?: string;
	onRetryLaunch?: () => void;
	onSessionMetadataChange(input: {
		/** Stable session subject for the tab title. */
		title: string | null;
		/** Latest user prompt for the toolbar/status bar. */
		latestUserMessage: string | null;
		status: SessionStatus;
	}): void;
}

export function AcpSessionPane({
	sessionId,
	hostUrl,
	workspaceId,
	rendererWorkspaceId,
	cwd,
	agentLabel,
	isLaunching = false,
	creationError,
	onRetryLaunch,
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
		initiallyLaunching: isLaunching,
	});

	const permissions = useAcpPermissions(session);
	const addFileViewerPane = useTabsStore((store) => store.addFileViewerPane);
	const openFileFromTool = useCallback(
		(path: string) => {
			const filePath = normalizeWorkspaceFilePath({
				filePath: path,
				workspaceRoot: cwd,
			});
			if (!filePath) return;
			addFileViewerPane(rendererWorkspaceId, { filePath });
		},
		[addFileViewerPane, cwd, rendererWorkspaceId],
	);

	const [mutationError, setMutationError] = useState<string | null>(null);
	const [isCancelling, setIsCancelling] = useState(false);
	const [isUpdatingSession, setIsUpdatingSession] = useState(false);
	const handleSessionUpdate = useCallback(
		async (action: () => Promise<void>) => {
			setMutationError(null);
			setIsUpdatingSession(true);
			try {
				await action();
			} catch (err) {
				setMutationError(
					err instanceof Error
						? `Session update failed: ${err.message}`
						: "Session update failed",
				);
			} finally {
				setIsUpdatingSession(false);
			}
		},
		[],
	);

	const handleRespond = useCallback(
		async (requestId: string, outcome: RequestPermissionOutcome) => {
			setMutationError(null);
			try {
				await permissions.respond(requestId, outcome);
			} catch (err) {
				setMutationError(
					err instanceof Error
						? `Permission response failed: ${err.message}`
						: "Permission response failed",
				);
				throw err;
			}
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

	const timelineRef = useRef<AcpTimelineHandle>(null);
	const hasUserMessage = session.timeline.items.some(
		(item) => item.kind === "message" && item.role === "user",
	);
	const handleJumpToLastUserMessage = useCallback(() => {
		timelineRef.current?.scrollToLastUserMessage();
	}, []);

	const lastMetaRef = useRef<{
		title: string | null;
		latestUserMessage: string | null;
		status: SessionStatus;
	} | null>(null);
	useEffect(() => {
		const state = session.state;
		if (!state) return;
		// The tab title is fed exclusively by session_info_update — host-side
		// title generation (Claude Code / Codex style) writes into state.title
		// after the first prompt. Falling back to the raw first user message
		// would let sensitive prompt text land in the tab strip before the
		// summary arrives; the panes registry falls back to the agent label.
		const next = {
			title: state.title,
			latestUserMessage: getLatestUserMessageTitle(session.timeline.items),
			status: state.status,
		};
		const last = lastMetaRef.current;
		if (
			last?.title === next.title &&
			last?.latestUserMessage === next.latestUserMessage &&
			last?.status === next.status
		)
			return;
		lastMetaRef.current = next;
		onSessionMetadataChange(next);
	}, [session.state, session.timeline.items, onSessionMetadataChange]);

	if (
		(session.isLoading || isLaunching || session.availability === "retrying") &&
		!session.state
	) {
		return (
			<div className="acp-pane">
				<AcpEmptyState
					sessionId={sessionId}
					cwd={cwd}
					agentLabel={agentLabel}
				/>
			</div>
		);
	}

	if (creationError && !session.state) {
		return (
			<div className="acp-pane">
				<AcpSessionError
					message="Failed to start session"
					hint={creationError}
					onRetry={onRetryLaunch ?? (() => void session.actions.refresh())}
				/>
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
	const model =
		modelLabel(session.timeline.meta.configOptions ?? []) ??
		modelLabel(state?.configOptions ?? []);
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
				ref={timelineRef}
				className="acp-pane__body"
				sessionId={sessionId}
				timeline={session.timeline}
				onRespond={handleRespond}
				cwd={cwd}
				model={model}
				onOpenFile={openFileFromTool}
				agentLabel={agentLabel}
				status={state?.status}
			/>

			<div className="acp-pane__composer-wrap">
				{permissions.pending.length > 0 &&
					(() => {
						const pending = permissions.pending[0];
						const sourceToolCall = findToolCall(
							session.timeline.items,
							pending.toolCall.toolCallId,
						);
						const isAskUser = isAskUserPermission(pending, sourceToolCall);
						return (
							<div
								className="acp-pane__perm-float"
								data-type={isAskUser ? "askuser" : "permission"}
								role="alertdialog"
								aria-modal="true"
								aria-label={
									isAskUser
										? "Agent is asking a question"
										: "Permission required"
								}
							>
								<AcpPermissionCard
									key={pending.requestId}
									permission={{
										...pending,
										resolution: null,
									}}
									variant={isAskUser ? "askuser" : "permission"}
									sourceToolCall={sourceToolCall}
									pendingCount={permissions.pending.length}
									onRespond={handleRespond}
								/>
							</div>
						);
					})()}

				<AcpComposer
					sessionId={sessionId}
					status={composerStatus}
					isLoading={session.isLoading}
					isCancelling={isCancelling}
					workspaceId={workspaceId}
					cwd={cwd}
					commands={session.timeline.meta.availableCommands}
					configOptions={state?.configOptions ?? []}
					queuedPrompts={state?.queuedPrompts ?? []}
					searchFiles={(query) =>
						client.searchFiles?.({ workspaceId, cwd, query }) ??
						Promise.resolve([])
					}
					onSetMode={session.actions.setMode}
					onSetConfigOption={session.actions.setConfigOption}
					onSubmit={async (blocks) => {
						await session.actions.prompt(blocks);
					}}
					onEnqueue={async (blocks) => {
						await session.actions.enqueue(blocks);
					}}
					onRemoveQueued={session.actions.removeQueued}
					onReorderQueue={session.actions.reorderQueue}
					onEditQueued={session.actions.editQueued}
					onCancel={handleCancel}
					onJumpToLastUserMessage={
						hasUserMessage ? handleJumpToLastUserMessage : undefined
					}
				/>
			</div>

			{state && (
				<AcpStatusBar
					state={state}
					hostUrl={hostUrl}
					usage={session.timeline.meta.usage}
					currentMode={session.timeline.meta.currentMode}
					configOptions={session.timeline.meta.configOptions}
					isSubmitting={isUpdatingSession}
					onSetMode={(modeId) =>
						handleSessionUpdate(() => session.actions.setMode(modeId))
					}
					onSetConfigOption={(optionId, value) =>
						handleSessionUpdate(() =>
							session.actions.setConfigOption(optionId, value),
						)
					}
				/>
			)}
		</div>
	);
}

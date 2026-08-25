import type {
	RequestPermissionOutcome,
	SessionConfigOption,
	SessionModeState,
	SessionStatus,
	TimelineItem,
	ToolCallUpdate,
} from "@superset/session-protocol";
import {
	useAcpPermissions,
	useAcpSession,
} from "@superset/session-protocol/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createDesktopAcpSessionClient } from "renderer/lib/acp-session-client";
import { openFileInPanes } from "renderer/lib/panes";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useProjectDefaultApp } from "renderer/routes/_local/hooks/useProjectDefaultApp";
import { useCatalogWorkspace } from "renderer/routes/_local/providers/WorkspaceCatalogProvider/selectors";
import { normalizeWorkspaceFilePath } from "renderer/screens/main/components/WorkspaceView/ContentView/components/AcpSessionPane/utils/file-paths";
import { useNotificationStore } from "renderer/stores/notifications";
import "./acp-pane.css";
import { AcpComposer } from "./components/AcpComposer";
import { AcpEmptyState } from "./components/AcpEmptyState";
import type { MarkdownFileTarget } from "./components/AcpMarkdown/linkifyAcpMarkdown";
import { AcpSessionError } from "./components/AcpSessionError";
import { AcpStatusBar } from "./components/AcpStatusBar";
import { AcpTimeline, type AcpTimelineHandle } from "./components/AcpTimeline";
import {
	AcpPermissionCard,
	isAskUserPermission,
} from "./components/AcpTimeline/components/AcpToolCallItem/components/AcpPermissionCard";
import { useRetainedAcpConnection } from "./hooks/useRetainedAcpConnection";
import { registerJumpHandler } from "./paneJumpRegistry";
import { isContextCompacting } from "./utils/contextCompaction";

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

export function modeLooksLikePlan(mode: SessionModeState): boolean {
	const selected = mode.availableModes.find(
		(candidate) => candidate.id === mode.currentModeId,
	);
	return /plan/i.test(`${mode.currentModeId} ${selected?.name ?? ""}`);
}

/** Keep the mounted ACP subtree aligned with the backend session identity. */
export function acpSessionPaneKey(sessionId: string): string {
	return `acp-session:${sessionId}`;
}

export function canReviewPlanForMode(
	mode: SessionModeState | null,
	pendingPermissionCount: number,
): boolean {
	return (
		mode !== null && pendingPermissionCount === 0 && modeLooksLikePlan(mode)
	);
}

export function shouldEnableAcpSession({
	isVisible,
	isConnectionEnabled,
}: {
	isVisible: boolean;
	isConnectionEnabled: boolean;
}): boolean {
	return isVisible || isConnectionEnabled;
}

/** Pick the execution mode used after a user approves a proposed plan. */
export function planExecutionModeId(
	mode: SessionModeState | null,
): string | null {
	if (!mode || !modeLooksLikePlan(mode)) return null;
	return (
		mode.availableModes.find(
			(candidate) => candidate.id === "bypassPermissions",
		)?.id ??
		mode.availableModes.find((candidate) => candidate.id === "default")?.id ??
		mode.availableModes.find(
			(candidate) => !/plan/i.test(`${candidate.id} ${candidate.name}`),
		)?.id ??
		null
	);
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
	/** Whether this pane is currently visible and selected. */
	isFocused?: boolean;
	/** Whether this pane's workspace surface and tab are currently displayed. */
	isVisible?: boolean;
	/** Creation failure kept with the pane instead of dropping the new tab. */
	creationError?: string;
	onRetryLaunch?: () => void;
	onSessionMetadataChange(input: {
		/** Latest agent-provided session title for the pane status bar. */
		latestAgentTitle: string | null;
		/** Latest user prompt used while no agent status title is available. */
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
	isFocused = false,
	isVisible = true,
	creationError,
	onRetryLaunch,
	onSessionMetadataChange,
}: AcpSessionPaneProps) {
	const { workspace } = useCatalogWorkspace(workspaceId);
	const { app: defaultOpenInApp } = useProjectDefaultApp(workspace?.projectId);
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
	const { isConnectionEnabled, recordActivity } = useRetainedAcpConnection({});

	const session = useAcpSession({
		sessionId,
		connectionKey: hostUrl,
		api: client.api,
		streamUrl,
		initiallyLaunching: isLaunching,
		enabled: shouldEnableAcpSession({ isVisible, isConnectionEnabled }),
	});

	const promptWithActivity = useCallback(
		async (blocks: Parameters<typeof session.actions.prompt>[0]) => {
			await session.actions.prompt(blocks);
			recordActivity();
		},
		[recordActivity, session.actions],
	);
	const enqueueWithActivity = useCallback(
		async (blocks: Parameters<typeof session.actions.enqueue>[0]) => {
			await session.actions.enqueue(blocks);
			recordActivity();
		},
		[recordActivity, session.actions],
	);

	const permissions = useAcpPermissions(session);
	const markAcpSessionSeen = useNotificationStore(
		(state) => state.markAcpSessionSeen,
	);
	useEffect(() => {
		if (
			!isFocused ||
			typeof document === "undefined" ||
			typeof window === "undefined"
		)
			return;
		const markSeenIfVisible = () => {
			const state = session.state;
			if (
				document.hidden ||
				!document.hasFocus() ||
				!state ||
				(state.status !== "idle" && state.status !== "offline") ||
				state.lastStopReason === null ||
				typeof state.lastCompletedAt !== "number"
			)
				return;
			markAcpSessionSeen(sessionId, state.lastCompletedAt);
		};
		markSeenIfVisible();
		document.addEventListener("visibilitychange", markSeenIfVisible);
		window.addEventListener("focus", markSeenIfVisible);
		return () => {
			document.removeEventListener("visibilitychange", markSeenIfVisible);
			window.removeEventListener("focus", markSeenIfVisible);
		};
	}, [isFocused, markAcpSessionSeen, session.state, sessionId]);

	const openFileFromTool = useCallback(
		(path: string) => {
			const filePath = normalizeWorkspaceFilePath({
				filePath: path,
				workspaceRoot: cwd,
			});
			if (!filePath) return;
			openFileInPanes(rendererWorkspaceId, { filePath });
		},
		[cwd, rendererWorkspaceId],
	);
	const openFileFromMarkdown = useCallback(
		(target: MarkdownFileTarget, openExternally: boolean) => {
			const filePath = normalizeWorkspaceFilePath({
				filePath: target.path,
				workspaceRoot: cwd,
			});
			if (!filePath) return;
			if (openExternally) {
				void electronTrpcClient.external.openInApp.mutate({
					path: filePath,
					app: defaultOpenInApp ?? "cursor",
					...(target.line === undefined ? {} : { line: target.line }),
					...(target.column === undefined ? {} : { column: target.column }),
				});
				return;
			}
			openFileInPanes(rendererWorkspaceId, {
				filePath,
				line: target.line,
				column: target.column,
			});
		},
		[cwd, defaultOpenInApp, rendererWorkspaceId],
	);
	const openUrlFromMarkdown = useCallback((url: string) => {
		void electronTrpcClient.external.openUrl.mutate(url);
	}, []);

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
	// Publish the jump handler so the pane toolbar (rendered in a sibling
	// header slot by the pane system, without access to the timeline ref)
	// can trigger the same behaviour on click.
	useEffect(() => {
		return registerJumpHandler(sessionId, handleJumpToLastUserMessage);
	}, [sessionId, handleJumpToLastUserMessage]);

	const lastMetaRef = useRef<{
		latestAgentTitle: string | null;
		latestUserMessage: string | null;
		status: SessionStatus;
	} | null>(null);
	useEffect(() => {
		const state = session.state;
		if (!state) return;
		// session_info_update is mutable agent activity metadata. The pane store
		// keeps its first meaningful value as the stable tab label and routes
		// subsequent values to the status bar.
		const next = {
			latestAgentTitle: state.title,
			latestUserMessage: getLatestUserMessageTitle(session.timeline.items),
			status: state.status,
		};
		const last = lastMetaRef.current;
		if (
			last?.latestAgentTitle === next.latestAgentTitle &&
			last?.latestUserMessage === next.latestUserMessage &&
			last?.status === next.status
		)
			return;
		lastMetaRef.current = next;
		onSessionMetadataChange(next);
	}, [session.state, session.timeline.items, onSessionMetadataChange]);

	const state = session.state;
	const currentMode =
		session.timeline.meta.currentMode ?? state?.currentMode ?? null;
	const handleApprovePlan = useCallback(
		(feedback?: string) =>
			handleSessionUpdate(async () => {
				const executionModeId = planExecutionModeId(currentMode);
				if (executionModeId && executionModeId !== currentMode?.currentModeId) {
					await session.actions.setMode(executionModeId);
				}
				const suffix = feedback?.trim()
					? `\n\nAdditional feedback:\n${feedback.trim()}`
					: "";
				await promptWithActivity([
					{
						type: "text",
						text: `The plan is approved. Proceed with implementation.${suffix}`,
					},
				]);
			}),
		[currentMode, handleSessionUpdate, promptWithActivity, session.actions],
	);
	const handleRequestPlanChanges = useCallback(
		(feedback: string) =>
			handleSessionUpdate(async () => {
				await promptWithActivity([
					{
						type: "text",
						text: `Please revise the plan with this feedback:\n\n${feedback.trim()}`,
					},
				]);
			}),
		[handleSessionUpdate, promptWithActivity],
	);

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
	const isCompacting = isContextCompacting(
		session.timeline.items,
		state?.status,
	);
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
			{isCompacting && (
				<output
					className="acp-pane__banner"
					data-activity="context-compaction"
					aria-live="polite"
				>
					<span className="acp-blink" aria-hidden>
						●
					</span>
					<span className="select-text cursor-text">Compacting context…</span>
				</output>
			)}

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
				onOpenMarkdownFile={openFileFromMarkdown}
				onOpenUrl={openUrlFromMarkdown}
				agentLabel={agentLabel}
				status={state?.status}
				isFocused={isFocused}
				hasOlder={session.hasOlder}
				isLoadingOlder={session.isLoadingOlder}
				historyError={session.historyError}
				onLoadOlder={session.loadOlder}
				turnIndex={session.turnIndex}
				totalTurns={session.totalTurns}
				loadedTurnNumbers={session.loadedTurnNumbers}
				onLoadTurn={session.loadTurn}
				canReviewPlan={canReviewPlanForMode(
					currentMode,
					permissions.pending.length,
				)}
				isReviewingPlan={isUpdatingSession}
				onApprovePlan={handleApprovePlan}
				onRequestPlanChanges={handleRequestPlanChanges}
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
					onSubmit={promptWithActivity}
					onEnqueue={enqueueWithActivity}
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

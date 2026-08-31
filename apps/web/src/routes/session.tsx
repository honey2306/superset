import {
	type ContentBlock,
	isAskUserPermission,
} from "@superset/session-protocol";
import {
	useAcpPermissions,
	useAcpSession,
} from "@superset/session-protocol/react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Composer } from "~/components/Composer";
import { useTimelineAutoFollow } from "~/components/Timeline/hooks/useTimelineAutoFollow";
import { PermissionCard } from "~/components/Timeline/PermissionCard";
import { PromptQueue } from "~/components/Timeline/PromptQueue";
import { TimelineView } from "~/components/Timeline/TimelineView";
import { getLatestUserMessageStartedAt } from "~/components/Timeline/utils/timelineTurns";
import { WorkingIndicator } from "~/components/Timeline/WorkingIndicator";
import { createPhoneAcpClient } from "~/lib/acp-client";
import { getPhoneRoute } from "~/lib/phone-route";

export function SessionRoute() {
	const { workspaceId, sessionId } = useParams<{
		workspaceId: string;
		sessionId: string;
	}>();
	const client = useMemo(() => createPhoneAcpClient(sessionId), [sessionId]);
	const streamUrl = useMemo(
		() => (sessionId ? client.streamUrl(sessionId) : () => ""),
		[client, sessionId],
	);
	const session = useAcpSession({
		sessionId: sessionId ?? "",
		api: client.api,
		streamUrl,
		createWebSocket: client.createWebSocket,
	});
	const permissions = useAcpPermissions(session);
	const [busy, setBusy] = useState(false);
	const [sendError, setSendError] = useState<string | null>(null);
	const timelineUpdateKey = `${session.timeline.lastSeq}:${session.timeline.items.length}:${session.state?.status}`;
	const { containerRef, onScroll } = useTimelineAutoFollow(timelineUpdateKey);
	const activeTurnStartedAt = useMemo(
		() => getLatestUserMessageStartedAt(session.timeline.items),
		[session.timeline.items],
	);

	useEffect(() => {
		if (
			session.isLoading ||
			session.isLoadingOlder ||
			!session.hasOlder ||
			session.historyError
		) {
			return;
		}
		void session.loadOlder();
	}, [
		session.hasOlder,
		session.historyError,
		session.isLoading,
		session.isLoadingOlder,
		session.loadOlder,
	]);

	if (!sessionId || !workspaceId)
		return <Navigate to={getPhoneRoute("/")} replace />;

	const running = session.state?.status === "running";
	const awaitingPermission = session.state?.status === "awaiting_permission";
	const awaitingResponse = permissions.pending.some((pending) =>
		isAskUserPermission(pending, pending.toolCall),
	);
	const canQueue = running || awaitingPermission;

	async function submit(text: string): Promise<void> {
		const trimmed = text.trim();
		if (!trimmed || busy) return;
		setBusy(true);
		setSendError(null);
		try {
			const blocks: ContentBlock[] = [{ type: "text", text: trimmed }];
			if (canQueue) await session.actions.enqueue(blocks);
			else await session.actions.prompt(blocks);
		} catch (error) {
			setSendError("Couldn’t send message. Try again.");
			throw error;
		} finally {
			setBusy(false);
		}
	}

	const disconnected = session.availability === "unavailable";

	return (
		<main
			className="mobile-session-page mx-auto flex h-[100dvh] w-full max-w-md flex-col overflow-hidden px-3"
			style={{
				paddingTop: "max(var(--safe-area-top), 8px)",
				paddingBottom: "max(var(--safe-area-bottom), 8px)",
			}}
		>
			<header className="mb-2 flex shrink-0 items-center gap-2 py-1">
				<Link
					to={getPhoneRoute(`/w/${encodeURIComponent(workspaceId)}`)}
					className="mobile-session-back"
					aria-label="Back to workspace"
				>
					←
				</Link>
				<div className="min-w-0 flex-1">
					<div className="truncate text-sm font-medium">
						{session.timeline.meta.title ?? "Untitled"}
					</div>
					<div className="text-xs text-white/50">
						{session.streamStatus} · {session.state?.status ?? "…"}
					</div>
				</div>
			</header>

			{disconnected ? (
				<div className="mb-2 rounded-md bg-red-500/10 p-2 text-xs text-red-300 ring-1 ring-red-500/20">
					Disconnected. Retrying…
				</div>
			) : null}
			{session.error ? (
				<div className="mb-2 rounded-md bg-red-500/10 p-2 text-xs text-red-300 ring-1 ring-red-500/20">
					{session.error.message}
				</div>
			) : null}
			{sendError ? (
				<div
					className="mb-2 rounded-md bg-red-500/10 p-2 text-xs text-red-300 ring-1 ring-red-500/20"
					role="alert"
				>
					{sendError}
				</div>
			) : null}

			<div
				ref={containerRef}
				onScroll={onScroll}
				className="mobile-session-scroll no-scrollbar min-h-0 flex-1 overflow-y-auto"
			>
				{session.isLoadingOlder ? (
					<div className="mobile-caption-text py-2 text-center text-xs">
						Loading earlier conversation…
					</div>
				) : null}
				{session.historyError && session.hasOlder ? (
					<div className="flex items-center justify-center gap-2 py-2 text-xs text-red-300">
						<span>Couldn’t load earlier conversation.</span>
						<button
							type="button"
							className="underline underline-offset-2"
							onClick={() => void session.loadOlder()}
						>
							Retry
						</button>
					</div>
				) : null}
				<TimelineView
					timeline={session.timeline}
					status={session.state?.status}
				/>
				{running || awaitingPermission ? (
					<WorkingIndicator
						awaitingPermission={awaitingPermission}
						awaitingResponse={awaitingResponse}
						startedAt={activeTurnStartedAt}
					/>
				) : null}
			</div>

			<PromptQueue
				prompts={session.state?.queuedPrompts ?? []}
				onRemove={(queueId) => void session.actions.removeQueued(queueId)}
			/>

			{permissions.pending.map((p) => (
				<PermissionCard
					key={p.requestId}
					pending={p}
					onRespond={(outcome) =>
						void permissions.respond(p.requestId, outcome)
					}
				/>
			))}

			<Composer
				disabled={disconnected}
				busy={busy || running || awaitingPermission}
				queueing={canQueue}
				onSubmit={submit}
				onCancel={running ? () => void session.actions.cancel() : undefined}
			/>
		</main>
	);
}

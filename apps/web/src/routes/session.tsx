import type { ContentBlock } from "@superset/session-protocol";
import {
	useAcpPermissions,
	useAcpSession,
} from "@superset/session-protocol/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Composer } from "~/components/Composer";
import { PermissionCard } from "~/components/Timeline/PermissionCard";
import { TimelineView } from "~/components/Timeline/TimelineView";
import { createPhoneAcpClient } from "~/lib/acp-client";

export function SessionRoute() {
	const { workspaceId, sessionId } = useParams<{
		workspaceId: string;
		sessionId: string;
	}>();
	const client = useMemo(() => createPhoneAcpClient(), []);
	const streamUrl = useMemo(
		() => (sessionId ? client.streamUrl(sessionId) : () => ""),
		[client, sessionId],
	);
	const session = useAcpSession({
		sessionId: sessionId ?? "",
		api: client.api,
		streamUrl,
	});
	const permissions = useAcpPermissions(session);
	const [busy, setBusy] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		el.scrollTop = el.scrollHeight;
	}, []);

	if (!sessionId || !workspaceId) return <Navigate to="/" replace />;

	async function submit(text: string): Promise<void> {
		const trimmed = text.trim();
		if (!trimmed || busy) return;
		setBusy(true);
		try {
			const blocks: ContentBlock[] = [{ type: "text", text: trimmed }];
			await session.actions.prompt(blocks);
		} finally {
			setBusy(false);
		}
	}

	const running = session.state?.status === "running";
	const disconnected = session.availability === "unavailable";

	return (
		<main
			className="mx-auto flex h-[100dvh] w-full max-w-md flex-col px-3"
			style={{
				paddingTop: "max(var(--safe-area-top), 8px)",
				paddingBottom: "max(var(--safe-area-bottom), 8px)",
			}}
		>
			<header className="mb-2 flex items-center gap-2 py-1">
				<Link
					to={`/w/${encodeURIComponent(workspaceId)}`}
					className="text-white/60"
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

			<div
				ref={scrollRef}
				className="no-scrollbar flex-1 overflow-y-auto"
				style={{ scrollBehavior: "smooth" }}
			>
				<TimelineView timeline={session.timeline} />
			</div>

			{permissions.pending.map((p) => (
				<PermissionCard
					key={p.requestId}
					pending={p}
					onAllowOnce={() => void permissions.allowOnce(p.requestId)}
					onRejectOnce={() => void permissions.rejectOnce(p.requestId)}
				/>
			))}

			<Composer
				disabled={disconnected}
				busy={busy || running}
				onSubmit={submit}
				onCancel={running ? () => void session.actions.cancel() : undefined}
			/>
		</main>
	);
}

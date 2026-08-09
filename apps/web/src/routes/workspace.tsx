import type { SessionScopedState } from "@superset/session-protocol";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getTrpc } from "~/lib/trpc-client";

function randomSessionId(): string {
	// UUID v4 falls back to a short-random when crypto.randomUUID is missing.
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function WorkspaceRoute() {
	const { workspaceId } = useParams<{ workspaceId: string }>();
	const navigate = useNavigate();
	const [sessions, setSessions] = useState<SessionScopedState[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [enabled, setEnabled] = useState(true);
	const [creating, setCreating] = useState(false);

	useEffect(() => {
		if (!workspaceId) return;
		let cancelled = false;
		void (async () => {
			try {
				const page = await getTrpc().acpSessions.list.query({
					workspaceId,
					limit: 50,
				});
				if (cancelled) return;
				setEnabled(page.enabled);
				setSessions(page.items);
			} catch (err) {
				if (cancelled) return;
				setError(err instanceof Error ? err.message : "Failed to load");
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [workspaceId]);

	async function startChat(): Promise<void> {
		if (!workspaceId || creating) return;
		setCreating(true);
		try {
			const sessionId = randomSessionId();
			await getTrpc().acpSessions.create.mutate({ sessionId, workspaceId });
			navigate(
				`/w/${encodeURIComponent(workspaceId)}/s/${encodeURIComponent(sessionId)}`,
			);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create session");
			setCreating(false);
		}
	}

	return (
		<main
			className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-4"
			style={{
				paddingTop: "max(var(--safe-area-top), 16px)",
				paddingBottom: "max(var(--safe-area-bottom), 16px)",
			}}
		>
			<header className="mb-4 flex items-center gap-2">
				<Link to="/" className="text-white/60">
					←
				</Link>
				<h1 className="text-lg font-semibold">Workspace</h1>
			</header>

			{!enabled ? (
				<div className="rounded-md bg-yellow-500/10 p-3 text-sm text-yellow-200 ring-1 ring-yellow-500/20">
					ACP sessions are disabled on this host. Ask the desktop owner to
					launch Superset with SUPERSET_ACP_SESSIONS=1.
				</div>
			) : null}

			{error ? (
				<div className="mb-3 rounded-md bg-red-500/10 p-3 text-sm text-red-300 ring-1 ring-red-500/20">
					{error}
				</div>
			) : null}

			<button
				type="button"
				disabled={!enabled || creating}
				onClick={() => void startChat()}
				className="mb-4 w-full rounded-lg bg-white px-4 py-3 font-medium text-black disabled:opacity-50"
			>
				{creating ? "Starting…" : "New chat"}
			</button>

			<ul className="flex flex-col gap-1">
				{loading && sessions.length === 0 ? (
					<li className="text-sm text-white/60">Loading…</li>
				) : null}
				{sessions.map((s) => (
					<li key={s.sessionId}>
						<Link
							to={`/w/${encodeURIComponent(workspaceId ?? "")}/s/${encodeURIComponent(s.sessionId)}`}
							className="block rounded-lg px-3 py-3 hover:bg-white/5 active:bg-white/10"
						>
							<div className="truncate text-sm">
								{s.title ?? "Untitled session"}
							</div>
							<div className="text-xs text-white/50">
								{s.status} · {new Date(s.updatedAt).toLocaleString()}
							</div>
						</Link>
					</li>
				))}
			</ul>
		</main>
	);
}

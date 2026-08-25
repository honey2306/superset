import type { SessionScopedState } from "@superset/session-protocol";
import { BUILTIN_AGENT_LABELS } from "@superset/shared/agent-catalog";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getStoredSession } from "~/lib/auth-store";
import { getPhoneRoute } from "~/lib/phone-route";
import { getTrpc } from "~/lib/trpc-client";
import { acpAgentLaunchOptions } from "./workspace/utils/agentLaunchOptions/agentLaunchOptions";
import {
	createPhoneRouteCache,
	getPhonePairingCacheKey,
} from "./workspaces/utils/phoneRouteCache/phoneRouteCache";
import { resolveWorkspaceContents } from "./workspaces/utils/workspaceContentsLoader/resolveWorkspaceContents";

type CachedWorkspaceState = {
	enabled: boolean;
	sessions: SessionScopedState[];
	warning: string | null;
};

const workspaceSessionCache = createPhoneRouteCache<CachedWorkspaceState>();

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
	const pairingCacheKey = getPhonePairingCacheKey(getStoredSession());
	workspaceSessionCache.activate(pairingCacheKey);
	const cachedWorkspace = workspaceId
		? workspaceSessionCache.get(workspaceId)
		: undefined;
	const initialCachedWorkspaceRef = useRef(cachedWorkspace);
	const [sessions, setSessions] = useState<SessionScopedState[]>(
		() => cachedWorkspace?.sessions ?? [],
	);
	const [loading, setLoading] = useState(() => cachedWorkspace === undefined);
	const [error, setError] = useState<string | null>(null);
	const [warning, setWarning] = useState<string | null>(
		() => cachedWorkspace?.warning ?? null,
	);
	const [enabled, setEnabled] = useState(
		() => cachedWorkspace?.enabled ?? true,
	);
	const [creating, setCreating] = useState(false);
	const [selectedAcpAgentId, setSelectedAcpAgentId] = useState(
		acpAgentLaunchOptions[0]?.agentId ?? "claude",
	);

	useEffect(() => {
		if (!workspaceId || pairingCacheKey === null) return;
		let cancelled = false;
		void (async () => {
			try {
				const result = await resolveWorkspaceContents({
					acp: getTrpc().acpSessions.list.query({ workspaceId, limit: 50 }),
				});
				if (workspaceSessionCache.activeKey() !== pairingCacheKey) return;
				workspaceSessionCache.set(workspaceId, {
					enabled: result.contents.acpEnabled,
					sessions: result.contents.sessions,
					warning:
						result.warnings.length > 0 ? result.warnings.join(" ") : null,
				});
				if (cancelled) return;
				setEnabled(result.contents.acpEnabled);
				setSessions(result.contents.sessions);
				setError(null);
				setWarning(
					result.warnings.length > 0 ? result.warnings.join(" ") : null,
				);
			} catch (err) {
				if (cancelled) return;
				setError(err instanceof Error ? err.message : "Failed to load");
				// A failed foreground refresh must leave the last successful
				// workspace/session list rendered instead of reverting to Loading.
				if (initialCachedWorkspaceRef.current) setLoading(false);
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [workspaceId, pairingCacheKey]);

	async function startAcpSession(): Promise<void> {
		if (!workspaceId || creating) return;
		const selectedAgent = acpAgentLaunchOptions.find(
			(option) => option.agentId === selectedAcpAgentId,
		);
		if (!selectedAgent) return;
		setCreating(true);
		try {
			const sessionId = randomSessionId();
			await getTrpc().acpSessions.create.mutate({
				sessionId,
				workspaceId,
				harness: selectedAgent.harness,
			});
			navigate(
				getPhoneRoute(
					`/w/${encodeURIComponent(workspaceId)}/s/${encodeURIComponent(sessionId)}`,
				),
			);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create session");
			setCreating(false);
		}
	}

	return (
		<main
			className="mobile-workspace-page mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-4"
			style={{
				paddingTop: "max(var(--safe-area-top), 16px)",
				paddingBottom: "max(var(--safe-area-bottom), 16px)",
			}}
		>
			<header className="mb-4 flex items-center gap-2">
				<Link
					to={getPhoneRoute("/")}
					className="mobile-workspace-back"
					aria-label="Back to projects"
				>
					←
				</Link>
				<h1 className="text-lg font-semibold">Workspace</h1>
			</header>

			{!enabled ? (
				<div className="rounded-md bg-yellow-500/10 p-3 text-sm text-yellow-200 ring-1 ring-yellow-500/20">
					ACP sessions are disabled on this Host.
				</div>
			) : null}

			{error ? (
				<div className="mb-3 rounded-md bg-red-500/10 p-3 text-sm text-red-300 ring-1 ring-red-500/20">
					{error}
				</div>
			) : null}
			{warning ? (
				<div className="mb-3 rounded-md bg-yellow-500/10 p-3 text-sm text-yellow-200 ring-1 ring-yellow-500/20">
					{warning}
				</div>
			) : null}

			{enabled ? (
				<section className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
					<div className="mb-2">
						<h2 className="text-sm font-medium">New ACP session</h2>
						<p className="text-xs text-white/50">
							Rich chat with streaming, permissions, and session history.
						</p>
					</div>
					<div className="flex gap-2">
						<select
							value={selectedAcpAgentId}
							onChange={(event) => setSelectedAcpAgentId(event.target.value)}
							className="min-w-0 flex-1 rounded-lg border border-white/20 bg-neutral-900 px-3 py-3 text-sm"
						>
							{acpAgentLaunchOptions.map((option) => (
								<option key={option.agentId} value={option.agentId}>
									{
										BUILTIN_AGENT_LABELS[
											option.agentId as keyof typeof BUILTIN_AGENT_LABELS
										]
									}
								</option>
							))}
						</select>
						<button
							type="button"
							disabled={creating}
							onClick={() => void startAcpSession()}
							className="mobile-primary-button px-4 py-3 text-sm font-medium disabled:opacity-50"
						>
							{creating ? "Starting…" : "Start"}
						</button>
					</div>
				</section>
			) : null}

			<ul className="flex flex-col gap-1">
				{loading && sessions.length === 0 ? (
					<li className="text-sm text-white/60">Loading…</li>
				) : null}
				{sessions.map((s) => (
					<li key={s.sessionId}>
						<Link
							to={getPhoneRoute(
								`/w/${encodeURIComponent(workspaceId ?? "")}/s/${encodeURIComponent(s.sessionId)}`,
							)}
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

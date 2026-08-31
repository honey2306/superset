import type { SessionScopedState } from "@superset/session-protocol";
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

	const selectedAgent = acpAgentLaunchOptions.find(
		(option) => option.agentId === selectedAcpAgentId,
	);

	async function startAcpSession(): Promise<void> {
		if (!workspaceId || creating || !selectedAgent) return;
		setError(null);
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
			className="mobile-workspace-page mx-auto flex min-h-[100dvh] w-full max-w-md flex-col"
			style={{
				paddingTop: "max(var(--safe-area-top), 12px)",
				paddingBottom: "max(var(--safe-area-bottom), 20px)",
			}}
		>
			<header className="mobile-new-session-header">
				<Link
					to={getPhoneRoute("/")}
					className="mobile-workspace-back"
					aria-label="Back to conversations"
				>
					←
				</Link>
				<div className="mobile-new-session-heading">
					<p>NEW CONVERSATION</p>
					<h1>Choose your agent</h1>
				</div>
			</header>

			<div className="mobile-new-session-body">
				<p className="mobile-new-session-intro">
					Pick the agent you want to work with. You can start chatting as soon
					as the session opens.
				</p>

				{!enabled ? (
					<div className="mobile-workspace-notice is-warning">
						ACP sessions are disabled on this Host.
					</div>
				) : null}
				{error ? (
					<div className="mobile-workspace-notice is-error" role="alert">
						{error}
					</div>
				) : null}
				{warning ? (
					<div className="mobile-workspace-notice is-warning">{warning}</div>
				) : null}

				{enabled ? (
					<section className="mobile-new-session-card">
						<fieldset disabled={creating}>
							<legend>Choose an agent</legend>
							<div className="mobile-agent-options">
								{acpAgentLaunchOptions.map((option) => {
									const selected = option.agentId === selectedAcpAgentId;
									return (
										<label
											key={option.agentId}
											className={`mobile-agent-option ${selected ? "is-selected" : ""}`}
											data-agent={option.agentId}
										>
											<input
												type="radio"
												name="agent"
												value={option.agentId}
												checked={selected}
												onChange={() => setSelectedAcpAgentId(option.agentId)}
											/>
											<span className="mobile-agent-avatar" aria-hidden="true">
												{option.label.slice(0, 2).toUpperCase()}
											</span>
											<span className="mobile-agent-option-copy">
												<strong>{option.label}</strong>
												<span>{option.description}</span>
											</span>
											<span className="mobile-agent-check" aria-hidden="true">
												✓
											</span>
										</label>
									);
								})}
							</div>
						</fieldset>

						<button
							type="button"
							disabled={creating || !selectedAgent}
							onClick={() => void startAcpSession()}
							className="mobile-start-conversation"
						>
							<span>
								{creating
									? `Starting ${selectedAgent?.label ?? "session"}…`
									: `Start with ${selectedAgent?.label ?? "agent"}`}
							</span>
							<span aria-hidden="true">→</span>
						</button>
					</section>
				) : null}

				{loading || sessions.length > 0 ? (
					<section
						className="mobile-recent-sessions"
						aria-labelledby="recent-title"
					>
						<header>
							<h2 id="recent-title">Recent in this workspace</h2>
							{sessions.length > 0 ? <span>{sessions.length}</span> : null}
						</header>
						{loading && sessions.length === 0 ? (
							<output
								className="mobile-recent-session-skeleton"
								aria-label="Loading conversations"
							/>
						) : null}
						<ul>
							{sessions.map((session) => (
								<li key={session.sessionId}>
									<Link
										to={getPhoneRoute(
											`/w/${encodeURIComponent(workspaceId ?? "")}/s/${encodeURIComponent(session.sessionId)}`,
										)}
										className="mobile-recent-session"
									>
										<span
											className={`mobile-recent-session-dot is-${session.status}`}
											aria-hidden="true"
										/>
										<span className="mobile-recent-session-copy">
											<strong>
												{session.title ?? "Untitled conversation"}
											</strong>
											<span>
												{session.status.replaceAll("_", " ")} ·{" "}
												{new Date(session.updatedAt).toLocaleString(undefined, {
													month: "short",
													day: "numeric",
													hour: "2-digit",
													minute: "2-digit",
												})}
											</span>
										</span>
										<span
											className="mobile-recent-session-arrow"
											aria-hidden="true"
										>
											›
										</span>
									</Link>
								</li>
							))}
						</ul>
					</section>
				) : null}
			</div>
		</main>
	);
}

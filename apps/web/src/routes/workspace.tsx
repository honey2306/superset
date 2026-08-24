import type { SessionScopedState } from "@superset/session-protocol";
import { BUILTIN_AGENT_LABELS } from "@superset/shared/agent-catalog";
import type { BuiltinTerminalAgentType } from "@superset/shared/builtin-terminal-agents";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getPhoneRoute } from "~/lib/phone-route";
import { getTrpc } from "~/lib/trpc-client";
import {
	acpAgentLaunchOptions,
	terminalAgentLaunchOptions,
} from "./workspace/utils/agentLaunchOptions/agentLaunchOptions";
import {
	mergeTerminalRecords,
	type TerminalAgentRecord,
	type TerminalSessionRecord,
} from "./workspaces/utils/buildProjectTree/buildProjectTree";
import { resolveWorkspaceContents } from "./workspaces/utils/workspaceContentsLoader/resolveWorkspaceContents";

function randomSessionId(): string {
	// UUID v4 falls back to a short-random when crypto.randomUUID is missing.
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function terminalAgentLabel(agentId: string): string {
	return (
		BUILTIN_AGENT_LABELS[agentId as keyof typeof BUILTIN_AGENT_LABELS] ??
		agentId
	);
}

export function WorkspaceRoute() {
	const { workspaceId } = useParams<{ workspaceId: string }>();
	const navigate = useNavigate();
	const [sessions, setSessions] = useState<SessionScopedState[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [warning, setWarning] = useState<string | null>(null);
	const [enabled, setEnabled] = useState(true);
	const [creating, setCreating] = useState(false);
	const [selectedAcpAgentId, setSelectedAcpAgentId] = useState(
		acpAgentLaunchOptions[0]?.agentId ?? "claude",
	);
	const [selectedTerminalAgentId, setSelectedTerminalAgentId] = useState(
		terminalAgentLaunchOptions[0]?.agentId ?? "claude",
	);
	const [terminalSessions, setTerminalSessions] = useState<
		TerminalSessionRecord[]
	>([]);
	const [terminalAgents, setTerminalAgents] = useState<TerminalAgentRecord[]>(
		[],
	);

	useEffect(() => {
		if (!workspaceId) return;
		let cancelled = false;
		void (async () => {
			try {
				const result = await resolveWorkspaceContents({
					acp: getTrpc().acpSessions.list.query({ workspaceId, limit: 50 }),
					terminalSessions: getTrpc().terminal.listSessions.query({
						workspaceId,
					}),
					terminalAgents: getTrpc().terminalAgents.listByWorkspace.query({
						workspaceId,
					}),
				});
				if (cancelled) return;
				setEnabled(result.contents.acpEnabled);
				setSessions(result.contents.sessions);
				setTerminalSessions(result.contents.terminalSessions);
				setTerminalAgents(result.contents.terminalAgents);
				setWarning(
					result.warnings.length > 0 ? result.warnings.join(" ") : null,
				);
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

	const terminalRecords = mergeTerminalRecords({
		sessions: terminalSessions,
		agents: terminalAgents,
		agentLabel: terminalAgentLabel,
	});

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

	async function startTerminalAgent(): Promise<void> {
		if (!workspaceId || creating) return;
		setCreating(true);
		try {
			const result = await getTrpc().terminalAgents.getOrCreate.mutate({
				workspaceId,
				agentId: selectedTerminalAgentId,
			});
			navigate(
				getPhoneRoute(
					`/w/${encodeURIComponent(workspaceId)}/t/${encodeURIComponent(result.binding.terminalId)}`,
				),
			);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to start agent");
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
					ACP sessions are disabled on this Host. Terminal agents remain
					available.
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

			<section className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
				<div className="mb-2">
					<h2 className="text-sm font-medium">New terminal agent</h2>
					<p className="text-xs text-white/50">
						Launch an interactive CLI in this workspace.
					</p>
				</div>
				<div className="flex gap-2">
					<select
						value={selectedTerminalAgentId}
						onChange={(event) =>
							setSelectedTerminalAgentId(
								event.target.value as BuiltinTerminalAgentType,
							)
						}
						className="min-w-0 flex-1 rounded-lg border border-white/20 bg-neutral-900 px-3 py-3 text-sm"
					>
						{terminalAgentLaunchOptions.map(({ agentId }) => (
							<option key={agentId} value={agentId} className="bg-neutral-900">
								{
									BUILTIN_AGENT_LABELS[
										agentId as keyof typeof BUILTIN_AGENT_LABELS
									]
								}
							</option>
						))}
					</select>
					<button
						type="button"
						disabled={creating}
						onClick={() => void startTerminalAgent()}
						className="rounded-lg border border-white/20 px-4 py-3 text-sm disabled:opacity-50"
					>
						{creating
							? "Starting…"
							: `Start ${BUILTIN_AGENT_LABELS[selectedTerminalAgentId as keyof typeof BUILTIN_AGENT_LABELS]}`}
					</button>
				</div>
			</section>

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
			{terminalRecords.length > 0 ? (
				<ul className="mt-4 flex flex-col gap-1">
					<li className="px-3 text-xs font-medium uppercase tracking-wide text-white/45">
						Terminals
					</li>
					{terminalRecords.map((terminal) => (
						<li key={terminal.terminalId}>
							<Link
								to={getPhoneRoute(
									`/w/${encodeURIComponent(workspaceId ?? "")}/t/${encodeURIComponent(terminal.terminalId)}`,
								)}
								className="block rounded-lg px-3 py-3 hover:bg-white/5"
							>
								<div className="truncate text-sm">{terminal.title}</div>
								<div className="text-xs text-white/50">
									{terminal.running ? "Running" : "Idle"} ·{" "}
									{new Date(terminal.updatedAt).toLocaleString()}
								</div>
							</Link>
						</li>
					))}
				</ul>
			) : null}
		</main>
	);
}

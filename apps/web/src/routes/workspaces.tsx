import { BUILTIN_AGENT_LABELS } from "@superset/shared/agent-catalog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearStoredSession, getStoredSession } from "~/lib/auth-store";
import {
	getAutoMateCleanPairPath,
	isAutoMateWebAppPath,
} from "~/lib/automate-resume";
import { getTrpc, isUnauthorized, resetTrpc } from "~/lib/trpc-client";
import { ProjectTree } from "./components/ProjectTree";
import {
	buildProjectTree,
	type TerminalAgentRecord,
	type TerminalSessionRecord,
	type WorkspaceContents,
} from "./workspaces/utils/buildProjectTree/buildProjectTree";
import { createWorkspaceCatalogRefresher } from "./workspaces/utils/workspaceCatalogRefresher/workspaceCatalogRefresher";
import {
	createWorkspaceContentsLoader,
	type WorkspaceContentsLoadState,
} from "./workspaces/utils/workspaceContentsLoader/workspaceContentsLoader";

type Snapshot = Awaited<
	ReturnType<
		ReturnType<typeof getTrpc>["workspaceCatalog"]["snapshot"]["query"]
	>
>;

function snapshotProjects(snapshot: Snapshot): Snapshot["projects"] {
	return Array.isArray(snapshot.projects) ? snapshot.projects : [];
}

function snapshotWorkspaces(snapshot: Snapshot): Snapshot["workspaces"] {
	return Array.isArray(snapshot.workspaces) ? snapshot.workspaces : [];
}

function toggleId(current: ReadonlySet<string>, id: string): Set<string> {
	const next = new Set(current);
	if (next.has(id)) next.delete(id);
	else next.add(id);
	return next;
}

function agentLabel(agentId: string): string {
	return (
		BUILTIN_AGENT_LABELS[agentId as keyof typeof BUILTIN_AGENT_LABELS] ??
		agentId
	);
}

function toTerminalAgentRecord(agent: {
	terminalId: string;
	agentId: string;
	lastEventAt: number;
	lastEventType: string;
}): TerminalAgentRecord {
	return agent;
}

function toTerminalSessionRecord(session: {
	terminalId: string;
	createdAt: number;
	exited: boolean;
	title: string | null;
}): TerminalSessionRecord {
	return session;
}

export function WorkspacesRoute() {
	const navigate = useNavigate();
	const session = getStoredSession();
	const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
	const [workspaceTabs, setWorkspaceTabs] = useState<
		ReadonlyMap<string, WorkspaceContents>
	>(new Map());
	const [workspaceLoadStates, setWorkspaceLoadStates] = useState<
		ReadonlyMap<string, WorkspaceContentsLoadState>
	>(new Map());
	const [workspaceLoadErrors, setWorkspaceLoadErrors] = useState<
		ReadonlyMap<string, string>
	>(new Map());
	const [error, setError] = useState<string | null>(null);
	const [expandedProjectIds, setExpandedProjectIds] = useState<
		ReadonlySet<string>
	>(new Set());
	const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState<
		ReadonlySet<string>
	>(new Set());
	const mountedRef = useRef(true);
	const workspaceContentsLoader = useRef(
		createWorkspaceContentsLoader(async (workspaceId) => {
			const [acp, terminalSessions, terminalAgents] = await Promise.all([
				getTrpc().acpSessions.list.query({ workspaceId, limit: 50 }),
				getTrpc().terminal.listSessions.query({ workspaceId }),
				getTrpc().terminalAgents.listByWorkspace.query({ workspaceId }),
			]);
			return {
				acpEnabled: acp.enabled,
				sessions: acp.items,
				terminalSessions: terminalSessions.sessions.map(
					toTerminalSessionRecord,
				),
				terminalAgents: terminalAgents.map(toTerminalAgentRecord),
			};
		}),
	).current;

	useEffect(
		() => () => {
			mountedRef.current = false;
		},
		[],
	);

	const loadWorkspaceContents = useCallback(
		(workspaceId: string): void => {
			const existingState = workspaceContentsLoader.getState(workspaceId);
			if (existingState === "loaded" || existingState === "loading") return;

			setWorkspaceLoadStates((current) => {
				const next = new Map(current);
				next.set(workspaceId, "loading");
				return next;
			});
			setWorkspaceLoadErrors((current) => {
				if (!current.has(workspaceId)) return current;
				const next = new Map(current);
				next.delete(workspaceId);
				return next;
			});

			void workspaceContentsLoader.load(workspaceId).then(
				(contents) => {
					if (!mountedRef.current) return;
					setWorkspaceTabs((current) => {
						const next = new Map(current);
						next.set(workspaceId, contents);
						return next;
					});
					setWorkspaceLoadStates((current) => {
						const next = new Map(current);
						next.set(workspaceId, "loaded");
						return next;
					});
				},
				(caught: unknown) => {
					if (!mountedRef.current) return;
					const message =
						caught instanceof Error
							? caught.message
							: "Failed to load workspace tabs";
					setWorkspaceLoadStates((current) => {
						const next = new Map(current);
						next.set(workspaceId, "error");
						return next;
					});
					setWorkspaceLoadErrors((current) => {
						const next = new Map(current);
						next.set(workspaceId, message);
						return next;
					});
				},
			);
		},
		[workspaceContentsLoader],
	);

	useEffect(() => {
		mountedRef.current = true;
		let initialSnapshotLoaded = false;
		const refresher = createWorkspaceCatalogRefresher(
			() => getTrpc().workspaceCatalog.snapshot.query(),
			{
				onSnapshot: (nextSnapshot) => {
					if (!mountedRef.current) return;
					setSnapshot(nextSnapshot);
					setError(null);
					if (initialSnapshotLoaded) return;
					initialSnapshotLoaded = true;
					const nextProjects = snapshotProjects(nextSnapshot);
					const nextWorkspaces = snapshotWorkspaces(nextSnapshot);
					const firstWorkspace = nextWorkspaces[0];
					const firstProject =
						nextProjects.find(
							(project) => project.id === firstWorkspace?.projectId,
						) ?? nextProjects[0];
					if (firstProject) setExpandedProjectIds(new Set([firstProject.id]));
					if (firstWorkspace) {
						setExpandedWorkspaceIds(new Set([firstWorkspace.id]));
						loadWorkspaceContents(firstWorkspace.id);
					}
				},
				onError: (caught) => {
					if (!mountedRef.current) return;
					if (isUnauthorized(caught)) {
						clearStoredSession();
						resetTrpc();
						if (isAutoMateWebAppPath(location.pathname)) {
							window.location.replace(
								getAutoMateCleanPairPath(location.pathname),
							);
						} else navigate("/pair", { replace: true });
						return;
					}
					setError(caught instanceof Error ? caught.message : "Failed to load");
				},
			},
		);
		refresher.start();
		void refresher.refresh();
		return () => refresher.stop();
	}, [navigate, loadWorkspaceContents]);

	const projects = useMemo(
		() =>
			snapshot
				? buildProjectTree({
						projects: snapshotProjects(snapshot),
						workspaces: snapshotWorkspaces(snapshot),
						contentsByWorkspaceId: workspaceTabs,
						agentLabel,
					})
				: [],
		[snapshot, workspaceTabs],
	);

	return (
		<main className="mobile-projects-page">
			<header className="mobile-projects-header">
				<div className="mobile-projects-header-copy">
					<h1>Projects</h1>
					<p>
						<span
							className={`mobile-host-dot ${snapshot ? "is-connected" : ""}`}
						/>
						{session?.hostName ?? "Host"} ·{" "}
						{snapshot ? "Connected" : "Connecting…"}
					</p>
				</div>
				<button
					type="button"
					onClick={() => {
						clearStoredSession();
						resetTrpc();
						if (isAutoMateWebAppPath(location.pathname)) {
							window.location.replace(
								getAutoMateCleanPairPath(location.pathname),
							);
						} else navigate("/pair", { replace: true });
					}}
					className="mobile-unpair-button"
				>
					Unpair
				</button>
			</header>

			<section className="mobile-projects-tree" aria-label="Projects and tabs">
				<p className="mobile-projects-eyebrow">
					{snapshot ? `${projects.length} projects` : "Loading projects"}
				</p>
				{error ? <div className="mobile-page-error">{error}</div> : null}
				{snapshot === null && !error ? (
					<p className="mobile-tree-helper">Loading your projects…</p>
				) : null}
				{projects.map((project) => (
					<ProjectTree
						key={project.id}
						project={project}
						expanded={expandedProjectIds.has(project.id)}
						expandedWorkspaceIds={expandedWorkspaceIds}
						workspaceLoadStates={workspaceLoadStates}
						workspaceLoadErrors={workspaceLoadErrors}
						onToggle={() =>
							setExpandedProjectIds((current) => toggleId(current, project.id))
						}
						onWorkspaceToggle={(workspaceId) => {
							if (workspaceLoadStates.get(workspaceId) === "error") {
								loadWorkspaceContents(workspaceId);
								setExpandedWorkspaceIds((current) => {
									const next = new Set(current);
									next.add(workspaceId);
									return next;
								});
								return;
							}
							if (!expandedWorkspaceIds.has(workspaceId)) {
								loadWorkspaceContents(workspaceId);
							}
							setExpandedWorkspaceIds((current) =>
								toggleId(current, workspaceId),
							);
						}}
					/>
				))}
			</section>
		</main>
	);
}

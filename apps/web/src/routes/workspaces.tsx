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
	type WorkspaceContents,
} from "./workspaces/utils/buildProjectTree/buildProjectTree";
import {
	createPhoneRouteCache,
	getPhonePairingCacheKey,
} from "./workspaces/utils/phoneRouteCache/phoneRouteCache";
import { createWorkspaceCatalogRefresher } from "./workspaces/utils/workspaceCatalogRefresher/workspaceCatalogRefresher";
import { resolveWorkspaceContents } from "./workspaces/utils/workspaceContentsLoader/resolveWorkspaceContents";
import {
	createWorkspaceContentsLoader,
	type WorkspaceContentsLoadState,
} from "./workspaces/utils/workspaceContentsLoader/workspaceContentsLoader";

type Snapshot = Awaited<
	ReturnType<
		ReturnType<typeof getTrpc>["workspaceCatalog"]["snapshot"]["query"]
	>
>;

const CATALOG_CACHE_SCOPE = "catalog";
const workspaceCatalogCache = createPhoneRouteCache<Snapshot>();
const workspaceContentsCache = createPhoneRouteCache<WorkspaceContents>();

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

export function WorkspacesRoute() {
	const navigate = useNavigate();
	const session = getStoredSession();
	const pairingCacheKey = getPhonePairingCacheKey(session);
	workspaceCatalogCache.activate(pairingCacheKey);
	workspaceContentsCache.activate(pairingCacheKey);
	const cachedSnapshot = workspaceCatalogCache.get(CATALOG_CACHE_SCOPE);
	const initialWorkspaceTabs = new Map<string, WorkspaceContents>();
	if (cachedSnapshot) {
		for (const workspace of snapshotWorkspaces(cachedSnapshot)) {
			const contents = workspaceContentsCache.get(workspace.id);
			if (contents) initialWorkspaceTabs.set(workspace.id, contents);
		}
	}
	const cachedFirstWorkspace = cachedSnapshot
		? snapshotWorkspaces(cachedSnapshot)[0]
		: undefined;
	const cachedFirstProject = cachedSnapshot
		? (snapshotProjects(cachedSnapshot).find(
				(project) => project.id === cachedFirstWorkspace?.projectId,
			) ?? snapshotProjects(cachedSnapshot)[0])
		: undefined;
	const initialCachedSnapshotRef = useRef(cachedSnapshot);
	const initialCachedFirstWorkspaceRef = useRef(cachedFirstWorkspace);
	const [snapshot, setSnapshot] = useState<Snapshot | null>(
		() => cachedSnapshot ?? null,
	);
	const [workspaceTabs, setWorkspaceTabs] = useState<
		ReadonlyMap<string, WorkspaceContents>
	>(() => initialWorkspaceTabs);
	const [workspaceLoadStates, setWorkspaceLoadStates] = useState<
		ReadonlyMap<string, WorkspaceContentsLoadState>
	>(
		() =>
			new Map(
				Array.from(initialWorkspaceTabs.keys(), (workspaceId) => [
					workspaceId,
					"loaded" as const,
				]),
			),
	);
	const [workspaceLoadErrors, setWorkspaceLoadErrors] = useState<
		ReadonlyMap<string, string>
	>(new Map());
	const [workspaceLoadWarnings, setWorkspaceLoadWarnings] = useState<
		ReadonlyMap<string, readonly string[]>
	>(
		() =>
			new Map(
				Array.from(initialWorkspaceTabs.entries())
					.filter(([, contents]) => (contents.warnings?.length ?? 0) > 0)
					.map(([workspaceId, contents]) => [
						workspaceId,
						contents.warnings ?? [],
					]),
			),
	);
	const [error, setError] = useState<string | null>(null);
	const [expandedProjectIds, setExpandedProjectIds] = useState<
		ReadonlySet<string>
	>(() => (cachedFirstProject ? new Set([cachedFirstProject.id]) : new Set()));
	const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState<
		ReadonlySet<string>
	>(() =>
		cachedFirstWorkspace ? new Set([cachedFirstWorkspace.id]) : new Set(),
	);
	const mountedRef = useRef(true);
	const workspaceContentsLoader = useRef(
		createWorkspaceContentsLoader(async (workspaceId) => {
			const result = await resolveWorkspaceContents({
				acp: getTrpc().acpSessions.list.query({ workspaceId, limit: 50 }),
			});
			return result.contents;
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
			const cachedContents = workspaceContentsCache.get(workspaceId);
			if (cachedContents) {
				setWorkspaceTabs((current) => {
					if (current.get(workspaceId) === cachedContents) return current;
					const next = new Map(current);
					next.set(workspaceId, cachedContents);
					return next;
				});
				setWorkspaceLoadStates((current) => {
					if (current.get(workspaceId) === "loaded") return current;
					const next = new Map(current);
					next.set(workspaceId, "loaded");
					return next;
				});
				setWorkspaceLoadWarnings((current) => {
					const warnings = cachedContents.warnings ?? [];
					if (warnings.length === 0 && !current.has(workspaceId))
						return current;
					const next = new Map(current);
					if (warnings.length > 0) next.set(workspaceId, warnings);
					else next.delete(workspaceId);
					return next;
				});
			} else {
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
				setWorkspaceLoadWarnings((current) => {
					if (!current.has(workspaceId)) return current;
					const next = new Map(current);
					next.delete(workspaceId);
					return next;
				});
			}

			void workspaceContentsLoader.load(workspaceId).then(
				(contents) => {
					if (workspaceContentsCache.activeKey() !== pairingCacheKey) return;
					workspaceContentsCache.set(workspaceId, contents);
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
					setWorkspaceLoadWarnings((current) => {
						const next = new Map(current);
						const warnings = contents.warnings ?? [];
						if (warnings.length > 0) next.set(workspaceId, warnings);
						else next.delete(workspaceId);
						return next;
					});
				},
				(caught: unknown) => {
					if (!mountedRef.current) return;
					if (workspaceContentsCache.get(workspaceId)) {
						// Keep the last successful tab list visible while a foreground
						// refresh retries. A transient relay error must not turn a
						// rendered workspace back into a blank/error-only panel.
						setWorkspaceLoadStates((current) => {
							const next = new Map(current);
							next.set(workspaceId, "loaded");
							return next;
						});
						return;
					}
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
					setWorkspaceLoadWarnings((current) => {
						if (!current.has(workspaceId)) return current;
						const next = new Map(current);
						next.delete(workspaceId);
						return next;
					});
				},
			);
		},
		[workspaceContentsLoader, pairingCacheKey],
	);

	useEffect(() => {
		mountedRef.current = true;
		if (pairingCacheKey === null) return;
		let initialSnapshotLoaded = initialCachedSnapshotRef.current !== undefined;
		const refresher = createWorkspaceCatalogRefresher(
			() => getTrpc().workspaceCatalog.snapshot.query(),
			{
				onSnapshot: (nextSnapshot) => {
					if (!mountedRef.current) return;
					workspaceCatalogCache.set(CATALOG_CACHE_SCOPE, nextSnapshot);
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
								`${getAutoMateCleanPairPath(location.pathname)}?reason=revoked`,
							);
						} else {
							navigate("/pair?reason=revoked", {
								replace: true,
							});
						}
						return;
					}
					setError(caught instanceof Error ? caught.message : "Failed to load");
				},
			},
		);
		refresher.start();
		if (initialCachedFirstWorkspaceRef.current) {
			loadWorkspaceContents(initialCachedFirstWorkspaceRef.current.id);
		}
		void refresher.refresh();
		return () => refresher.stop();
	}, [navigate, loadWorkspaceContents, pairingCacheKey]);

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
						workspaceCatalogCache.clear();
						workspaceContentsCache.clear();
						clearStoredSession();
						resetTrpc();
						if (isAutoMateWebAppPath(location.pathname)) {
							window.location.replace(
								getAutoMateCleanPairPath(location.pathname),
							);
						} else navigate("/pair", { replace: true });
					}}
					className="mobile-unpair-button"
					title="Removes the saved pairing on this phone. The desktop session stays active."
					aria-label="Forget pairing on this phone"
				>
					Forget on this phone
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
						workspaceLoadWarnings={workspaceLoadWarnings}
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

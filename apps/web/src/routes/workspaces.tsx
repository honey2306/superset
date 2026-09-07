import { BUILTIN_AGENT_LABELS } from "@superset/shared/agent-catalog";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearStoredSession, getStoredSession } from "~/lib/auth-store";
import {
	getAutoMateCleanPairPath,
	isAutoMateWebAppPath,
} from "~/lib/automate-resume";
import { getTrpc, isUnauthorized, resetTrpc } from "~/lib/trpc-client";
import { ConversationList } from "./components/ConversationList";
import { buildConversationList } from "./workspaces/utils/buildConversationList/buildConversationList";
import {
	buildProjectTree,
	type WorkspaceContents,
} from "./workspaces/utils/buildProjectTree/buildProjectTree";
import {
	createPhoneRouteCache,
	getPhonePairingCacheKey,
	type PhoneSnapshotCacheValue,
	parsePhoneSnapshotCacheValue,
	projectPhoneSnapshotCacheValue,
} from "./workspaces/utils/phoneRouteCache/phoneRouteCache";
import { buildPhoneWorkspaceContents } from "./workspaces/utils/phoneWorkspaceSnapshot/phoneWorkspaceSnapshot";
import { createWorkspaceCatalogRefresher } from "./workspaces/utils/workspaceCatalogRefresher/workspaceCatalogRefresher";

type PhoneSnapshot = Awaited<
	ReturnType<
		ReturnType<typeof getTrpc>["workspaceCatalog"]["phoneSnapshot"]["query"]
	>
>;
type Snapshot = PhoneSnapshotCacheValue["catalog"];

const CATALOG_CACHE_SCOPE = "catalog";
const workspaceCatalogCache = createPhoneRouteCache<PhoneSnapshotCacheValue>({
	persistence: {
		serialize: projectPhoneSnapshotCacheValue,
		deserialize: parsePhoneSnapshotCacheValue,
	},
});

function toPhoneSnapshotCacheValue(
	snapshot: PhoneSnapshot,
): PhoneSnapshotCacheValue {
	return {
		catalog: {
			schemaVersion: snapshot.catalog.schemaVersion,
			revision: snapshot.catalog.revision,
			projects: snapshot.catalog.projects.map(({ id, name, repoPath }) => ({
				id,
				name,
				repoPath,
			})),
			workspaces: snapshot.catalog.workspaces.map(
				({ id, projectId, name, branch }) => ({
					id,
					projectId,
					name,
					branch,
				}),
			),
		},
		acp: {
			enabled: snapshot.acp.enabled,
			items: snapshot.acp.items.map(
				({ sessionId, workspaceId, title, status, updatedAt }) => ({
					sessionId,
					workspaceId,
					title,
					status,
					updatedAt,
				}),
			),
		},
	};
}

function snapshotProjects(snapshot: Snapshot): Snapshot["projects"] {
	return Array.isArray(snapshot.projects) ? snapshot.projects : [];
}

function snapshotWorkspaces(snapshot: Snapshot): Snapshot["workspaces"] {
	return Array.isArray(snapshot.workspaces) ? snapshot.workspaces : [];
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
	const cachedPhoneSnapshot = workspaceCatalogCache.get(CATALOG_CACHE_SCOPE);
	const cachedSnapshot = cachedPhoneSnapshot?.catalog ?? null;
	const initialWorkspaceTabs = new Map<string, WorkspaceContents>();
	if (cachedPhoneSnapshot && cachedSnapshot) {
		const aggregateContents = buildPhoneWorkspaceContents({
			enabled: cachedPhoneSnapshot.acp.enabled,
			sessions: cachedPhoneSnapshot.acp.items,
			workspaceIds: snapshotWorkspaces(cachedSnapshot).map(
				(workspace) => workspace.id,
			),
		});
		for (const workspace of snapshotWorkspaces(cachedSnapshot)) {
			const contents = aggregateContents.get(workspace.id);
			if (contents) initialWorkspaceTabs.set(workspace.id, contents);
		}
	}
	const [snapshot, setSnapshot] = useState<Snapshot | null>(
		() => cachedSnapshot ?? null,
	);
	const [workspaceTabs, setWorkspaceTabs] = useState<
		ReadonlyMap<string, WorkspaceContents>
	>(() => initialWorkspaceTabs);
	const [error, setError] = useState<string | null>(null);
	const [hasRefreshed, setHasRefreshed] = useState(false);
	const [snapshotPairingKey, setSnapshotPairingKey] = useState(pairingCacheKey);
	const mountedRef = useRef(true);

	useEffect(
		() => () => {
			mountedRef.current = false;
		},
		[],
	);

	useEffect(() => {
		mountedRef.current = true;
		// A pairing can change without React remounting this route. Replace the
		// rendered state immediately after activation so the previous Host's
		// snapshot cannot survive into the next pairing's refresh.
		setSnapshotPairingKey(pairingCacheKey);
		const currentCachedPhoneSnapshot =
			workspaceCatalogCache.get(CATALOG_CACHE_SCOPE);
		const currentCachedSnapshot = currentCachedPhoneSnapshot?.catalog ?? null;
		const currentWorkspaceTabs = new Map<string, WorkspaceContents>();
		if (currentCachedPhoneSnapshot && currentCachedSnapshot) {
			const aggregateContents = buildPhoneWorkspaceContents({
				enabled: currentCachedPhoneSnapshot.acp.enabled,
				sessions: currentCachedPhoneSnapshot.acp.items,
				workspaceIds: snapshotWorkspaces(currentCachedSnapshot).map(
					(workspace) => workspace.id,
				),
			});
			for (const workspace of snapshotWorkspaces(currentCachedSnapshot)) {
				const contents = aggregateContents.get(workspace.id);
				if (contents) currentWorkspaceTabs.set(workspace.id, contents);
			}
		}
		setSnapshot(currentCachedSnapshot);
		setWorkspaceTabs(currentWorkspaceTabs);
		setHasRefreshed(false);
		if (pairingCacheKey === null) return;
		const refresher = createWorkspaceCatalogRefresher(
			() => getTrpc().workspaceCatalog.phoneSnapshot.query(),
			{
				onSnapshot: (nextPhoneSnapshot) => {
					if (
						!mountedRef.current ||
						workspaceCatalogCache.activeKey() !== pairingCacheKey
					)
						return;
					const nextPhoneSnapshotCacheValue =
						toPhoneSnapshotCacheValue(nextPhoneSnapshot);
					const nextSnapshot = nextPhoneSnapshotCacheValue.catalog;
					const nextWorkspaceIds = snapshotWorkspaces(nextSnapshot).map(
						(workspace) => workspace.id,
					);
					const nextWorkspaceTabs = buildPhoneWorkspaceContents({
						enabled: nextPhoneSnapshotCacheValue.acp.enabled,
						sessions: nextPhoneSnapshotCacheValue.acp.items,
						workspaceIds: nextWorkspaceIds,
					});
					workspaceCatalogCache.set(
						CATALOG_CACHE_SCOPE,
						nextPhoneSnapshotCacheValue,
					);
					setSnapshot(nextSnapshot);
					setWorkspaceTabs(nextWorkspaceTabs);
					setHasRefreshed(true);
					setError(null);
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
		void refresher.refresh();
		return () => refresher.stop();
	}, [navigate, pairingCacheKey]);

	const snapshotForRender =
		snapshotPairingKey === pairingCacheKey ? snapshot : cachedSnapshot;
	const workspaceTabsForRender =
		snapshotPairingKey === pairingCacheKey
			? workspaceTabs
			: initialWorkspaceTabs;
	const projects = useMemo(
		() =>
			snapshotForRender
				? buildProjectTree({
						projects: snapshotProjects(snapshotForRender),
						workspaces: snapshotWorkspaces(snapshotForRender),
						contentsByWorkspaceId: workspaceTabsForRender,
						agentLabel,
					})
				: [],
		[snapshotForRender, workspaceTabsForRender],
	);
	const conversations = useMemo(
		() => buildConversationList(projects),
		[projects],
	);
	const conversationsLoading = snapshotForRender === null;
	const connected =
		snapshotPairingKey === pairingCacheKey &&
		hasRefreshed &&
		snapshotForRender !== null;
	const connectionLabel = connected
		? "Connected"
		: cachedPhoneSnapshot
			? "Cached · Connecting…"
			: "Connecting…";

	return (
		<main className="mobile-projects-page">
			<header className="mobile-projects-header">
				<div className="mobile-projects-header-copy">
					<h1>Conversations</h1>
					<p>
						<span
							className={`mobile-host-dot ${connected ? "is-connected" : ""}`}
						/>
						{session?.hostName ?? "Host"} · {connectionLabel}
					</p>
				</div>
				<button
					type="button"
					onClick={() => {
						workspaceCatalogCache.clear();
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

			<section className="mobile-projects-tree">
				{error ? <div className="mobile-page-error">{error}</div> : null}
				<ConversationList
					conversations={conversations}
					loading={conversationsLoading}
					loadErrorCount={0}
					loadWarningCount={0}
				/>
			</section>
		</main>
	);
}

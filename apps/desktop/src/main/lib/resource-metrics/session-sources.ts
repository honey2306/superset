import { getHostServiceCoordinator } from "main/lib/host-service-coordinator";
import {
	parseV2ResourceSessions,
	type WorkspaceSessionMap,
} from "./session-normalization";

export interface WorkspaceMetadata {
	workspaceName: string;
	projectId: string;
	projectName: string;
}

const RESOURCE_SESSIONS_FETCH_TIMEOUT_MS = 2500;

function isAbortError(error: unknown): boolean {
	return (
		error !== null &&
		typeof error === "object" &&
		"name" in error &&
		(error as { name?: unknown }).name === "AbortError"
	);
}

function mergeWorkspaceSessionMaps(
	target: WorkspaceSessionMap,
	source: WorkspaceSessionMap,
): void {
	for (const [workspaceId, entries] of source) {
		const targetEntries = target.get(workspaceId);
		if (targetEntries) {
			targetEntries.push(...entries);
		} else {
			target.set(workspaceId, [...entries]);
		}
	}
}

export async function collectWorkspaceSessionMap(): Promise<WorkspaceSessionMap> {
	const connection = getHostServiceCoordinator().getConnection();
	const workspaceSessionMap: WorkspaceSessionMap = new Map();
	if (!connection) return workspaceSessionMap;

	const controller = new AbortController();
	const timeoutId = setTimeout(
		() => controller.abort(),
		RESOURCE_SESSIONS_FETCH_TIMEOUT_MS,
	);
	try {
		const response = await fetch(
			`http://127.0.0.1:${connection.port}/terminal/resource-sessions`,
			{
				headers: { Authorization: `Bearer ${connection.secret}` },
				signal: controller.signal,
			},
		);
		if (!response.ok) {
			console.warn(
				`[resource-metrics] Failed to list terminal resource sessions: ${response.status}`,
			);
			return workspaceSessionMap;
		}
		mergeWorkspaceSessionMaps(
			workspaceSessionMap,
			parseV2ResourceSessions(await response.json()),
		);
	} catch (error) {
		if (isAbortError(error)) {
			console.warn(
				"[resource-metrics] Timed out listing terminal resource sessions",
			);
		} else {
			console.warn(
				"[resource-metrics] Failed to list terminal resource sessions",
				error,
			);
		}
	} finally {
		clearTimeout(timeoutId);
	}

	return workspaceSessionMap;
}

export function getWorkspaceMetadata(workspaceId: string): WorkspaceMetadata {
	// Workspace/project display names are hydrated in the renderer from the
	// workspace catalog. Keep stable non-empty placeholders for validation.
	return {
		workspaceName: `Workspace ${workspaceId.slice(0, 8)}`,
		projectId: "host",
		projectName: "Workspaces",
	};
}

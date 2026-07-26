import { useEffect, useRef } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { runV1Migration } from "renderer/lib/v1-migration";

/**
 * Boot trigger for the v1→v2 host-service migration (D2 plan's "Boot
 * trigger with preconditions" work item).
 *
 * v1 workspaces are never registered with the local host service on
 * creation (v1 originally used Electron IPC terminals, not host-service).
 * When the `V1_HOST_SERVICE_TERMINAL` flag routes terminals through
 * host-service, `resolveHostWorkspaceId` fails because host.db has no row
 * for the v1 workspace — the terminal shows "与终端守护进程的连接已丢失".
 *
 * `runV1Migration` is the headless migrator that registers v1
 * projects/workspaces into host-service. It is idempotent (ledger rows
 * with success/linked are skipped) and does NOT trigger the v2 flip —
 * it only registers + returns a `gateComplete` flag the caller may use.
 * Safe to run on every boot while the user is still on v1.
 *
 * This effect runs it once per (organizationId, hostUrl) after the local
 * host service is up. Failures are silent (logged) — D2 retries next boot.
 * M1 only needs the project+workspace registration, so preset/terminal
 * targets are omitted (they never gate the flip and M1 has its own
 * panes-store seed in `seedPanesFromV1Tabs`).
 *
 * Wires in `LocalHostServiceProvider` (which already has the host + org
 * state) rather than via context, so it does not need a child component.
 */
export function useRunV1MigrationOnBoot(
	activeHostUrl: string | null,
	activeOrganizationId: string | null,
): void {
	// Guard against re-running within the same (org, hostUrl) session.
	// runV1Migration is itself idempotent via its ledger, but this avoids
	// re-issuing host calls on every activeHostUrl re-render.
	const lastRunKey = useRef<string | null>(null);

	useEffect(() => {
		if (!activeHostUrl || !activeOrganizationId) return;
		const key = `${activeOrganizationId}\0${activeHostUrl}`;
		if (lastRunKey.current === key) return;
		lastRunKey.current = key;

		const hostClient = getHostServiceClientByUrl(activeHostUrl);
		void runV1Migration({ organizationId: activeOrganizationId, hostClient })
			.then((summary) => {
				console.log("[v1-migration] boot pass complete", {
					gateComplete: summary.gateComplete,
					projects: summary.projects,
					workspaces: summary.workspaces,
				});
			})
			.catch((error) => {
				// Silent per D2: stay on v1, retry next boot. Log for dev.
				console.warn("[v1-migration] boot pass failed:", error);
			});
	}, [activeHostUrl, activeOrganizationId]);
}

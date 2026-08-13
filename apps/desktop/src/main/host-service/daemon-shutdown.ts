import type { DaemonSupervisor } from "@superset/host-service";

/**
 * Release the bundled host-service's daemon ownership on process shutdown.
 * Development is intentionally destructive for fresh bundle iteration;
 * production only drops supervision so PTYs remain reconnectable.
 */
export async function shutdownHostDaemon(options: {
	supervisor: Pick<DaemonSupervisor, "detach" | "stop">;
	organizationId: string;
	isDevelopment: boolean;
}): Promise<void> {
	if (options.isDevelopment) {
		await options.supervisor.stop(options.organizationId);
		return;
	}
	await options.supervisor.detach(options.organizationId);
}

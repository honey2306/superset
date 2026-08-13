import type { SpawnConfig } from "main/lib/host-service-coordinator";

/** Embedded hosts are local-only and require no cloud configuration. */
export function getHostServiceSpawnConfig(): SpawnConfig {
	return {};
}
